"""
MacBook face enrollment server.
Start once: python3 enroll_server.py
The app triggers this server to open the webcam and capture face photos.

Architecture: Flask runs in a background thread, OpenCV GUI runs on the main thread.

The MacBook does NOT talk to the Pi. It only captures photos locally.
The mobile app downloads the photos from here and uploads them to the Pi.
"""

import queue
import threading
import time
import cv2
from flask import Flask, jsonify, request
from flask_cors import CORS

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
captured_images = {}  # angle -> JPEG bytes (stored after capture for app to download)
captured_images_lock = threading.Lock()


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

    if not member_id:
        return jsonify({"error": "memberId required"}), 400

    current = get_status()
    if current["status"] in ("capturing", "starting"):
        return jsonify({"error": "Enrollment already in progress"}), 409

    set_status("starting", 0, "Opening MacBook camera...")
    capture_queue.put((member_id, data.get("sessionId", "")))

    return jsonify({"status": "started", "message": "Webcam capture starting on MacBook"})


@app.route("/enroll/status", methods=["GET"])
def enrollment_status():
    return jsonify(get_status())


@app.route("/enroll/capture/<angle>", methods=["GET"])
def get_capture(angle):
    """Download a captured JPEG as base64 JSON by angle name (front/left/right)."""
    import base64
    with captured_images_lock:
        jpeg = captured_images.get(angle)
    if jpeg is None:
        return jsonify({"error": f"No capture for angle '{angle}'"}), 404
    return jsonify({"angle": angle, "imageBase64": base64.b64encode(jpeg).decode("ascii")})


def run_flask():
    app.run(host="0.0.0.0", port=8080, threaded=True)


# ── OpenCV capture (runs on main thread) ────────────────────────────────────

def run_capture(member_id, session_id):
    """Opens webcam, captures 3 angles with countdown, stores locally.
    The mobile app downloads the images and uploads them to the Pi."""
    # Clear any previous captures
    with captured_images_lock:
        captured_images.clear()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        set_status("error", 0, "Could not open MacBook webcam")
        return

    try:
        for i, angle in enumerate(ANGLES):
            instruction = ANGLE_INSTRUCTIONS[angle]
            with captured_images_lock:
                done_angles = list(captured_images.keys())
            set_status("capturing", i * 30, f"Capturing {angle} ({i+1}/3) — {instruction}",
                       capturedAngles=done_angles)

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

                    # Store locally — the app will download and upload to Pi
                    with captured_images_lock:
                        captured_images[angle] = jpeg_bytes
                        done_angles = list(captured_images.keys())

                    set_status("capturing", (i + 1) * 30,
                               f"{angle.upper()} captured!",
                               capturedAngles=done_angles)

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

        # All 3 captured locally — tell the app to finalize
        with captured_images_lock:
            angles = list(captured_images.keys())
        set_status("captured_all", 90, "All photos captured! Uploading to Pi...",
                   capturedAngles=angles)

    finally:
        cap.release()
        cv2.destroyAllWindows()
        # Do NOT reset status here — the app still needs to download the images


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
    print("=" * 60)
    print("  MacBook Face Enrollment Server")
    print(f"  Listening on http://0.0.0.0:8080")
    print()
    print("  This server captures photos locally.")
    print("  The app downloads them and uploads to the Pi.")
    print("=" * 60)
    print("Ready — waiting for enrollment requests from app...")

    # Start Flask in background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Run OpenCV on main thread
    main_loop()
