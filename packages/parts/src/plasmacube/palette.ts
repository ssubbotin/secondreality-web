import { sar } from './cint.js';

/**
 * The cube palette and per-face light shading, ported from INITVECT (PLZFILL.C:40-54) and shadepal
 * (PLZA.ASM:262-286). The cube uses three 64-entry colour bands (one per face `color`):
 *   band 0 (color 0): 1..31 blue ramp, 32..63 white-with-blue.
 *   band 1 (color 1): 0..31 red ramp, 32..63 red→yellow.
 *   band 2 (color 2): 0..31 orange, 32..63 magenta→green.
 * Band c occupies palette entries [c·64, c·64+64). Each is built into a 256×RGB array (0..63 VGA
 * values); entries outside the three bands stay black.
 */
export function buildCubePalette(): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  // Helper to write into band `b` at offset `i` (entry b*64 + i).
  const put = (b: number, i: number, r: number, g: number, bl: number): void => {
    const o = (b * 64 + i) * 3;
    pal[o] = r;
    pal[o + 1] = g;
    pal[o + 2] = bl;
  };

  // band 0 — blue → white (PLZFILL.C:40-43). Note the ramp starts at index 1.
  for (let a = 1; a < 32; a++) put(0, a, 0, 0, a * 2);
  for (let a = 0; a < 32; a++) put(0, 32 + a, a * 2, a * 2, 63);

  // band 1 — red → yellow (PLZFILL.C:45-48).
  for (let a = 0; a < 32; a++) put(1, a, a * 2, 0, 0);
  for (let a = 0; a < 32; a++) put(1, 32 + a, 63, a * 2, 0);

  // band 2 — orange → magenta/green (PLZFILL.C:51-54).
  for (let a = 0; a < 32; a++) put(2, a, a, 0, Math.trunc((a * 2) / 3));
  for (let a = 0; a < 32; a++) put(2, 32 + a, 31 - a, a * 2, 21);

  return pal;
}

/**
 * shadepal (PLZA.ASM): scale one 64-entry colour band (192 bytes) by light intensity `shd`:
 * out = (in · shd) >> 6. Writes the shaded band for colour `c` into `out` (256×RGB), leaving the
 * other bands untouched. `shd` is the face light from sortFaces (typically ~0..63).
 */
export function shadeBand(out: Uint8Array, pal: Uint8Array, color: number, shd: number): void {
  const base = color * 64 * 3;
  for (let i = 0; i < 192; i++) {
    out[base + i] = sar((pal[base + i] ?? 0) * shd, 6);
  }
}
