"""
Hardware pin assignments and tuning constants for the door lock system.
"""

# Servo motor — continuous rotation servo for door lock
SERVO_PIN = 18                # BCM pin wired to the servo signal line
SERVO_LOCKED_DUTY = 5.0       # Full speed clockwise (lock direction)
SERVO_UNLOCKED_DUTY = 10.0    # Full speed counter-clockwise (unlock direction)

# Motion sensor — digital output sensor on a single GPIO pin
MOTION_SENSOR_PIN = 17        # BCM pin (physical pin 11) wired to sensor OUT
MOTION_POLL_INTERVAL = 0.3    # How often (seconds) the sensor checks for motion
MOTION_COOLDOWN = 5           # Minimum gap (seconds) between consecutive motion events

# Camera — resolution and quality for the MJPEG stream
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 15
STREAM_JPEG_QUALITY = 80      # 0–100, higher = better quality but more bandwidth

# Face recognition tuning
CONFIDENCE_THRESHOLD = 0.6    # Minimum match score (0–1) to consider a face "recognized"
FACE_MODEL = "hog"            # "hog" is fast on CPU. "cnn" is more accurate but needs GPU
REQUIRED_ANGLES = 3           # Front, left, right — three captures per enrollment

# Server
HOST = "0.0.0.0"
PORT = 8000

# API authentication — shared secret between the Pi and the mobile app
API_KEY = "facialcam-2026-expo-key"
