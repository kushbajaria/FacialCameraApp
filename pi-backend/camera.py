"""
Camera streaming (MJPEG) and face recognition service.

Uses picamera2 on Pi hardware, falls back to OpenCV webcam or generates
placeholder frames in simulation mode.
"""

import io
import time
import threading
import logging
import pickle
import numpy as np

logger = logging.getLogger(__name__)

# ── Try to import camera backends ────────────────────────────────────────────
CAMERA_BACKEND = None

try:
    from picamera2 import Picamera2
    CAMERA_BACKEND = "picamera2"
except ImportError:
    pass

if not CAMERA_BACKEND:
    try:
        import cv2
        CAMERA_BACKEND = "opencv"
    except ImportError:
        pass

if not CAMERA_BACKEND:
    logger.warning("No camera backend available — using placeholder frames")

# ── Try to import face_recognition ───────────────────────────────────────────
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except BaseException:
    FACE_RECOGNITION_AVAILABLE = False
    logger.warning("face_recognition not available — face detection will be simulated")


class CameraService:
    """Manages camera capture, MJPEG streaming, and frame access."""

    def __init__(self):
        self._camera = None
        self._lock = threading.Lock()
        self._latest_frame = None  # Raw numpy array (BGR or RGB)
        self._latest_jpeg = None   # Encoded JPEG bytes
        self._running = False
        self._thread = None

    def start(self):
        if self._running:
            return
        self._running = True

        if CAMERA_BACKEND == "picamera2":
            self._camera = Picamera2()
            config = self._camera.create_still_configuration(
                main={"size": (640, 480), "format": "RGB888"}
            )
            self._camera.configure(config)
            self._camera.start()
            time.sleep(1)  # Warm-up
        elif CAMERA_BACKEND == "opencv":
            import cv2
            self._camera = cv2.VideoCapture(0)
            self._camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self._camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info(f"Camera started (backend: {CAMERA_BACKEND or 'placeholder'})")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
        if CAMERA_BACKEND == "picamera2" and self._camera:
            self._camera.stop()
        elif CAMERA_BACKEND == "opencv" and self._camera:
            self._camera.release()
        self._camera = None
        logger.info("Camera stopped")

    def get_frame_rgb(self) -> np.ndarray | None:
        with self._lock:
            return self._latest_frame

    def get_jpeg(self) -> bytes | None:
        with self._lock:
            return self._latest_jpeg

    def generate_mjpeg(self):
        """Yields MJPEG frames for streaming over HTTP."""
        while self._running:
            jpeg = self.get_jpeg()
            if jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
            time.sleep(0.066)  # ~15 fps

    def capture_single_jpeg(self) -> bytes | None:
        """Capture a single frame as JPEG bytes."""
        return self.get_jpeg()

    def _capture_loop(self):
        while self._running:
            try:
                frame = self._read_frame()
                if frame is not None:
                    jpeg = self._encode_jpeg(frame)
                    with self._lock:
                        self._latest_frame = frame
                        self._latest_jpeg = jpeg
            except Exception as e:
                logger.error(f"Camera capture error: {e}")
            time.sleep(0.066)  # ~15 fps

    def _read_frame(self) -> np.ndarray | None:
        if CAMERA_BACKEND == "picamera2" and self._camera:
            return self._camera.capture_array()
        elif CAMERA_BACKEND == "opencv" and self._camera:
            import cv2
            ret, frame = self._camera.read()
            if ret:
                return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return None
        else:
            # Generate a placeholder frame
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:] = (40, 40, 40)  # Dark gray
            return frame

    def _encode_jpeg(self, frame: np.ndarray) -> bytes:
        import cv2
        # Convert RGB to BGR for OpenCV encoding
        bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR) if len(frame.shape) == 3 else frame
        _, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes()


class FaceRecognitionService:
    """Handles face encoding, comparison, and recognition using the face_recognition library."""

    def __init__(self, confidence_threshold: float = 0.6):
        self.confidence_threshold = confidence_threshold

    def encode_face_from_image(self, image_rgb: np.ndarray) -> tuple[bytes | None, float]:
        """
        Detect and encode a face from an RGB image.
        Returns (encoding_bytes, quality_score) or (None, 0.0) if no face found.
        """
        if not FACE_RECOGNITION_AVAILABLE:
            # Simulation: return a fake encoding
            fake = np.random.randn(128).astype(np.float64)
            return pickle.dumps(fake), 0.92

        locations = face_recognition.face_locations(image_rgb, model="hog")
        if not locations:
            return None, 0.0

        encodings = face_recognition.face_encodings(image_rgb, locations)
        if not encodings:
            return None, 0.0

        # Pick the largest face by bounding box area (closest person to camera)
        best_idx = 0
        if len(locations) > 1:
            areas = [(b - t) * (r - l) for t, r, b, l in locations]
            best_idx = int(np.argmax(areas))

        encoding = encodings[best_idx]
        top, right, bottom, left = locations[best_idx]
        face_area = (bottom - top) * (right - left)
        img_area = image_rgb.shape[0] * image_rgb.shape[1]
        quality = min(1.0, (face_area / img_area) * 10)

        return pickle.dumps(encoding), round(quality, 2)

    def encode_face_from_jpeg(self, jpeg_bytes: bytes) -> tuple[bytes | None, float]:
        """Encode a face from raw JPEG bytes."""
        if not FACE_RECOGNITION_AVAILABLE:
            fake = np.random.randn(128).astype(np.float64)
            return pickle.dumps(fake), 0.92

        image = face_recognition.load_image_file(io.BytesIO(jpeg_bytes))
        return self.encode_face_from_image(image)

    def compare_face(
        self, unknown_encoding_bytes: bytes, known_entries: list[dict]
    ) -> tuple[str | None, str | None, float]:
        """
        Compare an unknown face encoding against a list of known entries.
        Each entry: {"encoding": bytes, "member_id": str, "name": str}

        Returns (member_id, name, confidence) or (None, None, 0.0).
        """
        if not known_entries:
            return None, None, 0.0

        unknown = pickle.loads(unknown_encoding_bytes)

        if not FACE_RECOGNITION_AVAILABLE:
            # Simulation: randomly match with 70% probability
            import random
            if random.random() < 0.7 and known_entries:
                entry = random.choice(known_entries)
                return entry["member_id"], entry["name"], 0.85
            return None, None, 0.0

        known_encodings = [pickle.loads(e["encoding"]) for e in known_entries]
        distances = face_recognition.face_distance(known_encodings, unknown)

        best_idx = int(np.argmin(distances))
        best_distance = distances[best_idx]
        confidence = round(1.0 - best_distance, 2)

        if confidence >= self.confidence_threshold:
            entry = known_entries[best_idx]
            return entry["member_id"], entry["name"], confidence

        return None, None, confidence

    def detect_face_in_frame(self, frame_rgb: np.ndarray) -> bool:
        """Quick check: is there a face in this frame?"""
        if not FACE_RECOGNITION_AVAILABLE:
            return False
        locations = face_recognition.face_locations(frame_rgb, model="hog")
        return len(locations) > 0


# ── Singleton instances ──────────────────────────────────────────────────────
camera = CameraService()
face_service = FaceRecognitionService()
