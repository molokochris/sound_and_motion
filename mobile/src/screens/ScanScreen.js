import { StyleSheet, Text, View, Pressable } from 'react-native';
import QrScanner from '../QrScanner';

export default function ScanScreen({ onCode, onTypeInstead }) {
  return (
    <View style={styles.fill}>
      <QrScanner
        onScan={(raw) => onCode(raw)}
        onCancel={onTypeInstead}
      />
      <View style={styles.footer}>
        <Text style={styles.brand}>SOUND & MUSIC</Text>
        <Pressable onPress={onTypeInstead}>
          <Text style={styles.alt}>No camera? Type the 4-letter code</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0B0E23' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
    gap: 8,
  },
  brand: { color: '#FFC857', fontWeight: '800', letterSpacing: 2 },
  alt: { color: '#7A7F9E', fontWeight: '600' },
});
