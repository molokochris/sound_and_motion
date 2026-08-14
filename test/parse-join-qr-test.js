const { parseJoinQr } = require('../mobile/src/parseJoinQr');

function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) process.exitCode = 1;
}

check('public join URL', parseJoinQr('https://sound-and-motion.onrender.com/controller?room=ABCD') === 'ABCD');
check('bare code', parseJoinQr('kntp') === 'KNTP');
check('LAN join URL', parseJoinQr('http://192.168.1.12:3000/controller?room=Wxyz') === 'WXYZ');
check('rejects junk', parseJoinQr('https://example.com') === null);
check('rejects empty', parseJoinQr('') === null);

if (!process.exitCode) console.log('parse-join-qr-test: all passed');
