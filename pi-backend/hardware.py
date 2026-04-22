"""
GPIO hardware abstraction for the servo motor and ultrasonic distance sensor.

When running on a Raspberry Pi the real GPIO pins are used.  On any other
platform the classes fall back to simulation mode so the backend can still
start for development and testing.
"""

import logging
import threading
import time

from config import (
    SERVO_PIN,
    SERVO_LOCKED_DUTY,
    SERVO_UNLOCKED_DUTY,
    ULTRASONIC_TRIG_PIN,
    ULTRASONIC_ECHO_PIN,
    MOTION_THRESHOLD_CM,
    MOTION_POLL_INTERVAL,
)

logger = logging.getLogger(__name__)

# Try importing the Pi GPIO library; fall back to simulation if unavailable.
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    ON_PI = True
except (ImportError, RuntimeError):
    ON_PI = False
    logger.info("RPi.GPIO unavailable — hardware will be simulated")

SERVO_FREQ = 50  # Standard hobby servo PWM frequency


class ServoController:
    """Drives a hobby servo to physically lock or unlock the door latch."""

    def __init__(self):
        self._locked = True
        self._pwm = None
        if ON_PI:
            GPIO.setup(SERVO_PIN, GPIO.OUT)
            self._pwm = GPIO.PWM(SERVO_PIN, SERVO_FREQ)
            self._pwm.start(0)
            self._set_duty(SERVO_LOCKED_DUTY)

    def lock(self):
        logger.info("Servo → LOCKED")
        if ON_PI:
            self._set_duty(SERVO_LOCKED_DUTY)
        self._locked = True

    def unlock(self):
        logger.info("Servo → UNLOCKED")
        if ON_PI:
            self._set_duty(SERVO_UNLOCKED_DUTY)
        self._locked = False

    @property
    def is_locked(self) -> bool:
        return self._locked

    def cleanup(self):
        if self._pwm:
            self._pwm.stop()
        if ON_PI:
            GPIO.cleanup(SERVO_PIN)

    def _set_duty(self, duty: float):
        """Send a duty-cycle pulse and then stop to prevent servo jitter."""
        if not self._pwm:
            return
        self._pwm.ChangeDutyCycle(duty)
        time.sleep(0.5)
        self._pwm.ChangeDutyCycle(0)


class UltrasonicSensor:
    """
    HC-SR04 distance sensor — detects someone approaching the door.

    A background thread pings the sensor and fires a callback whenever an
    object appears within MOTION_THRESHOLD_CM.
    """

    def __init__(self):
        self._on_motion = None  # assigned by main.py at startup
        self._running = False
        self._thread = None
        if ON_PI:
            GPIO.setup(ULTRASONIC_TRIG_PIN, GPIO.OUT)
            GPIO.setup(ULTRASONIC_ECHO_PIN, GPIO.IN)
            GPIO.output(ULTRASONIC_TRIG_PIN, False)
            time.sleep(0.5)  # let the sensor settle

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("Ultrasonic sensor polling started")

    def cleanup(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if ON_PI:
            GPIO.cleanup([ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN])

    def measure_once(self) -> float:
        """Take a single distance reading. Returns cm (999.0 if simulated)."""
        return self._measure_cm()

    def _poll_loop(self):
        while self._running:
            try:
                dist = self._measure_cm()
                if dist < MOTION_THRESHOLD_CM and self._on_motion:
                    self._on_motion(round(dist, 1))
            except Exception as exc:
                logger.error("Ultrasonic read error: %s", exc)
            time.sleep(MOTION_POLL_INTERVAL)

    def _measure_cm(self) -> float:
        """Send a 10 µs trigger pulse and time the echo to get distance."""
        if not ON_PI:
            return 999.0  # simulation: nothing detected

        GPIO.output(ULTRASONIC_TRIG_PIN, True)
        time.sleep(0.00001)
        GPIO.output(ULTRASONIC_TRIG_PIN, False)

        start = time.time()
        deadline = start + 0.04  # 40 ms timeout (~680 cm max)

        while GPIO.input(ULTRASONIC_ECHO_PIN) == 0:
            start = time.time()
            if start > deadline:
                return 999.0

        end = start
        while GPIO.input(ULTRASONIC_ECHO_PIN) == 1:
            end = time.time()
            if end > deadline:
                return 999.0

        # speed of sound ≈ 34300 cm/s, halved for the round trip
        return (end - start) * 17150


# Singleton instances imported by the rest of the backend
servo = ServoController()
ultrasonic = UltrasonicSensor()
