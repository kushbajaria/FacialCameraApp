# Security & Feature Enhancements — Design Spec

**Date:** 2026-04-22
**Context:** School expo competition. System is a facial recognition door lock (React Native app + Raspberry Pi backend). Core recognition pipeline, hardware control, and app UI are complete. This spec covers the remaining gaps identified from the project abstract.

---

## 1. Event Snapshots

**Goal:** Capture a JPEG frame whenever a face event occurs so homeowners can see who was at the door.

**Backend changes (`main.py`, `camera.py`, `database.py`):**
- In `on_motion_detected()`, after face encoding succeeds, call `camera.capture_single_jpeg()` to grab the current frame.
- Base64-encode the JPEG and pass it as the `snapshot` parameter to `db.add_log()`.
- Add endpoint `GET /logs/{log_id}/snapshot` that returns the raw JPEG bytes (`image/jpeg` content type). Returns 404 if no snapshot exists.

**App changes (`ActivityScreen.tsx`):**
- For log entries where `snapshot` is non-null, show a small thumbnail (tappable to view full-size).
- Build the snapshot URL from `{piBaseUrl}/logs/{id}/snapshot`.

**Data:** Snapshots are stored as base64 text in the existing `snapshot TEXT` column. At ~640x480 JPEG quality 80, each snapshot is ~30-50KB base64. Acceptable for SQLite given the access frequency.

---

## 2. API Authentication

**Goal:** Prevent unauthorized network access to the door lock API.

**Mechanism:** Shared API key checked via FastAPI middleware.

**Backend changes (`config.py`, `main.py`):**
- Add `API_KEY` constant to `config.py` with a default value (e.g., `"changeme-door-lock-key"`).
- Add FastAPI middleware that checks `X-API-Key` header on every request.
- Exempt routes: `GET /health` (connectivity check needs to work unauthenticated).
- Return `403 Forbidden` with `{"detail": "Invalid API key"}` on mismatch.

**App changes (`api.ts`, `config.ts`, `SettingsScreen.tsx`):**
- Store API key in `AsyncStorage` under `@settings_api_key`.
- `getApiClient()` reads the key and attaches it as `X-API-Key` header to every request.
- Add an "API Key" field in Settings under the Connection section (masked input, editable).
- `config.ts`: add `getApiKey()` / `setApiKey()` helpers.

**Enrollment server (`enroll_server.py`):**
- When calling Pi endpoints, include the `X-API-Key` header. Accept the key as a CLI argument or env var.

---

## 3. Auto-Lock Setting Sync

**Goal:** Make the "auto-lock on unknown face" toggle actually control backend behavior.

**Backend changes (`main.py`, `config.py`):**
- Add global `auto_lock_on_unknown = True`.
- Add `POST /settings/autolock?enabled=bool` and `GET /settings/autolock` endpoints.
- In `on_motion_detected()`, gate the unknown-face lock logic on `auto_lock_on_unknown`.

**App changes (`SettingsScreen.tsx`):**
- On mount, fetch `GET /settings/autolock` to sync state.
- On toggle, call `POST /settings/autolock?enabled=...` in addition to saving locally.

---

## 4. Adaptive Lighting Preprocessing (CLAHE)

**Goal:** Improve face recognition accuracy under varying lighting conditions.

**Backend changes (`camera.py`):**
- Add a `_apply_clahe(frame)` static method to `FaceRecognitionService`.
- Convert frame to LAB color space, apply CLAHE to the L channel, convert back.
- Call this in `encode_face_from_image()` before passing to `face_recognition.face_locations()`.
- Also apply in `encode_face_from_jpeg()`.
- CLAHE parameters: `clipLimit=2.0`, `tileGridSize=(8, 8)` (OpenCV defaults, well-tested).

---

## 5. Enhanced Polling Notifications

**Goal:** Alert the user in-app when new stranger alerts arrive, even if they're not on the Activity screen.

**App changes (`AlertContext.tsx`, `App.tsx`):**
- In `AlertContext`, add a background polling loop (every 5s) that fetches `GET /alerts`.
- Track `lastSeenAlertId` in state.
- When new unread alerts appear with IDs > `lastSeenAlertId`, trigger a React Native `Alert.alert()` showing the alert label.
- Use `Vibration.vibrate()` for haptic feedback.
- Update `lastSeenAlertId` after notifying.

---

## 6. Pi-Camera Enrollment

**Goal:** Allow face enrollment using the Pi's own camera, without needing the MacBook server.

**Backend changes (`main.py`, `camera.py`):**
- Add `POST /members/{member_id}/face/enrollment/pi-capture` endpoint.
- Accepts `session_id` and `angle` as query params.
- Grabs the current frame from `camera.get_frame_rgb()`, encodes the face, stores it.
- Updates the enrollment session progress (same logic as the upload endpoint but using live camera).
- Add `POST /members/{member_id}/face/enrollment/{session_id}/pi-complete` that finalizes — same as `complete_enrollment` but triggered after Pi captures.

**App changes (`MembersScreen.tsx`):**
- Add a "Use Door Camera" option alongside the existing MacBook enrollment flow.
- When selected: start enrollment session, then call pi-capture 3 times (with guidance text for front/left/right), then complete.
- Show progress bar and angle instructions between captures.

---

## Files Modified

| File | Changes |
|------|---------|
| `pi-backend/config.py` | Add `API_KEY` |
| `pi-backend/main.py` | Auth middleware, snapshot capture, auto-lock sync, pi-capture endpoint |
| `pi-backend/camera.py` | CLAHE preprocessing |
| `pi-backend/database.py` | Snapshot retrieval endpoint helper |
| `pi-backend/hardware.py` | No changes |
| `src/services/api.ts` | API key header, new endpoints, pi-capture functions |
| `src/services/config.ts` | API key storage helpers |
| `src/screens/SettingsScreen.tsx` | API key field, auto-lock sync |
| `src/screens/ActivityScreen.tsx` | Snapshot thumbnails |
| `src/screens/MembersScreen.tsx` | Pi-camera enrollment option |
| `src/contexts/AlertContext.tsx` | Background alert polling + in-app notifications |
| `enroll_server.py` | API key header on Pi calls |
