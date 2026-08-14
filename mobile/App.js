import { useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Vibration } from 'react-native';
import GameSocket from './src/GameSocket';
import ScanScreen from './src/screens/ScanScreen';
import JoinScreen from './src/screens/JoinScreen';
import PlayScreen from './src/screens/PlayScreen';

const { parseJoinQr } = require('./src/parseJoinQr');

export default function App() {
  const [flow, setFlow] = useState('scan'); // scan | join | play
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [screen, setScreen] = useState('waiting');
  const [color, setColor] = useState('#4ECDC4');
  const [alive, setAlive] = useState(true);
  const [score, setScore] = useState(0);
  const [endTitle, setEndTitle] = useState('');
  const [endDetail, setEndDetail] = useState('');
  const [beat, setBeat] = useState(false);
  const playerIdRef = useRef(null);

  const socket = useMemo(() => new GameSocket({
    onMessage: (msg) => {
      switch (msg.type) {
        case 'joined':
          playerIdRef.current = msg.playerId;
          setColor(msg.color || '#4ECDC4');
          setJoining(false);
          setError('');
          setFlow('play');
          setScreen(msg.inProgress ? 'play' : 'waiting');
          break;
        case 'join_error':
          setJoining(false);
          setError(msg.reason || 'Could not join.');
          setFlow('join');
          break;
        case 'game_start':
          setAlive(true);
          setScore(0);
          setScreen('play');
          break;
        case 'status':
          setScore(msg.score ?? 0);
          setAlive(msg.alive !== false);
          break;
        case 'beat':
          setBeat(true);
          Vibration.vibrate(msg.isDownbeat ? 45 : 18);
          setTimeout(() => setBeat(false), 80);
          break;
        case 'game_over': {
          const mine = (msg.results || []).find((r) => r.playerId === playerIdRef.current);
          setEndTitle(mine ? (mine.rank === 1 ? 'VICTORY!' : `RANK #${mine.rank}`) : 'GAME OVER');
          setEndDetail(mine ? `Final score: ${mine.score}` : 'Watch the big screen for full results.');
          setScreen('end');
          setTimeout(() => setScreen('waiting'), 6000);
          break;
        }
        case 'room_closed':
          setError(msg.reason || 'Room closed.');
          setFlow('join');
          break;
        default:
          break;
      }
    },
  }), []);

  function handleScanned(raw) {
    const code = parseJoinQr(raw);
    if (!code) {
      setError('That QR is not a room code. Try again or type it.');
      setFlow('join');
      return;
    }
    setRoom(code);
    setError('');
    setFlow('join');
  }

  function handleJoin(nextRoom, nextName) {
    const code = parseJoinQr(nextRoom) || String(nextRoom || '').toUpperCase().replace(/[^A-Z]/g, '');
    const who = (nextName || 'Player').slice(0, 14);
    if (code.length !== 4) {
      setError('Enter the 4-letter room code.');
      return;
    }
    setRoom(code);
    setName(who);
    setError('');
    setJoining(true);
    socket.join(code, who);
  }

  return (
    <>
      <StatusBar style="light" />
      {flow === 'scan' ? (
        <ScanScreen onCode={handleScanned} onTypeInstead={() => setFlow('join')} />
      ) : null}
      {flow === 'join' ? (
        <JoinScreen
          room={room}
          name={name}
          error={error}
          joining={joining}
          onChangeRoom={setRoom}
          onChangeName={setName}
          onJoin={handleJoin}
          onRescan={() => { setError(''); setFlow('scan'); }}
        />
      ) : null}
      {flow === 'play' ? (
        <PlayScreen
          screen={screen}
          name={name}
          color={color}
          alive={alive}
          score={score}
          endTitle={endTitle}
          endDetail={endDetail}
          beat={beat}
          onInput={(action, value) => socket.input(action, value)}
        />
      ) : null}
    </>
  );
}
