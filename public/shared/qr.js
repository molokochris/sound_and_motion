// Compact QR encoder — byte mode, versions 1–5, level L.
// Good for short HTTPS join URLs. No network, no dependencies.
(function (root) {
  const VERSIONS = {
    1: { size: 21, data: 19, ec: 7 },
    2: { size: 25, data: 34, ec: 10 },
    3: { size: 29, data: 55, ec: 15 },
    4: { size: 33, data: 80, ec: 20 },
    5: { size: 37, data: 108, ec: 26 },
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (!a || !b) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGenerator(ecCount) {
    let g = [1];
    for (let i = 0; i < ecCount; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= gfMul(g[j], GF_EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenerator(ecCount);
    const res = data.concat(new Array(ecCount).fill(0));
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (!coef) continue;
      for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
    }
    return res.slice(data.length);
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return Array.from(Buffer.from(text, 'utf8'));
  }

  function chooseVersion(byteLen) {
    for (const v of [1, 2, 3, 4, 5]) {
      const cap = VERSIONS[v].data - 2;
      if (byteLen <= cap) return v;
    }
    throw new Error('Text too long for this QR encoder (max ~106 bytes).');
  }

  function encodeData(text, dataCw) {
    const bytes = utf8Bytes(text);
    const bits = [];
    const push = (val, n) => {
      for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    push(0b0100, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    const maxBits = dataCw * 8;
    const term = Math.min(4, maxBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < maxBits) {
      push(pads[pi], 8);
      pi ^= 1;
    }
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      codewords.push(v);
    }
    return codewords;
  }

  function formatBits(ecBits, mask) {
    const data = (ecBits << 3) | mask;
    let d = data << 10;
    for (let i = 14; i >= 10; i--) {
      if ((d >>> i) & 1) d ^= (0x537 << (i - 10));
    }
    return ((data << 10) | (d & 0x3ff)) ^ 0x5412;
  }

  function makeReserved(version) {
    const size = VERSIONS[version].size;
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const mark = (r, c) => {
      if (r >= 0 && c >= 0 && r < size && c < size) reserved[r][c] = true;
    };

    function markFinder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) mark(r0 + r, c0 + c);
      }
    }
    markFinder(0, 0);
    markFinder(0, size - 7);
    markFinder(size - 7, 0);

    for (let i = 0; i < size; i++) {
      mark(6, i);
      mark(i, 6);
    }
    mark(4 * version + 9, 8);

    const pos = ALIGN[version];
    for (const r of pos) {
      for (const c of pos) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8);
        if (inFinder) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
        }
      }
    }

    for (let c = 0; c <= 8; c++) mark(8, c);
    for (let c = size - 8; c < size; c++) mark(8, c);
    for (let r = 0; r <= 8; r++) mark(r, 8);
    for (let r = size - 7; r < size; r++) mark(r, 8);
    return reserved;
  }

  function paintPatterns(grid, version) {
    const size = grid.length;

    function drawFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = onBorder || inCore ? 1 : 0;
        }
      }
    }
    for (let i = 8; i < size - 8; i++) {
      grid[6][i] = i % 2 === 0 ? 1 : 0;
      grid[i][6] = i % 2 === 0 ? 1 : 0;
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    const pos = ALIGN[version];
    for (const r of pos) {
      for (const c of pos) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8);
        if (inFinder) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const edge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            grid[r + dr][c + dc] = edge || (dr === 0 && dc === 0) ? 1 : 0;
          }
        }
      }
    }

  }

  function placeFormat(grid, bits) {
    const size = grid.length;
    const bit = (i) => (bits >> i) & 1;
    // Copy 1: down the right edge of the top-left finder, then left along row 8.
    for (let i = 0; i <= 5; i++) grid[i][8] = bit(i);
    grid[7][8] = bit(6);
    grid[8][8] = bit(7);
    grid[8][7] = bit(8);
    for (let i = 9; i <= 14; i++) grid[8][14 - i] = bit(i);
    // Copy 2: along the right side of row 8, then down the bottom of col 8.
    for (let i = 0; i <= 7; i++) grid[8][size - 1 - i] = bit(i);
    for (let i = 8; i <= 14; i++) grid[size - 15 + i][8] = bit(i);
  }

  function placeData(grid, reserved, bits) {
    const size = grid.length;
    let idx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (c < 0 || reserved[row][c]) continue;
          grid[row][c] = idx < bits.length ? bits[idx] : 0;
          idx += 1;
        }
      }
      upward = !upward;
    }
  }

  function maskFn(id) {
    return [
      (r, c) => ((r + c) % 2) === 0,
      (r, c) => (r % 2) === 0,
      (r, c) => (c % 3) === 0,
      (r, c) => ((r + c) % 3) === 0,
      (r, c) => ((Math.floor(r / 2) + Math.floor(c / 3)) % 2) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) === 0,
      (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
      (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
    ][id];
  }

  function applyMask(grid, reserved, id) {
    const size = grid.length;
    const fn = maskFn(id);
    const out = grid.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && fn(r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function penalty(grid) {
    const size = grid.length;
    let score = 0;

    function lineScore(get) {
      let run = 1;
      let prev = get(0);
      for (let i = 1; i < size; i++) {
        const v = get(i);
        if (v === prev) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
          prev = v;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let r = 0; r < size; r++) lineScore((c) => grid[r][c]);
    for (let c = 0; c < size; c++) lineScore((r) => grid[r][c]);

    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
      }
    }

    const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function hasPat(get, pat) {
      for (let i = 0; i <= size - pat.length; i++) {
        let ok = true;
        for (let j = 0; j < pat.length; j++) if (get(i + j) !== pat[j]) { ok = false; break; }
        if (ok) score += 40;
      }
    }
    for (let r = 0; r < size; r++) {
      hasPat((c) => grid[r][c], patA);
      hasPat((c) => grid[r][c], patB);
    }
    for (let c = 0; c < size; c++) {
      hasPat((r) => grid[r][c], patA);
      hasPat((r) => grid[r][c], patB);
    }

    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += grid[r][c];
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encodeToMatrix(text) {
    const bytes = utf8Bytes(text);
    const version = chooseVersion(bytes.length);
    const spec = VERSIONS[version];
    const data = encodeData(text, spec.data);
    const ec = rsEncode(data, spec.ec);
    const codewords = data.concat(ec);
    const bits = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    }

    const reserved = makeReserved(version);
    const base = Array.from({ length: spec.size }, () => new Array(spec.size).fill(0));
    paintPatterns(base, version);
    placeData(base, reserved, bits);

    let best = null;
    let bestScore = Infinity;
    let bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
      const masked = applyMask(base, reserved, mask);
      placeFormat(masked, formatBits(1, mask)); // 1 = level L
      const score = penalty(masked);
      if (score < bestScore) {
        bestScore = score;
        best = masked;
        bestMask = mask;
      }
    }
    best[4 * version + 9][8] = 1;
    return { modules: best, version, mask: bestMask, size: spec.size };
  }

  function draw(canvas, text, opts) {
    const encoded = encodeToMatrix(text);
    const { modules, size, version } = encoded;
    const px = (opts && opts.size) || 180;
    const quiet = 4;
    const total = size + quiet * 2;
    const scale = Math.floor(px / total) || 1;
    const dim = scale * total;
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
    return { size: dim, version };
  }

  const api = { encodeToMatrix, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SkyQR = api;
})(typeof window !== 'undefined' ? window : globalThis);
