export const VECTOR_DIMS = 256;

export function float32ToBytes(vector: Float32Array | number[]): Uint8Array {
  const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector);
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function bytesToFloat32(bytes: Uint8Array): Float32Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

export function l2normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Deterministic bag-of-words embedding used by the mock embedder and by tests.
// Real vectors come from EmbeddingGemma 2 natively; this only needs to be stable
// and to give related texts overlapping dimensions.
export function hashEmbed(text: string, dims: number = VECTOR_DIMS): Float32Array {
  const tokens = text
    .toLowerCase()
    .replace(/wi-?fi/g, 'wifi')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const v = new Float32Array(dims);
  for (const t of tokens) {
    const h = fnv1a(t);
    v[h % dims] += h & 0x100 ? 1 : -1;
  }
  for (let i = 0; i + 1 < tokens.length; i++) {
    const h = fnv1a(`${tokens[i]} ${tokens[i + 1]}`);
    v[h % dims] += (h & 0x100 ? 1 : -1) * 1.5;
  }
  return l2normalize(v);
}
