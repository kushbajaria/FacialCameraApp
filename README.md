# Smart Facial Recognition Door Lock

A smart door lock system that uses facial recognition to automatically unlock for authorized household members. Built with a React Native iOS app, a Raspberry Pi 4 backend, a servo motor, a motion sensor, and a Pi Camera.

## How It Works

1. **Motion sensor** detects someone at the door
2. **Pi camera** captures a frame and runs face recognition
3. If the face matches an enrolled member, the **servo motor** unlocks the door
4. If the face is unknown, the door stays locked and the app sends an **alert**
5. The door **auto-relocks** after 10 seconds

## Architecture

```
iPhone App  <──HTTP──>  Raspberry Pi 4 (FastAPI)
                              │
                  ┌───────────┼───────────┐
                  │           │           │
            Pi Camera    Servo Motor   Motion Sensor
            (NoIR)       (GPIO 18)     (GPIO 17)
                              │
MacBook  <──HTTP──>  iPhone App  ──>  Pi
(enrollment webcam)    (relays photos)
```

## Components

| Component | Purpose |
|---|---|
| **React Native App** | Dashboard, member management, face enrollment, settings |
| **Pi Backend** (`pi-backend/`) | FastAPI server — face recognition, door control, camera streaming |
| **Enrollment Server** (`enroll_server.py`) | Flask server on MacBook — captures face photos via webcam |
| **Servo Motor** | Continuous rotation servo locks/unlocks the door |
| **Motion Sensor** | Digital output sensor on GPIO 17 triggers face recognition |
| **Pi Camera NoIR** | MJPEG stream + face capture with CLAHE low-light enhancement |

## Hardware Wiring

### Servo Motor (continuous rotation)
| Servo Wire | Pi Pin |
|---|---|
| Signal | GPIO 18 (physical pin 12) |
| VCC | 5V (physical pin 2) |
| GND | GND (physical pin 6) |

### Motion Sensor
| Sensor Pin | Pi Pin |
|---|---|
| OUT | GPIO 17 (physical pin 11) |
| VCC | 5V (physical pin 4) |
| GND | GND (physical pin 9) |

### Pi Camera
Connect via the CSI ribbon cable on the Raspberry Pi.

## Prerequisites

- **Mac**: Node.js 18+, Xcode, CocoaPods, Python 3 (for enrollment server)
- **Raspberry Pi 4**: Python 3.9+, pip, Pi Camera enabled, GPIO access
- **iPhone**: iOS 14+ (connected to the same network as the Pi)

## Setup

### 1. Raspberry Pi Backend

```bash
# SSH into the Pi
ssh pi@<pi-ip-address>

# Clone the repo
git clone <repo-url> ~/facialcamera
cd ~/facialcamera/pi-backend

# Create virtual environment and install dependencies
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn face-recognition dlib numpy opencv-python-headless picamera2 RPi.GPIO

# Run the backend (needs sudo for GPIO access)
sudo /home/pi/facialcamera/pi-backend/venv/bin/python3 main.py
```

The backend starts on `http://0.0.0.0:8000`.

### 2. iOS App

```bash
# On your Mac, in the project root
npm install
cd ios && pod install && cd ..

# Start Metro bundler
npx react-native start

# In another terminal, build and run on your iPhone
npx react-native run-ios --device
```

On first launch, go to **Settings** in the app and set the Pi's IP address.

### 3. MacBook Enrollment Server (optional)

Only needed if you want to use the MacBook webcam for face enrollment instead of the Pi camera.

```bash
# Install dependencies
pip install flask flask-cors opencv-python

# Run the server
python3 enroll_server.py
```

The enrollment server starts on `http://0.0.0.0:8080`.

## Usage

### Enrolling a Face

1. Open the app and go to **Members**
2. Tap **+ Add** to create a new member
3. Tap **Enroll Face** on the member card
4. Choose **Door Camera (Pi)** or **MacBook Camera**
5. Follow the on-screen prompts to capture front, left, and right angles

### Locking / Unlocking

- **Automatic**: The motion sensor triggers face recognition. Recognized members unlock the door automatically.
- **Manual**: Tap the lock button on the Dashboard.
- **Doorbell**: Tap "Ring Doorbell" on the Dashboard to trigger a face scan on demand.

### Monitoring

- **Dashboard**: Live camera feed, lock status, today's entries, alerts
- **Activity**: Full event log with snapshots for each recognized/unknown face
- **Settings**: Adjust confidence threshold, toggle motion detection, auto-lock, and connection settings

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health check |
| GET | `/door/status` | Current lock state |
| POST | `/door/lock` | Lock the door |
| POST | `/door/unlock` | Unlock the door |
| GET | `/members` | List all members |
| POST | `/members/add?name=...` | Add a new member |
| DELETE | `/members/{id}` | Remove a member |
| POST | `/members/{id}/face/enrollment/start` | Start face enrollment session |
| POST | `/members/{id}/face/enrollment/{sid}/capture` | Upload enrollment photo (multipart) |
| POST | `/members/{id}/face/enrollment/{sid}/capture-b64` | Upload enrollment photo (base64 JSON) |
| POST | `/members/{id}/face/enrollment/{sid}/pi-capture?angle=...` | Capture using Pi camera |
| POST | `/members/{id}/face/enrollment/{sid}/complete` | Finalize enrollment |
| POST | `/doorbell` | Trigger face recognition scan |
| GET | `/camera/stream` | MJPEG camera stream |
| GET | `/logs?limit=50` | Activity log |
| GET | `/alerts` | Alert list |
| GET | `/stats` | Dashboard statistics |
| GET | `/debug/motion` | Live motion sensor readings |

All endpoints except `/health`, `/docs`, and `/camera/stream` require the `X-API-Key` header.

## Configuration

Key settings in `pi-backend/config.py`:

| Setting | Default | Description |
|---|---|---|
| `SERVO_PIN` | 18 | BCM pin for servo motor |
| `SERVO_LOCKED_DUTY` | 5.0 | PWM duty cycle for locking (clockwise) |
| `SERVO_UNLOCKED_DUTY` | 10.0 | PWM duty cycle for unlocking (counter-clockwise) |
| `MOTION_SENSOR_PIN` | 17 | BCM pin for motion sensor |
| `MOTION_COOLDOWN` | 5s | Minimum gap between motion events |
| `CONFIDENCE_THRESHOLD` | 0.6 | Minimum face match score (0-1) |
| `API_KEY` | `facialcam-2026-expo-key` | Shared API key |

## Troubleshooting

- **Motion sensor reads nothing**: Run with `sudo` — GPIO needs root access
- **Camera not working**: Ensure the Pi Camera is enabled in `raspi-config` under Interface Options
- **App can't reach Pi**: Make sure the phone and Pi are on the same network. Check the IP in Settings.
- **Servo twitching**: Adjust `SERVO_LOCKED_DUTY` / `SERVO_UNLOCKED_DUTY` in `config.py`. Values between 3.0-12.0 work for most continuous rotation servos.
