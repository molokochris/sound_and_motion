import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';

export default function JoinScreen({ room, name, error, joining, onChangeRoom, onChangeName, onJoin, onRescan }) {
  const [localRoom, setLocalRoom] = useState(room || '');
  const [localName, setLocalName] = useState(name || '');

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>SOUND & MUSIC</Text>
      <Text style={styles.sub}>Your phone is the joust.</Text>

      <Text style={styles.label}>ROOM CODE</Text>
      <TextInput
        style={styles.code}
        value={localRoom}
        maxLength={4}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD"
        placeholderTextColor="#4A4E69"
        onChangeText={(t) => {
          const next = t.toUpperCase().replace(/[^A-Z]/g, '');
          setLocalRoom(next);
          onChangeRoom(next);
        }}
      />

      <Text style={styles.label}>YOUR NAME</Text>
      <TextInput
        style={styles.name}
        value={localName}
        maxLength={14}
        placeholder="Sir Reginald"
        placeholderTextColor="#4A4E69"
        onChangeText={(t) => {
          setLocalName(t);
          onChangeName(t);
        }}
      />

      {error ? <Text style={styles.err}>{error}</Text> : null}

      <Pressable
        style={[styles.btn, joining && styles.btnOff]}
        disabled={joining}
        onPress={() => onJoin(localRoom, localName)}
      >
        <Text style={styles.btnText}>{joining ? 'JOINING…' : 'JOIN ROOM'}</Text>
      </Pressable>

      <Pressable onPress={onRescan} style={styles.link}>
        <Text style={styles.linkText}>Scan a different QR</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#0B0E23',
    padding: 28,
    justifyContent: 'center',
  },
  brand: { color: '#FFC857', fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: 1 },
  sub: { color: '#F4E9D8', textAlign: 'center', marginTop: 8, marginBottom: 24, fontWeight: '700' },
  label: { color: '#7A7F9E', fontSize: 11, letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  code: {
    borderWidth: 2,
    borderColor: '#4A4E69',
    borderRadius: 8,
    color: '#FFC857',
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    padding: 12,
    backgroundColor: '#0B0E23',
  },
  name: {
    borderWidth: 2,
    borderColor: '#4A4E69',
    borderRadius: 8,
    color: '#F4E9D8',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    padding: 12,
  },
  err: { color: '#E63946', textAlign: 'center', marginTop: 12, fontWeight: '700' },
  btn: {
    backgroundColor: '#FF7A3D',
    padding: 16,
    borderRadius: 8,
    marginTop: 22,
  },
  btnOff: { opacity: 0.5 },
  btnText: { color: '#1B0E08', textAlign: 'center', fontWeight: '800', letterSpacing: 1 },
  link: { marginTop: 18, alignItems: 'center' },
  linkText: { color: '#FFC857', fontWeight: '700' },
});
