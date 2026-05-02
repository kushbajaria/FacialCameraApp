/**
 * Haptic feedback wrapper — provides consistent tactile feedback across the app.
 * Falls back silently if haptics are unavailable (simulator, unsupported device).
 */

import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
} from 'react-native-haptic-feedback';

const options = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

export function hapticLight() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactLight, options);
}

export function hapticMedium() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactMedium, options);
}

export function hapticHeavy() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.impactHeavy, options);
}

export function hapticSuccess() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationSuccess, options);
}

export function hapticWarning() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationWarning, options);
}

export function hapticError() {
  ReactNativeHapticFeedback.trigger(HapticFeedbackTypes.notificationError, options);
}
