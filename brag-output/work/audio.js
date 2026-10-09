// Synth: one warm minimal electronic track + in-key UI sfx, mixed, -> audio.wav
// 60 s stereo 44.1 kHz 16-bit WAV written by hand (no deps).
const fs = require('fs');
const SR = 44100, DUR = 61.2, N = Math.floor(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (t0, dur, fn) => {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(N, s0 + Math.floor(dur * SR));
  for (let i = s0; i < s1; i++) { const [l, r] = fn((i - s0) / SR); L[i] += l; R[i] += r; }
};
const nf = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> hz
// simple lowpassed noise state for hats/whooshes
let nz = 0;
const noise = () => (Math.random() * 2 - 1);

// ---------- harmony: Am7 Fmaj7 Cmaj7 G6 over 60 s (each ~7.5 s, x2) ----------
const chords = [
  [57, 60, 64, 67], // A C E G
  [53, 57, 60, 64], // F A C E
  [48, 52, 55, 59], // C E G B
  [55, 59, 62, 69], // G B D A
];
const CHORD_S = 7.63;
function chordAt(t) { return chords[Math.floor(t / CHORD_S) % chords.length]; }

// ---------- pad: soft additive chord, slow attack ----------
const padVol = (t) => {
  const demo = t < 4 ? 0.55 : t < 51.5 ? 0.9 : 0.75;
  return 0.055 * demo;
};
for (let c = 0; c < 16; c++) {
  const t0 = c * CHORD_S;
  if (t0 > DUR) break;
  add(t0, CHORD_S + 0.4, (u) => {
    const a = Math.min(1, u / 1.4) * Math.min(1, (CHORD_S + 0.4 - u) / 1.6);
    let v = 0;
    for (const n of chordAt(t0)) {
      const f = nf(n);
      v += Math.sin(2 * Math.PI * f * u) * 0.55
         + Math.sin(2 * Math.PI * f * 2 * u + 1.3) * 0.16
         + Math.sin(2 * Math.PI * f * 0.5 * u + 0.7) * 0.3;
    }
    const trem = 1 + 0.12 * Math.sin(2 * Math.PI * 0.35 * u);
    v = v * padVol(t0) * a * trem / chordAt(t0).length;
    const ph = Math.sin(2 * Math.PI * 0.11 * u + t0);
    return [v * (1 - 0.12 * ph), v * (1 + 0.12 * ph)];
  });
}

// ---------- bass: soft sine roots on the chord root -12 ----------
const beat = 60 / 112;
for (let c = 0; c < 16; c++) {
  const t0 = c * CHORD_S;
  if (t0 > DUR) break;
  const root = chordAt(t0)[0] - 12;
  for (let b = 0; b < Math.floor(CHORD_S / beat); b += 2) {
    add(t0 + b * beat, beat * 1.1, (u) => {
      const e = Math.exp(-u * 6);
      const v = Math.sin(2 * Math.PI * nf(root) * u + 0.4 * Math.sin(2 * Math.PI * nf(root) * u)) * 0.16 * e;
      return [v, v];
    });
  }
}

// ---------- kick: soft, beats 1+3, only during demo ----------
for (let t = 9.2; t < 51.5; t += beat * 2) {
  add(t, 0.16, (u) => {
    const f = 95 - 55 * Math.min(1, u / 0.09);
    const v = Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 26) * 0.5;
    return [v, v];
  });
}

// ---------- hats: quiet offbeat ticks during demo ----------
for (let t = 9.2 + beat; t < 51.5; t += beat) {
  add(t, 0.05, (u) => {
    nz = nz * 0.55 + noise() * 0.45;
    const v = nz * Math.exp(-u * 160) * 0.09;
    return [v * 0.8, v * 1.2];
  });
}

// ---------- sparse pluck arp during demo beats ----------
const arpNotes = [69, 72, 76, 79, 81, 79, 76, 72];
let ai = 0;
for (let t = 10.2; t < 51; t += beat * 2) {
  const n = arpNotes[ai++ % arpNotes.length];
  add(t, 0.5, (u) => {
    const e = Math.exp(-u * 9);
    const v = (Math.sin(2 * Math.PI * nf(n) * u) + 0.3 * Math.sin(2 * Math.PI * nf(n) * 2 * u)) * e * 0.055;
    return [v * (ai % 2 ? 1.15 : 0.85), v * (ai % 2 ? 0.85 : 1.15)];
  });
}

// ---------- sfx ----------
const blip = (t, f, d, g) => add(t, d, (u) => {
  const v = Math.sin(2 * Math.PI * f * u) * Math.exp(-u * (8 / d)) * g;
  return [v * 0.9, v * 1.1];
});
const pop = (t) => add(t, 0.09, (u) => {
  const f = 480 + 620 * Math.min(1, u / 0.05);
  const v = Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 45) * 0.11;
  return [v, v];
});
const tick = (t) => add(t, 0.018, (u) => {
  nz = nz * 0.4 + noise() * 0.6;
  const v = nz * Math.exp(-u * 320) * 0.07;
  return [v * 0.85, v * 1.15];
});
const whoosh = (t) => add(t, 0.5, (u) => {
  nz = nz * 0.82 + noise() * 0.18;
  const e = Math.sin(Math.PI * Math.min(1, u / 0.5));
  const v = nz * e * e * 0.05;
  return [v * 0.9, v * 1.1];
});
const chime = (t) => [81, 88].forEach((n, i) => add(t + i * 0.12, 0.8, (u) => {
  const v = Math.sin(2 * Math.PI * nf(n) * u) * Math.exp(-u * 5) * 0.08;
  return [v * (i ? 1.1 : 0.9), v * (i ? 0.9 : 1.1)];
}));

// typing ticks — mirror player.html timing (cps 23, ts .55)
for (const [start, q] of [[21.6, 'Magkano nagastos ko sa GCash this week?'],
                          [31.6, 'The PDF about the thesis defense schedule'],
                          [41.2, 'Ilagay mo lahat ng resibo sa isang folder']]) {
  for (let i = 0; i < q.length; i++) tick(start + 0.55 + i / 23);
}
// card pops: find cards at 9.2+3.4 +0,.25,.5,.75; math rows cardT+.15/.37/.59 + total .9; doc 2 cards
for (const d of [0, 0.25, 0.5, 0.75]) pop(9.2 + 4.0 + d);
for (const d of [0.15, 0.37, 0.59, 0.95]) pop(21.6 + 3.98 + d);
for (const d of [0, 0.25]) pop(31.6 + 3.98 + d);
pop(41.2 + 3.94);
// sends + suggestion tap
blip(9.2 + 1.4, 660, 0.08, 0.1);
for (const b of [21.6, 31.6, 41.2]) blip(b + 0.55 + 40 / 23 + 0.28, 700, 0.07, 0.09);
// plan confirm + chime
blip(41.2 + 3.94 + 1.9, 620, 0.07, 0.1);
chime(41.2 + 3.94 + 2.3);
chime(52.4);
// scene whooshes
for (const t of [4.5, 9.1, 21.5, 31.5, 41.1, 51.5]) whoosh(t);

// ---------- master: soft clip, fade, normalize ----------
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.4) * Math.min(1, Math.max(0, (DUR - 1.4 - t) / 1.6));
  L[i] = Math.tanh(L[i] * 1.4) * fade;
  R[i] = Math.tanh(R[i] * 1.4) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.92 / Math.max(peak, 1e-6);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-1, Math.min(1, L[i] * g)) * 32767, 44 + i * 4);
  buf.writeInt16LE(Math.max(-1, Math.min(1, R[i] * g)) * 32767, 44 + i * 4 + 2);
}
fs.writeFileSync(require('path').join(__dirname, 'audio.wav'), buf);
console.log('audio.wav', (buf.length / 1e6).toFixed(1) + 'MB', 'peak', peak.toFixed(3));
