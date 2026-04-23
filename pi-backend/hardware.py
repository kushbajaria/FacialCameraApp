"""
GPIO hardware abstraction for the servo motor and ultrasonic distance sensor.

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
    ULTRASONIC_TRIG_PIN,
    ULTRASONIC_ECHO_PIN,
    MOTION_THRESHOLD_CM,
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


SERVO_STOP_DUTY = 7.5    # Neutral — motor stops
SERVO_SPIN_SECS = 5.0    # How long the motor spins per lock/unlock (s)

class ServoController:
    """Drives a continuous rotation to the servo to lock/unlock the door."""

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
        self._cancel.set()  # Interrupts any in-progress spin
        threading.Thread(target=self._do_spin, args=(duty,), daemon=True).start()

    def _do_spin(self, duty: float):
        if not self._pwm:
            return
        self._busy.acquire()
        self._cancel.clear()
        try:
            self._pwm.ChangeDutyCycle(duty)
            # Wait for full duration or until cancelled by a new command
            self._cancel.wait(timeout=SERVO_SPIN_SECS)
        finally:
            self._pwm.ChangeDutyCycle(0)  # Stops the motor
            self._busy.release()


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
            time.sleep(0.5)  # lets the sensor settle

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
        """Take a single distance reading. Returns cm (999.0 if in simulation mode)."""
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
            return 999.0  # simulation: nothing is detected

        GPIO.output(ULTRASONIC_TRIG_PIN, True)
        time.sleep(0.00001)
        GPIO.output(ULTRASONIC_TRIG_PIN, False)

        start = time.time()
        deadline = start + 0.04  # 40 ms timeout

        while GPIO.input(ULTRASONIC_ECHO_PIN) == 0:
            start = time.time()
            if start > deadline:
                return 999.0

        end = start
        while GPIO.input(ULTRASONIC_ECHO_PIN) == 1:
            end = time.time()
            if end > deadline:
                return 999.0

        return (end - start) * 17150


# Instances
servo = ServoController()
ultrasonic = UltrasonicSensor()
