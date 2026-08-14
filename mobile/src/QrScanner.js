// Native QR scanner — mobile only. Do not import this from the web host.
// Reads the host-screen QR and returns the raw string (usually a join URL).

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function QrScanner({ onScan, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Checking camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access</Text>
        <Text style={styles.hint}>Needed to scan the host QR and join a room.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>ALLOW CAMERA</Text>
        </Pressable>
        {onCancel ? (
          <Pressable style={styles.link} onPress={onCancel}>
            <Text style={styles.linkText}>Type the code instead</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (locked || !data) return;
          setLocked(true);
          onScan(String(data));
        }}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.overlayTitle}>Scan the host QR</Text>
        <View style={styles.frame} />
        <Text style={styles.overlayHint}>Point at the code on the big screen</Text>
        {onCancel ? (
          <Pressable style={styles.link} onPress={onCancel}>
            <Text style={styles.linkText}>Type the code instead</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0B0E23' },
  center: {
    flex: 1,
    backgroundColor: '#0B0E23',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  title: { color: '#FFC857', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  hint: { color: '#F4E9D8', textAlign: 'center', fontSize: 15, lineHeight: 22 },
  btn: {
    backgroundColor: '#FF7A3D',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    marginTop: 8,
  },
  btnText: { color: '#1B0E08', fontWeight: '800', letterSpacing: 1 },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingBottom: 48,
  },
  overlayTitle: { color: '#FFC857', fontSize: 18, fontWeight: '800' },
  overlayHint: { color: '#F4E9D8', fontSize: 14 },
  frame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: '#FFC857',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  link: { padding: 12 },
  linkText: { color: '#FFC857', fontWeight: '700' },
});
