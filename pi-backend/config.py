"""
Hardware pin assignments and tuning constants for the door lock system.

Pin numbers use BCM (Broadcom) numbering. Adjust SERVO_PIN, ULTRASONIC pins,
and threshold values to match your wiring and environment.
"""

# Servo motor — controls the physical door latch
SERVO_PIN = 18                # BCM pin wired to the servo signal line
SERVO_LOCKED_DUTY = 2.5       # PWM duty cycle when door is locked  (~0 degrees)
SERVO_UNLOCKED_DUTY = 12.5    # PWM duty cycle when door is open    (~180 degrees)

# Ultrasonic sensor (HC-SR04) — detects someone approaching the door
ULTRASONIC_TRIG_PIN = 23      # BCM pin wired to the TRIG input
ULTRASONIC_ECHO_PIN = 24      # BCM pin wired to the ECHO output
MOTION_THRESHOLD_CM = 50      # Anything closer than 50 cm counts as "someone is here"
MOTION_POLL_INTERVAL = 0.5    # How often (seconds) the sensor checks for motion
MOTION_COOLDOWN = 5           # Minimum gap (seconds) between consecutive motion events

# Camera — resolution and quality for the MJPEG stream
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 15
STREAM_JPEG_QUALITY = 80      # 0–100, higher = better quality but more bandwidth

# Face recognition tuning
CONFIDENCE_THRESHOLD = 0.6    # Minimum match score (0–1) to consider a face "recognized"
FACE_MODEL = "hog"            # "hog" is fast on CPU; "cnn" is more accurate but needs GPU
REQUIRED_ANGLES = 3           # Front, left, right — three captures per enrollment

# Server
HOST = "0.0.0.0"
PORT = 8000
