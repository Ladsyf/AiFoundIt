// Original score + UI sounds for the 60 s pitch, written straight to audio.wav (44.1 kHz, 16-bit stereo).
const fs = require('fs');
const path = require('path');

const SR = 44100;
const DUR = 60;
const N = SR * DUR;
const bus = () => [new Float32Array(N), new Float32Array(N)];
const dry = bus();
const verb = bus();

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function put(t0, dur, fn, gain = 1, pan = 0, send = 0.2) {
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t0 + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR, i / SR);
    dry[0][i] += v * gl; dry[1][i] += v * gr;
    verb[0][i] += v * gl * send; verb[1][i] += v * gr * send;
  }
}

// Grid: downbeats land on the reveal (5.8 s) and on the close (55.0 s), 20 bars apart.
const BAR = (55.0 - 5.8) / 20;
const BEAT = BAR / 4;
const ORIGIN = 5.8;
// D | A | Bm | G, rooted around D3
const CHORDS = [[50, 54, 57, 62], [45, 52, 57, 61], [47, 54, 59, 62], [43, 50, 55, 59]];
const chordAt = (bar) => CHORDS[((bar % 4) + 4) % 4];

// Kick positions, kept for the sidechain duck
const kicks = [];
function duck(t) {
  let d = 1;
  for (let k = kicks.length - 1; k >= 0; k--) {
    const dt = t - kicks[k];
    if (dt < 0) continue;
    if (dt > 0.3) break;
    d = Math.min(d, 1 - 0.55 * Math.exp(-dt * 11));
  }
  return d;
}

// ── pad ──
function pad(t0, dur, notes, gain, bright) {
  notes.forEach((n, j) => {
    for (const det of [-0.07, 0.07]) {
      const f = hz(n + 12) * Math.pow(2, det / 12);
      const ph = j * 1.7 + det * 10;
      put(t0, dur + 1.2, (u, t) => {
        const env = Math.min(1, u / 0.9) * Math.min(1, Math.max(0, (dur + 1.2 - u) / 1.2));
        let v = 0;
        for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * u + ph * h) / Math.pow(h, 2.2 - bright);
        return v * env * duck(t);
      }, gain / notes.length, det < 0 ? -0.45 : 0.45, 0.55);
    }
  });
}

// ── Karplus–Strong pluck ──
function pluck(t0, midi, gain, pan) {
  const f = hz(midi);
  const len = Math.round(SR / f);
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = rnd() * 0.9;
  let idx = 0, last = 0;
  const dur = 1.6;
  put(t0, dur, (u) => {
    const cur = buf[idx];
    const next = buf[(idx + 1) % len];
    const v = 0.4985 * (cur + next) * 0.996 + 0.003 * last;
    buf[idx] = v; last = v;
    idx = (idx + 1) % len;
    return cur * Math.min(1, u / 0.003) * Math.exp(-u * 2.2);
  }, gain, pan, 0.45);
}

// ── FM bell ──
function bell(t0, midi, gain, pan = 0, decay = 2.4) {
  const f = hz(midi);
  put(t0, decay + 0.5, (u) => {
    const m = Math.sin(2 * Math.PI * f * 3.5 * u) * 2.2 * Math.exp(-u * 4);
    return Math.sin(2 * Math.PI * f * u + m) * Math.exp(-u * (3 / decay)) * Math.min(1, u / 0.004);
  }, gain, pan, 0.6);
}

function kick(t0, gain) {
  kicks.push(t0);
  put(t0, 0.45, (u) => {
    const f = 46 + 90 * Math.exp(-u * 28);
    const ph = 2 * Math.PI * (46 * u + (90 / 28) * (1 - Math.exp(-u * 28)));
    return Math.sin(ph) * Math.exp(-u * 7.5) + rnd() * 0.08 * Math.exp(-u * 120) + 0 * f;
  }, gain, 0, 0.04);
}
let hp = 0;
function hat(t0, gain, pan) {
  put(t0, 0.06, (u) => { const x = rnd(); const v = x - hp; hp = x; return v * Math.exp(-u * 85); }, gain, pan, 0.1);
}
function bassNote(t0, dur, midi, gain) {
  const f = hz(midi);
  put(t0, dur, (u, t) => {
    const env = Math.min(1, u / 0.012) * Math.exp(-u * 2.2) * Math.min(1, (dur - u) / 0.03);
    const v = Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u);
    return Math.tanh(v * 1.3) * env * duck(t);
  }, gain, 0, 0.02);
}

// ── arrangement ──
// Hook: dark Bm bed, a quiet clock on every beat, a riser into the reveal
pad(0, ORIGIN, [47, 50, 54], 0.05, 0.1);
for (let t = ORIGIN - BAR * 2; t < ORIGIN - 0.1; t += BEAT) {
  put(t, 0.05, (u) => Math.sin(2 * Math.PI * 1760 * u) * Math.exp(-u * 90), 0.05, 0.25, 0.15);
}
put(ORIGIN - 1.7, 1.75, (u) => {
  const p = u / 1.75;
  return (rnd() * 0.5 + Math.sin(2 * Math.PI * (300 + 900 * p * p) * u) * 0.3) * p * p * p;
}, 0.09, 0, 0.5);

// Main: 20 bars from the reveal to the close
for (let b = 0; b < 20; b++) {
  const t0 = ORIGIN + b * BAR;
  const ch = chordAt(b);
  const lift = b >= 17;
  pad(t0, BAR, ch, lift ? 0.085 : 0.06, lift ? 0.7 : 0.35);
  const root = ch[0] - 12;
  if (t0 >= 9.5 || b >= 1) {
    for (let e = 0; e < 8; e++) bassNote(t0 + e * BEAT / 2, BEAT / 2 - 0.01, root + (e === 7 ? 7 : 0), e % 2 ? 0.07 : 0.1);
  }
  const arp = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 24, ch[3] + 12, ch[2] + 12, ch[1] + 24, ch[3] + 12];
  for (let e = 0; e < 8; e++) pluck(t0 + e * BEAT / 2, arp[e], b < 2 ? 0.05 : 0.07, e % 2 ? 0.35 : -0.35);
  if (t0 >= 9.5) {
    for (let q = 0; q < 4; q++) {
      if (lift || q % 2 === 0) kick(t0 + q * BEAT, 0.5);
      hat(t0 + q * BEAT + BEAT / 2, 0.05, 0.3);
      if (lift) { hat(t0 + q * BEAT + BEAT / 4, 0.025, -0.3); hat(t0 + q * BEAT + 3 * BEAT / 4, 0.025, -0.3); }
    }
  }
}
// A small bell motif over the proof section
[[0, 78], [0.5, 81], [1, 86], [2, 85], [2.5, 81], [4, 83], [4.5, 81], [5, 78]].forEach(([b, m]) => bell(47.6 + 0.3 + b * BEAT, m, 0.05, m % 2 ? 0.3 : -0.3));
// Close: resolve on D and let it ring
pad(55.0, 4.4, [50, 54, 57, 62, 66], 0.11, 0.6);
bassNote(55.0, 3.5, 38, 0.16);
put(55.0, 2.2, (u) => Math.sin(2 * Math.PI * (42 + 30 * Math.exp(-u * 9)) * u) * Math.exp(-u * 2.4), 0.3, 0, 0.2);
[74, 78, 81, 86].forEach((m, i) => bell(55.05 + i * 0.09, m, 0.05, -0.3 + i * 0.2, 3.5));
put(5.8, 2.0, (u) => Math.sin(2 * Math.PI * (40 + 26 * Math.exp(-u * 8)) * u) * Math.exp(-u * 2.8), 0.32, 0, 0.25);
[62, 66, 69].forEach((m, i) => bell(5.85 + i * 0.07, m + 12, 0.045, -0.25 + i * 0.25, 2.8));

// ── UI sounds, timed to player.html ──
const tick = (t, g = 0.06) => put(t, 0.03, (u) => { const x = rnd(); const v = x - hp; hp = x; return v * Math.exp(-u * 260); }, g * (0.75 + 0.25 * Math.abs(rnd())), 0.15 * rnd(), 0.08);
const tap = (t) => put(t, 0.06, (u) => Math.sin(2 * Math.PI * 520 * u) * Math.exp(-u * 70), 0.12, 0, 0.12);
const send = (t) => put(t, 0.16, (u) => Math.sin(2 * Math.PI * (hz(81) * u + 260 * u * u)) * Math.min(1, u / 0.005) * Math.exp(-u * 26), 0.07, 0.1, 0.3);
const pop = (t, m = 86) => put(t, 0.22, (u) => Math.sin(2 * Math.PI * hz(m) * u) * Math.min(1, u / 0.002) * Math.exp(-u * 30), 0.06, 0.2 * rnd(), 0.35);
const whoosh = (t, d = 0.6, g = 0.05) => {
  let lp = 0;
  put(t, d, (u) => { lp += (rnd() - lp) * 0.08; return lp * Math.sin(Math.PI * u / d) ** 2; }, g * 6, 0, 0.4);
};

for (let i = 0; i < 13; i++) tick(1.75 + i / 14, 0.08);
put(3.0, 0.4, (u) => Math.sin(2 * Math.PI * (98 + 40 * Math.exp(-u * 18)) * u) * Math.exp(-u * 9), 0.22, 0, 0.15);
put(3.12, 0.5, (u) => Math.sin(2 * Math.PI * hz(66) * u) * Math.exp(-u * 8) * Math.min(1, u / 0.004), 0.05, -0.2, 0.4);
put(3.26, 0.5, (u) => Math.sin(2 * Math.PI * hz(62) * u) * Math.exp(-u * 7) * Math.min(1, u / 0.004), 0.05, 0.2, 0.4);
whoosh(5.25, 0.6, 0.05);
whoosh(9.35, 0.7, 0.04);
for (const t of [19.6, 27.8, 36.7]) whoosh(t, 0.55, 0.025);
whoosh(47.3, 0.7, 0.04);

tap(10.95); send(11.4); pop(12.85, 86); pop(13.0, 90);
[[20.35, 40, 25, 22.2], [28.55, 39, 25, 30.3], [37.45, 28, 23, 38.85]].forEach(([s, n, cps, at]) => {
  for (let i = 0; i < n; i++) tick(s + i / cps);
  tap(at); send(at + 0.03);
});
pop(23.55, 86);
pop(31.45, 81); pop(31.75, 86); pop(31.9, 88); pop(32.05, 90);
pop(39.95, 86);
tap(43.05);
bell(43.18, 86, 0.06, -0.2, 1.6); bell(43.3, 93, 0.05, 0.2, 1.8);
pop(43.35, 81);
[48.95, 49.27, 49.59].forEach((t, i) => pop(t, [81, 86, 90][i]));

// ── reverb (Schroeder) on the send bus ──
function reverb(x, combs, aps) {
  const out = new Float32Array(N);
  for (const [d, fb] of combs) {
    const b = new Float32Array(d); let i = 0, lp = 0;
    for (let n = 0; n < N; n++) {
      const y = b[i];
      lp = y * 0.6 + lp * 0.4;
      b[i] = x[n] + lp * fb;
      i = (i + 1) % d;
      out[n] += y;
    }
  }
  for (const d of aps) {
    const b = new Float32Array(d); let i = 0;
    for (let n = 0; n < N; n++) {
      const y = b[i];
      const v = out[n] + y * 0.5;
      b[i] = v;
      out[n] = y - v * 0.5;
      i = (i + 1) % d;
    }
  }
  return out;
}
const wl = reverb(verb[0], [[1557, 0.84], [1617, 0.84], [1491, 0.84], [1422, 0.84]], [225, 556]);
const wr = reverb(verb[1], [[1580, 0.84], [1640, 0.84], [1514, 0.84], [1445, 0.84]], [248, 579]);

// ── master ──
const L = new Float32Array(N), R = new Float32Array(N);
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = Math.min(1, t / 0.25) * Math.min(1, Math.max(0, (DUR - t) / 1.6));
  L[n] = Math.tanh((dry[0][n] + wl[n] * 0.22) * 1.6) * fade;
  R[n] = Math.tanh((dry[1][n] + wr[n] * 0.22) * 1.6) * fade;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const g = 0.89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  out.writeInt16LE(Math.round(clampS(L[n] * g) * 32767), 44 + n * 4);
  out.writeInt16LE(Math.round(clampS(R[n] * g) * 32767), 46 + n * 4);
}
function clampS(v) { return Math.max(-1, Math.min(1, v)); }
fs.writeFileSync(path.join(__dirname, 'audio.wav'), out);
console.log('audio.wav written, peak before gain', peak.toFixed(3));
