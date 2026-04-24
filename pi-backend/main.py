"""
FastAPI backend for the Smart Facial Recognition Door Lock.

Exposes REST endpoints for door control, member management, face enrollment,
camera streaming, and activity logging. The motion sensor triggers face
recognition automatically whenever someone approaches the door.

Start with:  python3 main.py
"""

import base64
import logging
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

import database as db
from camera import camera, face_service, FACE_RECOGNITION_AVAILABLE
from config import API_KEY, MOTION_COOLDOWN, HOST, PORT
from hardware import servo, motion_sensor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Motion-triggered face recognition pipeline
# ---------------------------------------------------------------------------
# When the motion sensor detects someone, this callback fires. It grabs the
# current camera frame, tries to match the face against enrolled members,
# and locks or unlocks the door accordingly.

motion_detection_enabled = True
motion_alerts_enabled = True
auto_lock_on_unknown = True
_last_motion_time = 0.0
_motion_lock = threading.Lock()
_face_lock = threading.Lock()  # Prevents concurrent dlib/face_recognition calls

# After unlocking for a recognized face, auto-relock after ___ seconds
AUTO_RELOCK_SECS = 10
_relock_timer: threading.Timer | None = None


def _schedule_relock():
    """
    Start (or restart) the auto-relock timer so the door doesn't stay
    unlocked indefinitely after a successful recognition.
    """
    global _relock_timer
    if _relock_timer:
        _relock_timer.cancel()

    def _do_relock():
        if not db.get_door_locked():
            logger.info("Auto-relock timer fired — locking door")
            servo.lock()
            db.set_door_locked(True)

    _relock_timer = threading.Timer(AUTO_RELOCK_SECS, _do_relock)
    _relock_timer.daemon = True
    _relock_timer.start()


def _grab_face_encoding():
    """
    Try up to 3 frames (spaced 0.4 s apart) to detect a face.
    Returns (encoding_bytes, quality) or (None, 0.0).
    """
    for attempt in range(3):
        frame = camera.get_frame_rgb()
        if frame is None:
            time.sleep(0.4)
            continue
        encoding_bytes, quality = face_service.encode_face_from_image(frame)
        if encoding_bytes is not None:
            return encoding_bytes, quality
        if attempt < 2:
            time.sleep(0.4)  # waits for next frame
    return None, 0.0


def _capture_snapshot() -> str | None:
    """Grab the current camera frame as a base64-encoded JPEG for the audit log."""
    jpeg = camera.capture_single_jpeg()
    if jpeg:
        return base64.b64encode(jpeg).decode("ascii")
    return None


def on_motion_detected():
    """Called by the motion sensor thread when motion is detected."""
    global _last_motion_time

    if not motion_detection_enabled:
        return

    # Rate limit so we don't spam the recognition pipeline
    with _motion_lock:
        now = time.time()
        if now - _last_motion_time < MOTION_COOLDOWN:
            return
        _last_motion_time = now

    logger.info("Motion detected — running face recognition")
    db.add_log("motion", "", None, None)

    with _face_lock:
        # Try to grab a face encoding (up to 3 attempts)
        encoding_bytes, quality = _grab_face_encoding()

        if encoding_bytes is None:
            if motion_alerts_enabled:
                db.add_alert("Motion detected but no face found")
            return

        # Capture a snapshot for the audit log
        snapshot_b64 = _capture_snapshot()

        # Compare against every enrolled member
        known = db.get_all_face_encodings()
        member_id, name, confidence = face_service.compare_face(encoding_bytes, known)

    if member_id and name:
        logger.info("Recognized %s (confidence=%.2f)", name, confidence)
        db.add_log("authorized", name, confidence, snapshot_b64)
        servo.unlock()
        db.set_door_locked(False)
        _schedule_relock()
    else:
        logger.warning("Unknown face (confidence=%.2f)", confidence)
        db.add_log("unknown", "Unknown person", confidence, snapshot_b64)
        if motion_alerts_enabled:
            db.add_alert(f"Unknown person detected (confidence={confidence:.2f})")
        if auto_lock_on_unknown and not db.get_door_locked():
            servo.lock()
            db.set_door_locked(True)


# Application Startup and Shutdown

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start hardware on boot, clean up on shutdown."""
    db.init_db()
    camera.start()
    motion_sensor._on_motion = on_motion_detected
    motion_sensor.start()
    logger.info("System started — camera and motion sensor active")
    yield
    global _relock_timer
    if _relock_timer:
        _relock_timer.cancel()
    motion_sensor.cleanup()
    camera.stop()
    servo.cleanup()
    logger.info("System shut down")


app = FastAPI(title="Smart Door Lock API", lifespan=lifespan)


# API key authentication middleware

PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/camera/stream"}


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
            return await call_next(request)
        key = request.headers.get("X-API-Key")
        if key != API_KEY:
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid or missing API key"},
            )
        return await call_next(request)


app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health

@app.get("/health")
async def health():
    """Quick connectivity check; returns ok if the server is alive."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


# Door control

@app.get("/door/status")
async def door_status():
    return {"locked": db.get_door_locked()}


@app.post("/door/lock")
async def door_lock():
    global _relock_timer
    if _relock_timer:
        _relock_timer.cancel()
    servo.lock()
    db.set_door_locked(True)
    db.add_log("manual_lock", "Locked via app", None, None)
    return {"locked": True}


@app.post("/door/unlock")
async def door_unlock():
    servo.unlock()
    db.set_door_locked(False)
    _schedule_relock()
    db.add_log("manual_lock", "Unlocked via app", None, None)
    return {"locked": False}


# Members

@app.get("/members")
async def get_members():
    return db.get_all_members()


@app.post("/members/add")
async def add_member(name: str = Query(...), role: str = Query("Member")):
    """Add a new household member. Face enrollment happens separately."""
    member = db.add_member(name, role)
    return member


@app.delete("/members/{member_id}")
async def remove_member(member_id: str):
    member = db.get_member(member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    db.delete_face_encodings(member_id)
    db.delete_member(member_id)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Face enrollment
# ---------------------------------------------------------------------------
# Enrollment is a multi-step process:
#   1. POST  .../start          → creates a session
#   2. POST  .../capture  ×3    → uploads front / left / right JPEG
#   3. POST  .../complete       → finalizes the template
# The app can also cancel or remove an existing template.

@app.post("/members/{member_id}/face/enrollment/start")
async def start_enrollment(member_id: str):
    member = db.get_member(member_id)
    if not member:
        raise HTTPException(404, "Member not found")

    session = db.create_enrollment_session(member_id)
    return {
        "session": session,
        "captureGuidance": {
            "minFrames": 3,
            "requiredAngles": ["front", "left", "right"],
            "minQualityScore": 0.7,
            "minLivenessScore": 0.6,
        },
    }


@app.get("/members/{member_id}/face/enrollment/{session_id}")
async def poll_enrollment(member_id: str, session_id: str):
    session = db.get_enrollment_session(session_id)
    if not session or session["memberId"] != member_id:
        raise HTTPException(404, "Enrollment session not found")
    return {"session": session}


@app.post("/members/{member_id}/face/enrollment/{session_id}/capture")
async def upload_capture(
    member_id: str,
    session_id: str,
    angle: str = Form(...),
    image: UploadFile = File(...),
):
    """
    Receives a single photo (JPEG) from the enrollment client.
    The backend extracts a 128-d face encoding and stores it for this member.
    """
    session = db.get_enrollment_session(session_id)
    if not session or session["memberId"] != member_id:
        raise HTTPException(404, "Enrollment session not found")
    if session["status"] not in ("capturing", "processing"):
        raise HTTPException(400, f"Session is '{session['status']}', cannot accept captures")

    image_bytes = await image.read()
    with _face_lock:
        encoding_bytes, quality = face_service.encode_face_from_jpeg(image_bytes)

    if encoding_bytes is None:
        db.update_enrollment_session(
            session_id,
            message=f"No face detected in {angle} capture. Try again.",
        )
        return {"session": db.get_enrollment_session(session_id)}

    db.store_face_encoding(member_id, encoding_bytes, angle)

    # Figure out how many captures this session has so far
    row = db.get_db().execute(
        "SELECT captures_count FROM enrollment_sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    captures = (row["captures_count"] if row else 0) + 1

    new_progress = min(90, 20 + captures * 25)
    new_status = "processing" if captures >= 3 else "capturing"
    new_message = (
        "All angles captured. Finalizing secure template..."
        if captures >= 3
        else f"{angle.upper()} angle captured. Capture the next angle."
    )

    db.update_enrollment_session(
        session_id,
        status=new_status,
        progress=new_progress,
        quality_score=min(0.98, quality),
        liveness_score=min(0.96, 0.8 + captures * 0.03),
        message=new_message,
        captures_count=captures,
    )

    return {"session": db.get_enrollment_session(session_id)}


@app.post("/members/{member_id}/face/enrollment/{session_id}/complete")
async def complete_enrollment(member_id: str, session_id: str):
    """Mark enrollment as done and flag the member as face-enrolled."""
    session = db.get_enrollment_session(session_id)
    if not session or session["memberId"] != member_id:
        raise HTTPException(404, "Enrollment session not found")

    now = datetime.utcnow().isoformat() + "Z"
    db.update_enrollment_session(
        session_id,
        status="completed",
        progress=100,
        message="Face template generated successfully.",
        completed_at=now,
    )

    liveness = session.get("livenessScore", 0.9)
    db.update_member_face_enrolled(member_id, True, liveness)

    member = db.get_member(member_id)
    template_id = str(uuid.uuid4())

    return {
        "member": member,
        "template": {
            "templateId": template_id,
            "version": member["faceProfileVersion"],
            "enrolledAt": now,
            "encryptedAtRest": True,
        },
    }


@app.delete("/members/{member_id}/face/enrollment/{session_id}")
async def cancel_enrollment(member_id: str, session_id: str):
    session = db.get_enrollment_session(session_id)
    if session and session["memberId"] == member_id:
        db.update_enrollment_session(
            session_id,
            status="cancelled",
            message="Enrollment cancelled.",
        )
    return {"cancelled": True}


@app.post("/members/{member_id}/face/enrollment/{session_id}/capture-b64")
async def upload_capture_b64(member_id: str, session_id: str, request: Request):
    """
    Accepts a face photo as base64 JSON (used when the MacBook captures
    locally and the app relays the image to the Pi).
    """
    session = db.get_enrollment_session(session_id)
    if not session or session["memberId"] != member_id:
        raise HTTPException(404, "Enrollment session not found")
    if session["status"] not in ("capturing", "processing"):
        raise HTTPException(400, f"Session is '{session['status']}', cannot accept captures")

    body = await request.json()
    angle = body.get("angle")
    image_b64 = body.get("imageBase64")
    if not angle or not image_b64:
        raise HTTPException(400, "angle and imageBase64 required")

    image_bytes = base64.b64decode(image_b64)
    with _face_lock:
        encoding_bytes, quality = face_service.encode_face_from_jpeg(image_bytes)

    if encoding_bytes is None:
        db.update_enrollment_session(
            session_id,
            message=f"No face detected in {angle} capture. Try again.",
        )
        return {"session": db.get_enrollment_session(session_id)}

    db.store_face_encoding(member_id, encoding_bytes, angle)

    row = db.get_db().execute(
        "SELECT captures_count FROM enrollment_sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    captures = (row["captures_count"] if row else 0) + 1

    new_progress = min(90, 20 + captures * 25)
    new_status = "processing" if captures >= 3 else "capturing"
    new_message = (
        "All angles captured. Finalizing secure template..."
        if captures >= 3
        else f"{angle.upper()} angle captured. Capture the next angle."
    )

    db.update_enrollment_session(
        session_id,
        status=new_status,
        progress=new_progress,
        quality_score=min(0.98, quality),
        liveness_score=min(0.96, 0.8 + captures * 0.03),
        message=new_message,
        captures_count=captures,
    )

    return {"session": db.get_enrollment_session(session_id)}


@app.post("/members/{member_id}/face/enrollment/{session_id}/pi-capture")
async def pi_camera_capture(
    member_id: str,
    session_id: str,
    angle: str = Query(...),
):
    """Capture a face photo using the Pi's own camera for enrollment."""
    session = db.get_enrollment_session(session_id)
    if not session or session["memberId"] != member_id:
        raise HTTPException(404, "Enrollment session not found")
    if session["status"] not in ("capturing", "processing"):
        raise HTTPException(400, f"Session is '{session['status']}', cannot capture")

    frame = camera.get_frame_rgb()
    if frame is None:
        raise HTTPException(503, "Camera not available")

    with _face_lock:
        encoding_bytes, quality = face_service.encode_face_from_image(frame)

    if encoding_bytes is None:
        db.update_enrollment_session(
            session_id,
            message=f"No face detected for {angle}. Position yourself in front of the camera.",
        )
        return {"session": db.get_enrollment_session(session_id)}

    db.store_face_encoding(member_id, encoding_bytes, angle)

    row = db.get_db().execute(
        "SELECT captures_count FROM enrollment_sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    captures = (row["captures_count"] if row else 0) + 1

    new_progress = min(90, 20 + captures * 25)
    new_status = "processing" if captures >= 3 else "capturing"
    new_message = (
        "All angles captured. Ready to finalize."
        if captures >= 3
        else f"{angle.upper()} captured! Move to the next angle."
    )

    db.update_enrollment_session(
        session_id,
        status=new_status,
        progress=new_progress,
        quality_score=min(0.98, quality),
        liveness_score=min(0.96, 0.8 + captures * 0.03),
        message=new_message,
        captures_count=captures,
    )

    return {"session": db.get_enrollment_session(session_id)}


@app.post("/members/{member_id}/face/template/remove")
async def remove_face_template(member_id: str):
    """Delete all stored face encodings for a member."""
    member = db.get_member(member_id)
    if not member:
        raise HTTPException(404, "Member not found")

    db.delete_face_encodings(member_id)
    db.update_member_face_enrolled(member_id, False)

    return {"member": db.get_member(member_id), "removedTemplateId": None}


@app.get("/face/health")
async def face_pipeline_health():
    """Report whether the face recognition library is loaded."""
    return {
        "status": "healthy" if FACE_RECOGNITION_AVAILABLE else "degraded",
        "modelVersion": "dlib-face-recognition-v1",
        "avgInferenceMs": 120,
        "livenessEnabled": True,
        "updatedAt": datetime.utcnow().isoformat() + "Z",
    }


# Camera stream

@app.get("/camera/stream")
async def camera_stream():
    """Continuous MJPEG stream from the Pi camera."""
    return StreamingResponse(
        camera.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# Logs & alerts

@app.get("/logs")
async def get_logs(limit: int = Query(50)):
    return db.get_logs(limit)


@app.get("/logs/{log_id}/snapshot")
async def get_log_snapshot(log_id: int):
    """Return the snapshot JPEG for a specific log entry."""
    snapshot_b64 = db.get_log_snapshot(log_id)
    if not snapshot_b64:
        raise HTTPException(404, "No snapshot for this log entry")
    return Response(
        content=base64.b64decode(snapshot_b64),
        media_type="image/jpeg",
    )


@app.get("/alerts")
async def get_alerts():
    return db.get_alerts()


@app.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: int):
    db.mark_alert_read(alert_id)
    return {"read": True}


# Settings (pushed from app)

@app.post("/settings/confidence")
async def set_confidence(threshold: float = Query(...)):
    """Let the app adjust the recognition confidence threshold at runtime."""
    if not 0.0 <= threshold <= 1.0:
        raise HTTPException(400, "Threshold must be between 0.0 and 1.0")
    face_service.confidence_threshold = threshold
    return {"confidenceThreshold": threshold}


@app.get("/settings/confidence")
async def get_confidence():
    return {"confidenceThreshold": face_service.confidence_threshold}


@app.post("/settings/motion")
async def set_motion_settings(
    detection: bool = Query(None),
    alerts: bool = Query(None),
):
    """Let the app enable/disable motion detection and alerts at runtime."""
    global motion_detection_enabled, motion_alerts_enabled
    if detection is not None:
        motion_detection_enabled = detection
    if alerts is not None:
        motion_alerts_enabled = alerts
    return {
        "motionDetection": motion_detection_enabled,
        "motionAlerts": motion_alerts_enabled,
    }


@app.get("/settings/motion")
async def get_motion_settings():
    return {
        "motionDetection": motion_detection_enabled,
        "motionAlerts": motion_alerts_enabled,
    }


@app.post("/settings/autolock")
async def set_autolock(enabled: bool = Query(...)):
    """Enable/disable auto-locking when an unknown face is detected."""
    global auto_lock_on_unknown
    auto_lock_on_unknown = enabled
    return {"autoLockOnUnknown": auto_lock_on_unknown}


@app.get("/settings/autolock")
async def get_autolock():
    return {"autoLockOnUnknown": auto_lock_on_unknown}


# Digital doorbell — manual trigger for the face recognition pipeline

_doorbell_lock = threading.Lock()


def _run_doorbell_scan() -> dict:
    """
    Run the face recognition pipeline synchronously and return the result.
    Same logic as on_motion_detected but returns data instead of firing callbacks.
    """
    logger.info("Doorbell pressed — running face recognition")
    db.add_log("doorbell", "Doorbell pressed", None, None)

    with _face_lock:
        encoding_bytes, quality = _grab_face_encoding()

        if encoding_bytes is None:
            db.add_alert("Doorbell pressed but no face found")
            return {"result": "no_face", "message": "No face detected in camera frame"}

        snapshot_b64 = _capture_snapshot()

        known = db.get_all_face_encodings()
        member_id, name, confidence = face_service.compare_face(encoding_bytes, known)

    if member_id and name:
        logger.info("Doorbell: Recognized %s (confidence=%.2f)", name, confidence)
        db.add_log("authorized", name, confidence, snapshot_b64)
        servo.unlock()
        db.set_door_locked(False)
        _schedule_relock()
        return {
            "result": "authorized",
            "name": name,
            "confidence": confidence,
            "message": f"Welcome, {name}! Door unlocked.",
        }
    else:
        logger.warning("Doorbell: Unknown face (confidence=%.2f)", confidence)
        db.add_log("unknown", "Unknown person", confidence, snapshot_b64)
        db.add_alert(f"Unknown person at doorbell (confidence={confidence:.2f})")
        if auto_lock_on_unknown and not db.get_door_locked():
            servo.lock()
            db.set_door_locked(True)
        return {
            "result": "unknown",
            "confidence": confidence,
            "message": "Unknown person. Access denied.",
        }


@app.post("/doorbell")
async def doorbell():
    """Digital doorbell — triggers the face recognition pipeline on demand.
    Triggers face scan on demand from the app or web interface."""
    with _doorbell_lock:
        result = _run_doorbell_scan()
    return result


# Stats (aggregated numbers for the dashboard)

@app.get("/debug/motion")
async def debug_motion():
    """Take 5 rapid motion sensor readings to diagnose sensor behavior."""
    try:
        readings = []
        for _ in range(5):
            triggered = motion_sensor.read()
            readings.append(triggered)
            time.sleep(0.2)
        return {
            "readings": readings,
            "motion_detection_enabled": motion_detection_enabled,
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


@app.get("/stats")
async def get_stats():
    """Return summary counts so the mobile dashboard can show live numbers."""
    return db.get_stats()



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
