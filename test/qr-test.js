const { encodeToMatrix } = require('../public/shared/qr.js');

function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) process.exitCode = 1;
}

function finderOk(m, r0, c0) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      const expect = onBorder || inCore ? 1 : 0;
      if (m[r0 + r][c0 + c] !== expect) return false;
    }
  }
  return true;
}

const url = 'https://sound-and-motion.onrender.com/controller?room=ABCD';
const { modules, size, version } = encodeToMatrix(url);

check('join URL encodes', !!modules && size >= 21);
check('version is 1-5', version >= 1 && version <= 5);
check('size matches version', size === 17 + 4 * version);
check('top-left finder', finderOk(modules, 0, 0));
check('top-right finder', finderOk(modules, 0, size - 7));
check('bottom-left finder', finderOk(modules, size - 7, 0));
check('timing row', modules[6][8] === 1 && modules[6][9] === 0);
check('dark module set', modules[4 * version + 9][8] === 1);

const shorty = encodeToMatrix('HI');
check('tiny payload is version 1', shorty.version === 1 && shorty.size === 21);

try {
  encodeToMatrix('x'.repeat(200));
  check('rejects oversized payload', false);
} catch (_) {
  check('rejects oversized payload', true);
}

if (!process.exitCode) console.log('qr-test: all passed');
