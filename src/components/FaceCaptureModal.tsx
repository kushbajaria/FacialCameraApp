import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, CameraDevice, PhotoFile, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Colors, Radius, Spacing, Typography } from '../theme';

interface FaceCaptureModalProps {
  visible: boolean;
  memberName: string;
  stepLabel: string;
  guidance: string;
  busy: boolean;
  onCapture: (photo: PhotoFile) => Promise<void>;
  onCancel: () => Promise<void> | void;
}

export default function FaceCaptureModal({
  visible,
  memberName,
  stepLabel,
  guidance,
  busy,
  onCapture,
  onCancel,
}: FaceCaptureModalProps) {
  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const device: CameraDevice | undefined = useCameraDevice('front');

  useEffect(() => {
    if (!visible || hasPermission || permissionRequested) return;
    setPermissionRequested(true);
    requestPermission().catch(() => {
      // Surface permission denial in UI state below.
    });
  }, [visible, hasPermission, permissionRequested, requestPermission]);

  useEffect(() => {
    if (!visible) setPermissionRequested(false);
  }, [visible]);

  const disabled = useMemo(() => busy || capturing, [busy, capturing]);

  const handleCapture = async () => {
    if (!cameraRef.current || disabled) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off', enableShutterSound: false });
      await onCapture(photo);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Face Scan · {memberName}</Text>
            <Text style={styles.subtitle}>{stepLabel} angle</Text>
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => void onCancel()} disabled={disabled}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.previewWrap}>
          {!hasPermission ? (
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>Camera permission required</Text>
              <Text style={styles.stateText}>Allow camera access to continue face enrollment.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => requestPermission()}>
                <Text style={styles.primaryText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : !device ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.stateText}>Loading front camera...</Text>
            </View>
          ) : (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={visible}
              photo
            />
          )}

          <View style={styles.overlayGuide}>
            <View style={styles.oval} />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.guidance}>{guidance}</Text>
          <TouchableOpacity
            style={[styles.captureBtn, disabled && styles.captureBtnDisabled]}
            onPress={() => void handleCapture()}
            disabled={!hasPermission || !device || disabled}
          >
            {disabled ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.captureText}>Capture</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...Typography.screenTitle, fontSize: 20 },
  subtitle: { color: Colors.textDim, fontSize: 12, marginTop: 2 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.surface,
  },
  cancelText: { color: Colors.textMid, fontWeight: '600', fontSize: 12 },
  previewWrap: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    height: 420,
    backgroundColor: '#05070D',
  },
  overlayGuide: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  oval: {
    width: '62%',
    height: '58%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(0,212,255,0.9)',
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  stateTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stateText: { color: Colors.textDim, fontSize: 12, textAlign: 'center' },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryText: { color: '#020304', fontWeight: '800', fontSize: 12 },
  footer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: 12 },
  guidance: { color: Colors.textMid, fontSize: 13, lineHeight: 19 },
  captureBtn: {
    alignSelf: 'center',
    width: 160,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: { opacity: 0.6 },
  captureText: { color: '#020304', fontSize: 15, fontWeight: '800' },
});
