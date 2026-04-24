"""
GPIO hardware abstraction for the servo motor and motion sensor.

When running on a Raspberry Pi the real GPIO pins are used. On any other
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
    MOTION_SENSOR_PIN,
    MOTION_POLL_INTERVAL,
)

logger = logging.getLogger(__name__)

# Try importing the Pi GPIO library. Fall back to simulation if unavailable.
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    ON_PI = True
except (ImportError, RuntimeError):
    ON_PI = False
    logger.info("RPi.GPIO unavailable — hardware will be simulated")

SERVO_FREQ = 50  # Standard hobby servo PWM frequency
SERVO_SPIN_SECS = 5.0  # How long the motor spins per lock/unlock (s)


class ServoController:
    """Drives a continuous rotation servo to lock/unlock the door."""

    def __init__(self):
        self._locked = True
        self._pwm = None
        self._busy = threading.Lock()
        self._cancel = threading.Event()
        if ON_PI:
            GPIO.setup(SERVO_PIN, GPIO.OUT)
            self._pwm = GPIO.PWM(SERVO_PIN, SERVO_FREQ)
            self._pwm.start(0)

    def lock(self):
        logger.info("Servo → LOCKED")
        self._locked = True
        self._spin(SERVO_LOCKED_DUTY)

    def unlock(self):
        logger.info("Servo → UNLOCKED")
        self._locked = False
        self._spin(SERVO_UNLOCKED_DUTY)

    @property
    def is_locked(self) -> bool:
        return self._locked

    def cleanup(self):
        self._cancel.set()
        if self._pwm:
            self._pwm.ChangeDutyCycle(0)
            self._pwm.stop()
        if ON_PI:
            GPIO.cleanup(SERVO_PIN)

    def _spin(self, duty: float):
        """
        Spin the motor for SERVO_SPIN_SECS then stop.
        If a new command comes in, cancel the current spin and start the new one.
        """
        self._cancel.set()
        threading.Thread(target=self._do_spin, args=(duty,), daemon=True).start()

    def _do_spin(self, duty: float):
        if not self._pwm:
            return
        self._busy.acquire()
        self._cancel.clear()
        try:
            elapsed = 0.0
            while elapsed < SERVO_SPIN_SECS:
                if self._cancel.is_set():
                    break
                self._pwm.ChangeDutyCycle(duty)
                self._cancel.wait(timeout=0.5)
                elapsed += 0.5
        finally:
            self._pwm.ChangeDutyCycle(0)
            self._busy.release()


class MotionSensor:
    """
    Digital motion sensor on a single GPIO pin.

    The sensor outputs HIGH when motion is detected. A background thread
    polls the pin and fires a callback on rising edges.
    """

    def __init__(self):
        self._on_motion = None  # assigned by main.py at startup
        self._running = False
        self._thread = None
        self._last_state = 0
        if ON_PI:
            GPIO.setup(MOTION_SENSOR_PIN, GPIO.IN)

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("Motion sensor polling started (GPIO %d)", MOTION_SENSOR_PIN)

    def cleanup(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if ON_PI:
            GPIO.cleanup(MOTION_SENSOR_PIN)

    def read(self) -> bool:
        """Take a single reading. Returns True if motion detected."""
        if not ON_PI:
            return False
        return GPIO.input(MOTION_SENSOR_PIN) == 1

    def _poll_loop(self):
        while self._running:
            try:
                triggered = self.read()
                # Fire callback on rising edge (0 → 1)
                if triggered and self._last_state == 0 and self._on_motion:
                    self._on_motion()
                self._last_state = 1 if triggered else 0
            except Exception as exc:
                logger.error("Motion sensor read error: %s", exc)
            time.sleep(MOTION_POLL_INTERVAL)


# Instances
servo = ServoController()
motion_sensor = MotionSensor()
