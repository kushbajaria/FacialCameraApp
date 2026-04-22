"""
MacBook face enrollment server.
Start once: python3 enroll_server.py
The app triggers this server to open the webcam and capture face photos.

Architecture: Flask runs in a background thread, OpenCV GUI runs on the main thread.
"""

import os
import queue
import threading
import time
import cv2
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

PI_URL = os.environ.get("PI_URL", "http://172.20.10.4:8000")
PI_API_KEY = os.environ.get("PI_API_KEY", "facialcam-2026-expo-key")

ANGLES = ["front", "left", "right"]
ANGLE_INSTRUCTIONS = {
    "front": "Look straight at the camera",
    "left": "Turn your head slightly LEFT",
    "right": "Turn your head slightly RIGHT",
}

# Shared state
capture_queue = queue.Queue()  # Main thread picks up capture jobs
status = {"status": "idle", "progress": 0, "message": "Ready"}
status_lock = threading.Lock()


def set_status(s, progress=0, message="", **extra):
    global status
    with status_lock:
        status = {"status": s, "progress": progress, "message": message, **extra}


def get_status():
    with status_lock:
        return dict(status)


# ── Flask app (runs in background thread) ───────────────────────────────────

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "macbook-enrollment"})


@app.route("/enroll", methods=["POST"])
def start_enrollment():
    data = request.json or {}
    member_id = data.get("memberId")
    session_id = data.get("sessionId")

    if not member_id or not session_id:
        return jsonify({"error": "memberId and sessionId required"}), 400

    current = get_status()
    if current["status"] in ("capturing", "starting"):
        return jsonify({"error": "Enrollment already in progress"}), 409

    set_status("starting", 0, "Opening MacBook camera...")
    capture_queue.put((member_id, session_id))

    return jsonify({"status": "started", "message": "Webcam capture starting on MacBook"})


@app.route("/enroll/status", methods=["GET"])
def enrollment_status():
    return jsonify(get_status())


def run_flask():
    app.run(host="0.0.0.0", port=8080, threaded=True)


# ── OpenCV capture (runs on main thread) ────────────────────────────────────

def run_capture(member_id, session_id):
    """Opens webcam, captures 3 angles with countdown, uploads to Pi."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        set_status("error", 0, "Could not open MacBook webcam")
        return

    try:
        for i, angle in enumerate(ANGLES):
            instruction = ANGLE_INSTRUCTIONS[angle]
            set_status("capturing", i * 30, f"Capturing {angle} ({i+1}/3) — {instruction}")

            countdown = 3
            start = time.time()

            while True:
                ret, frame = cap.read()
                if not ret:
                    set_status("error", 0, "Camera read error")
                    return

                h, w = frame.shape[:2]
                cx, cy = w // 2, h // 2

                # Face guide
                cv2.ellipse(frame, (cx, cy), (130, 170), 0, 0, 360, (0, 212, 255), 2)
                cv2.putText(frame, f"{angle.upper()}: {instruction}",
                            (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 212, 255), 2)

                elapsed = time.time() - start
                remaining = countdown - int(elapsed)

                if remaining > 0:
                    cv2.putText(frame, str(remaining),
                                (cx - 20, cy + 15), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 255, 200), 4)
                    cv2.imshow("Face Enrollment", frame)
                    if cv2.waitKey(30) & 0xFF == ord('q'):
                        set_status("error", 0, "Cancelled by user")
                        return
                else:
                    # Capture clean frame
                    ret2, clean = cap.read()
                    if not ret2:
                        set_status("error", 0, "Camera read error during capture")
                        return

                    _, jpeg = cv2.imencode(".jpg", clean, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    jpeg_bytes = jpeg.tobytes()

                    set_status("capturing", i * 30 + 15, f"Uploading {angle} to Pi...")

                    try:
                        r = requests.post(
                            f"{PI_URL}/members/{member_id}/face/enrollment/{session_id}/capture",
                            files={"image": (f"face-{angle}.jpg", jpeg_bytes, "image/jpeg")},
                            data={"angle": angle},
                            headers={"X-API-Key": PI_API_KEY},
                            timeout=12,
                        )
                        r.raise_for_status()
                        session_data = r.json().get("session", {})

                        if "no face" in session_data.get("message", "").lower():
                            set_status("capturing", i * 30, f"No face detected — retrying {angle}...")
                            start = time.time()
                            countdown = 4
                            continue

                        set_status("capturing", session_data.get("progress", (i+1)*30),
                                   session_data.get("message", f"{angle} captured!"))
                    except Exception as e:
                        set_status("error", 0, f"Upload failed: {e}")
                        return

                    # Brief pause between angles
                    if i < len(ANGLES) - 1:
                        for c in range(2, 0, -1):
                            ret, frame = cap.read()
                            if ret:
                                next_angle = ANGLES[i + 1]
                                cv2.putText(frame, f"Next: {next_angle.upper()} in {c}...",
                                            (cx - 160, cy), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 200), 2)
                                cv2.imshow("Face Enrollment", frame)
                                cv2.waitKey(1000)
                    break

        # Complete enrollment
        set_status("completing", 90, "Finalizing enrollment...")
        try:
            r = requests.post(
                f"{PI_URL}/members/{member_id}/face/enrollment/{session_id}/complete",
                json={"memberId": member_id, "sessionId": session_id},
                headers={"X-API-Key": PI_API_KEY},
                timeout=5,
            )
            r.raise_for_status()
            result = r.json()
            set_status("completed", 100, "Face enrolled successfully!", member=result.get("member"))
        except Exception as e:
            set_status("error", 0, f"Completion failed: {e}")

    finally:
        cap.release()
        cv2.destroyAllWindows()


def main_loop():
    """Main thread loop — waits for capture jobs and runs OpenCV GUI."""
    while True:
        try:
            member_id, session_id = capture_queue.get(timeout=0.1)
            try:
                run_capture(member_id, session_id)
            except Exception as e:
                print(f"[ERROR] Capture failed: {e}")
                set_status("error", 0, f"Capture crashed: {e}")
        except queue.Empty:
            # Keep the main thread alive — only call waitKey if a window exists
            try:
                cv2.waitKey(1)
            except cv2.error:
                time.sleep(0.1)


if __name__ == "__main__":
    print("=" * 50)
    print("MacBook Face Enrollment Server")
    print(f"Listening on http://172.20.10.3:8080")
    print(f"Pi backend: {PI_URL}")
    print("=" * 50)
    print("Ready — waiting for enrollment requests from app...")

    # Start Flask in background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Run OpenCV on main thread
    main_loop()
