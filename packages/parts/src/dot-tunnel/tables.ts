/**
 * Verbatim tables for the TUNNELI dot tunnel, regenerated from the original Turbo Pascal generators
 * and verified byte-for-byte against the shipped SINIT.DAT / TUNNEL.DAT (see tables.test.ts).
 * Pascal `Round` is banker's rounding (ties to even); `div` is integer truncation.
 */

/** Pascal Round: nearest integer, halves to even. Required for byte-exact table reproduction. */
export function pround(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Pascal integer div (trunc toward zero). All operands here are non-negative. */
const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** SINGEN.PAS: sinit[x] = round(sin(x/128·π) · ((x·3) div 128)), x∈[0,4096]. Signed (two's-complement word). */
export function buildSinit(): Int16Array {
  const t = new Int16Array(4097);
  for (let x = 0; x <= 4096; x++) t[x] = pround(Math.sin((x / 128) * Math.PI) * idiv(x * 3, 128));
  return t;
}

/** SINGEN.PAS: cosit[x] = round(cos(x/128·π) · ((x·4) div 64)), x∈[0,2048]. */
export function buildCosit(): Int16Array {
  const t = new Int16Array(2049);
  for (let x = 0; x <= 2048; x++) t[x] = pround(Math.cos((x / 128) * Math.PI) * idiv(x * 4, 64));
  return t;
}

/** 138 radius rows × 64 dots, row-major `[row*64+dot]`. x/y are screen offsets (centre 160/100 baked in). */
export interface CircleTable {
  x: Int16Array;
  y: Int16Array;
}

/**
 * BALLGEN2.PAS → TUNNEL.DAT. For radius row r∈[0,137] (z=r+10) and dot a∈[0,64):
 *   x = 160 + round(sin(a·π/32) · round(z·1.7))
 *   y = 100 + round(cos(a·π/32) · z)
 */
export function buildCircleTable(): CircleTable {
  const x = new Int16Array(138 * 64);
  const y = new Int16Array(138 * 64);
  for (let r = 0; r < 138; r++) {
    const z = r + 10;
    const rx = pround(z * 1.7);
    for (let a = 0; a < 64; a++) {
      x[r * 64 + a] = 160 + pround(Math.sin((a * Math.PI) / 32) * rx);
      y[r * 64 + a] = 100 + pround(Math.cos((a * Math.PI) / 32) * z);
    }
  }
  return { x, y };
}

/** TUN10.PAS: sade[z] = 16384 div (z·7+95), z∈[0,100]. Perspective radius-row selector by ring depth. */
export function buildSade(): Int32Array {
  const t = new Int32Array(101);
  for (let z = 0; z <= 100; z++) t[z] = idiv(16384, z * 7 + 95);
  return t;
}
