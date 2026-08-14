import { StyleSheet, Text, View, Pressable } from 'react-native';

function Hold({ label, style, textStyle, onHold }) {
  return (
    <Pressable
      style={style}
      onPressIn={() => onHold(true)}
      onPressOut={() => onHold(false)}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

export default function PlayScreen({ screen, name, color, alive, score, endTitle, endDetail, beat, onInput }) {
  if (screen === 'waiting') {
    return (
      <View style={styles.center}>
        <View style={[styles.dot, { backgroundColor: color || '#4ECDC4' }]} />
        <Text style={styles.sub}>You're in as {name}</Text>
        <Text style={styles.hint}>Waiting for the host to start the joust…</Text>
      </View>
    );
  }

  if (screen === 'end') {
    return (
      <View style={styles.center}>
        <Text style={styles.brand}>{endTitle || 'GAME OVER'}</Text>
        <Text style={styles.hint}>{endDetail || 'Watch the big screen.'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, beat && styles.beat]}>
      <View style={styles.hud}>
        <Text style={[styles.status, !alive && styles.dead]}>{alive ? 'ALIVE' : 'OUT'}</Text>
        <Text style={styles.score}>{score}</Text>
      </View>
      <Hold
        label="◀"
        style={[styles.zone, styles.left]}
        textStyle={styles.zoneText}
        onHold={(v) => onInput('left', v)}
      />
      <Hold
        label="▶"
        style={[styles.zone, styles.right]}
        textStyle={styles.zoneText}
        onHold={(v) => onInput('right', v)}
      />
      <Hold
        label="FLAP"
        style={styles.flap}
        textStyle={styles.flapText}
        onHold={(v) => onInput('flap', v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#0B0E23' },
  beat: { backgroundColor: '#1B1F3B' },
  center: {
    flex: 1,
    backgroundColor: '#0B0E23',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  brand: { color: '#FFC857', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#F4E9D8', fontWeight: '800', fontSize: 16 },
  hint: { color: '#7A7F9E', textAlign: 'center', maxWidth: 280 },
  dot: { width: 64, height: 64, borderRadius: 32, marginBottom: 8 },
  hud: {
    position: 'absolute',
    top: 48,
    left: 18,
    right: 18,
    zIndex: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  status: { color: '#6BCB77', fontWeight: '800', letterSpacing: 1 },
  dead: { color: '#E63946' },
  score: { color: '#FFC857', fontWeight: '800' },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
  },
  left: { left: 0, paddingLeft: 18 },
  right: { right: 0, paddingRight: 18, alignItems: 'flex-end' },
  zoneText: { color: 'rgba(244,233,216,0.2)', fontSize: 36 },
  flap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 40,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#FF7A3D',
    backgroundColor: 'rgba(255,122,61,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    left: '50%',
    marginLeft: -55,
  },
  flapText: { color: '#F4E9D8', fontWeight: '800', letterSpacing: 1 },
});
