/**
 * Verbatim tables for the DDSTARS Desert Dream star field, ported from STARS.ASM and the shared
 * SIN1024.INC. The sine table is a faithful regeneration of SIN1024.INC (verified word-for-word in
 * tables.test.ts); the perspective scale tables are generated inline by the original at startup
 * (init_stars) and have no shipped .DAT oracle, so they are reproduced from the exact integer formula.
 */

const SIN_LEN = 1024;
const SIN_AMP = 256;

/**
 * 1024-entry signed sine table, amplitude 256, truncated toward zero — reproduces SIN1024.INC exactly
 * (sin1024[i] = trunc(256 · sin(i · 2π / 1024))). Shared by TECHNO/DDSTARS in the original.
 */
function buildSin1024(): Int16Array {
  const t = new Int16Array(SIN_LEN);
  for (let i = 0; i < SIN_LEN; i++)
    t[i] = Math.trunc(SIN_AMP * Math.sin((i * 2 * Math.PI) / SIN_LEN));
  return t;
}

export const sin1024: Int16Array = buildSin1024();

/** Index the sine table with an arbitrary (possibly negative or >1024) angle, matching `(a)&1023`. */
export function sinAt(angle: number): number {
  return sin1024[((angle % SIN_LEN) + SIN_LEN) & (SIN_LEN - 1)] ?? 0;
}

/**
 * Perspective reciprocal-depth scale tables (STARS.ASM init_stars lines 141-161). For entry i∈[0,256):
 * the original computes `dx:ax = N·65536 / (150 + 4·i)` then `shr ax,1`, so
 *   muldiv[i] = trunc(N · 65536 / (150 + 4·i)) >> 1.
 * A star's z byte indexes these; the projection is `screen = (coord · muldiv[z]) >> 14` (see star-sim).
 * Y uses N=108 (the 4:3 vertical scale), X uses N=144.
 */
function buildMuldiv(n: number): Int32Array {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) t[i] = Math.trunc((n * 65536) / (150 + 4 * i)) >> 1;
  return t;
}

export function buildMuldivY(): Int32Array {
  return buildMuldiv(108);
}

export function buildMuldivX(): Int32Array {
  return buildMuldiv(144);
}

/**
 * The 32-bit linear congruential generator from STARS.ASM (lines 33-42):
 *   seed = (seed · 0x343FD + 0x269EC3) mod 2^32 ; result = high word (dx) ∈ [0, 65535].
 * `mov ax,dx` returns bits 16..31. Seed defaults to 0 (the original's `seed dd 0`).
 */
export class Lcg {
  private seed: number;

  constructor(seed = 0) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (Math.imul(this.seed, 0x343fd) + 0x269ec3) >>> 0;
    return (this.seed >>> 16) & 0xffff;
  }
}
