// packages/parts/src/plasma/palette.ts
const trunc = Math.trunc;

export const PALETTE_COUNT = 5;

/**
 * Build the 5 plasma palettes from ptau, reproducing init_plz (PLZ.C:182-213). Each is 256 RGB
 * triples (0..63); colour 0 is black, colours 1.. are written by the original's band loops. The
 * fade pre-scaling at init_plz:215-217 is part of the original's fixed-point copper fade, not the
 * final colours, so it is omitted — crossFade() does a plain lerp instead.
 */
export function buildPlasmaPalettes(ptau: Uint8Array): Uint8Array[] {
  const t = (i: number): number => ptau[i] ?? 0;
  const pals = Array.from({ length: PALETTE_COUNT }, () => new Uint8Array(256 * 3));

  // Each band loop appends RGB triples starting at colour index 1 (offset 3).
  const writer = (pal: Uint8Array) => {
    let o = 3;
    return (r: number, g: number, b: number): void => {
      pal[o++] = r;
      pal[o++] = g;
      pal[o++] = b;
    };
  };

  // pals[0] — RGB
  {
    const w = writer(pals[0]!);
    for (let a = 1; a < 64; a++) w(t(a), t(0), t(0));
    for (let a = 0; a < 64; a++) w(t(63 - a), t(0), t(0));
    for (let a = 0; a < 64; a++) w(t(0), t(0), t(a));
    for (let a = 0; a < 64; a++) w(t(a), t(0), t(63 - a));
  }
  // pals[1] — red/black
  {
    const w = writer(pals[1]!);
    for (let a = 1; a < 64; a++) w(t(a), t(0), t(0));
    for (let a = 0; a < 64; a++) w(t(63 - a), t(0), t(a));
    for (let a = 0; a < 64; a++) w(t(0), t(a), t(63 - a));
    for (let a = 0; a < 64; a++) w(t(a), t(63), t(a));
  }
  // pals[2] — white (half-bright)
  {
    const w = writer(pals[2]!);
    for (let a = 1; a < 64; a++) w(trunc(t(0) / 2), trunc(t(0) / 2), trunc(t(0) / 2));
    for (let a = 0; a < 64; a++) w(trunc(t(a) / 2), trunc(t(a) / 2), trunc(t(a) / 2));
    for (let a = 0; a < 64; a++)
      w(trunc(t(63 - a) / 2), trunc(t(63 - a) / 2), trunc(t(63 - a) / 2));
    for (let a = 0; a < 64; a++) w(trunc(t(0) / 2), trunc(t(0) / 2), trunc(t(0) / 2));
  }
  // pals[3] — red/white
  {
    const w = writer(pals[3]!);
    for (let a = 1; a < 64; a++) w(t(a), t(0), t(0));
    for (let a = 0; a < 64; a++) w(t(63), t(a), t(a));
    for (let a = 0; a < 64; a++) w(t(63 - a), t(63 - a), t(63));
    for (let a = 0; a < 64; a++) w(t(0), t(0), t(63));
  }
  // pals[4] — white II
  {
    const w = writer(pals[4]!);
    for (let a = 1; a < 75; a++)
      w(t(63 - trunc((a * 64) / 75)), t(63 - trunc((a * 64) / 75)), t(63 - trunc((a * 64) / 75)));
    for (let a = 0; a < 106; a++) w(0, 0, 0);
    for (let a = 0; a < 75; a++) {
      const v = t(trunc((a * 64) / 75));
      w(trunc((v * 8) / 10), trunc((v * 9) / 10), v);
    }
  }
  return pals;
}

/** Per-channel linear lerp between two 256×RGB palettes; t in 0..1. Returns a fresh 256×RGB array. */
export function crossFade(from: Uint8Array, to: Uint8Array, t: number): Uint8Array {
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round((from[i] ?? 0) + ((to[i] ?? 0) - (from[i] ?? 0)) * t);
  }
  return out;
}
