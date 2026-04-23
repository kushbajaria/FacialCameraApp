"""
MacBook face enrollment server.
Start once: python3 enroll_server.py
The app triggers this server to open the webcam and capture face photos.

Architecture: Flask runs in a background thread, OpenCV GUI runs on the main thread.
"""

import os
import queue
import socket
import threading
import time
import urllib3
import cv2
import requests
from requests.adapters import HTTPAdapter
from flask import Flask, jsonify, request, Response
from flask_cors import CORS

PI_URL = os.environ.get("PI_URL", "http://172.20.10.4:8000")
PI_API_KEY = os.environ.get("PI_API_KEY", "facialcam-2026-expo-key")

# Force IPv4 and bypass macOS proxy to fix "No route to host" on Anaconda Python
class ForceIPv4Adapter(HTTPAdapter):
    """Forces urllib3 to use IPv4 only — fixes Anaconda/macOS routing issues."""
    def init_poolmanager(self, *args, **kwargs):
        kwargs["socket_options"] = urllib3.connection.HTTPConnection.default_socket_options
        super().init_poolmanager(*args, **kwargs)

    def send(self, request, **kwargs):
        # Resolve hostname to IPv4 explicitly
        from urllib.parse import urlparse
        parsed = urlparse(request.url)
        hostname = parsed.hostname
        if hostname:
            try:
                ipv4 = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
                request.url = request.url.replace(hostname, ipv4, 1)
            except socket.gaierror:
                pass
        return super().send(request, **kwargs)

pi_session = requests.Session()
pi_session.trust_env = False
pi_session.headers.update({"X-API-Key": PI_API_KEY})
pi_session.mount("http://", ForceIPv4Adapter())
pi_session.mount("https://", ForceIPv4Adapter())

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


DOORBELL_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Smart Door — Doorbell</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0C0F14; color: #E8EAED;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100vh; gap: 32px;
  }
  h1 { font-size: 28px; font-weight: 700; color: #E8EAED; }
  .subtitle { font-size: 14px; color: #6B7280; margin-top: 4px; }
  .doorbell-btn {
    width: 200px; height: 200px; border-radius: 50%;
    background: linear-gradient(145deg, #3B82F6, #2563EB);
    border: 4px solid #60A5FA; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 64px; transition: all 0.15s ease;
    box-shadow: 0 0 40px rgba(59, 130, 246, 0.3);
    user-select: none;
  }
  .doorbell-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 0 60px rgba(59, 130, 246, 0.5);
  }
  .doorbell-btn:active {
    transform: scale(0.95);
    background: linear-gradient(145deg, #2563EB, #1D4ED8);
  }
  .doorbell-btn.scanning {
    background: linear-gradient(145deg, #F59E0B, #D97706);
    border-color: #FBBF24;
    box-shadow: 0 0 40px rgba(245, 158, 11, 0.3);
    animation: pulse 1.5s ease-in-out infinite;
    pointer-events: none;
  }
  .doorbell-btn.authorized {
    background: linear-gradient(145deg, #10B981, #059669);
    border-color: #34D399;
    box-shadow: 0 0 60px rgba(16, 185, 129, 0.5);
  }
  .doorbell-btn.denied {
    background: linear-gradient(145deg, #EF4444, #DC2626);
    border-color: #F87171;
    box-shadow: 0 0 60px rgba(239, 68, 68, 0.5);
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
  }
  #status {
    font-size: 18px; font-weight: 600; text-align: center;
    min-height: 28px; transition: color 0.3s;
  }
  #detail {
    font-size: 14px; color: #6B7280; text-align: center;
    min-height: 20px;
  }
  .camera-frame {
    width: 320px; height: 240px; border-radius: 12px;
    overflow: hidden; background: #1A1D24; border: 1px solid #2A2D35;
  }
  .camera-frame img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .pi-info {
    font-size: 12px; color: #4B5563; position: fixed; bottom: 16px;
  }
</style>
</head>
<body>
  <h1>Smart Door Doorbell<br><span class="subtitle">Tap the button to ring</span></h1>

  <div class="camera-frame">
    <img id="cam" alt="Live camera" />
  </div>

  <button class="doorbell-btn" id="btn" onclick="ring()">&#x1F514;</button>

  <div>
    <div id="status">Ready</div>
    <div id="detail">Press the doorbell to scan</div>
  </div>

  <div class="pi-info" id="pi-info"></div>

  <script>
    // Config is injected by the server via query params
    const params = new URLSearchParams(window.location.search);
    const PI = params.get("pi") || "http://172.20.10.4:8000";
    const KEY = params.get("key") || "";
    document.getElementById("pi-info").textContent = "Pi: " + PI;
    document.getElementById("cam").src = PI + "/camera/stream";

    const btn = document.getElementById("btn");
    const statusEl = document.getElementById("status");
    const detailEl = document.getElementById("detail");

    const ICONS = { bell: "\u{1F514}", check: "\u2714", cross: "\u2718", question: "?" };
    let busy = false;

    async function ring() {
      if (busy) return;
      busy = true;
      btn.className = "doorbell-btn scanning";
      statusEl.textContent = "Scanning face...";
      statusEl.style.color = "#F59E0B";
      detailEl.textContent = "Looking at camera feed";

      try {
        const res = await fetch(PI + "/doorbell", {
          method: "POST",
          headers: { "X-API-Key": KEY },
        });
        const data = await res.json();

        if (data.result === "authorized") {
          btn.className = "doorbell-btn authorized";
          btn.textContent = ICONS.check;
          statusEl.textContent = data.message;
          statusEl.style.color = "#10B981";
          detailEl.textContent = "Confidence: " + Math.round((data.confidence || 0) * 100) + "%";
        } else if (data.result === "unknown") {
          btn.className = "doorbell-btn denied";
          btn.textContent = ICONS.cross;
          statusEl.textContent = data.message;
          statusEl.style.color = "#EF4444";
          detailEl.textContent = "Confidence: " + Math.round((data.confidence || 0) * 100) + "%";
        } else {
          btn.className = "doorbell-btn denied";
          btn.textContent = ICONS.question;
          statusEl.textContent = data.message;
          statusEl.style.color = "#F59E0B";
          detailEl.textContent = "Try positioning yourself in front of the camera";
        }
      } catch (e) {
        btn.className = "doorbell-btn denied";
        statusEl.textContent = "Connection error";
        statusEl.style.color = "#EF4444";
        detailEl.textContent = e.message;
      }

      setTimeout(() => {
        btn.className = "doorbell-btn";
        btn.textContent = ICONS.bell;
        statusEl.textContent = "Ready";
        statusEl.style.color = "#E8EAED";
        detailEl.textContent = "Press the doorbell to scan";
        busy = false;
      }, 4000);
    }
  </script>
</body>
</html>"""


@app.route("/doorbell", methods=["GET"])
def doorbell_page():
    """Serve a web page with a big doorbell button for the demo."""
    return Response(DOORBELL_HTML, content_type="text/html")


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
                        r = pi_session.post(
                            f"{PI_URL}/members/{member_id}/face/enrollment/{session_id}/capture",
                            files={"image": (f"face-{angle}.jpg", jpeg_bytes, "image/jpeg")},
                            data={"angle": angle},
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
            r = pi_session.post(
                f"{PI_URL}/members/{member_id}/face/enrollment/{session_id}/complete",
                json={"memberId": member_id, "sessionId": session_id},
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
    doorbell_url = f"http://localhost:8080/doorbell?pi={PI_URL}&key={PI_API_KEY}"
    print("=" * 60)
    print("  MacBook Face Enrollment Server")
    print(f"  Listening on http://0.0.0.0:8080")
    print(f"  Pi backend: {PI_URL}")
    print()
    print(f"  DOORBELL PAGE: {doorbell_url}")
    print("=" * 60)
    print("Ready — waiting for enrollment requests from app...")

    # Start Flask in background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Run OpenCV on main thread
    main_loop()
