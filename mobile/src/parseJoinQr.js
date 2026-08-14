// Pull a 4-letter room code out of a scanned QR (or typed text).
// Host QR is: https://sound-and-motion.onrender.com/controller?room=ABCD

function parseJoinQr(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const asCode = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (text.length === 4 && asCode.length === 4) return asCode;

  try {
    const url = new URL(text);
    const room = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (room.length === 4) return room;
  } catch (_) {
    const match = text.match(/[?&]room=([A-Za-z]{4})/i);
    if (match) return match[1].toUpperCase();
  }

  return null;
}

module.exports = { parseJoinQr };
