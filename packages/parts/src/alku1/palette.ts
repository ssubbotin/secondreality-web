/**
 * The opening palette. The original ALKU ORs the font's 2-bit level into a VGA plane band (`0x40/0x80/0xC0`)
 * and fades the whole palette black→text→black per card via `dofade` (MAIN.C:301-312). For the
 * index-buffer renderer we keep a small dedicated **text ramp** (a white-ward gradient at TEXT_BASE+1..3)
 * the glyph ink maps onto, a black background at index 0, and a **copper band** of saturated hues for the
 * backdrop bars. Indices are 6-bit VGA (0..63); the GPU LUT multiplies by 4 to reach 8-bit.
 */

/** Glyph ink levels 1/2/3 map onto palette indices TEXT_BASE+level. */
export const TEXT_BASE = 0x40;

/** Copper backdrop band: COPPER_BASE .. COPPER_BASE+COPPER_LEN-1 hold the animated bar colours. */
export const COPPER_BASE = 0x10;
export const COPPER_LEN = 0x20;

function set(p: Uint8Array, i: number, r: number, g: number, b: number): void {
  p[i * 3] = Math.min(r, 63);
  p[i * 3 + 1] = Math.min(g, 63);
  p[i * 3 + 2] = Math.min(b, 63);
}

export function buildAlkuPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  // Index 0: black background.
  set(p, 0, 0, 0, 0);
  // Text ramp: level 1 dim grey → level 3 full white, so black→text fades read as the glyph lighting up.
  set(p, TEXT_BASE + 1, 28, 28, 30);
  set(p, TEXT_BASE + 2, 46, 46, 50);
  set(p, TEXT_BASE + 3, 63, 63, 63);
  // Copper band base colour (a deep blue); the per-frame animation rewrites these entries.
  for (let i = 0; i < COPPER_LEN; i++) set(p, COPPER_BASE + i, 0, 0, 0);
  return p;
}

/**
 * `dofade`'s per-step blend (MAIN.C:308): `out = (pal1*(64-a) + pal2*a) >> 6`, integer arithmetic, with
 * `a` (here `t`) the 0..64 fade position. Produces the active palette to upload to the LUT.
 */
export function lerpPalette(pal1: Uint8Array, pal2: Uint8Array, t: number): Uint8Array {
  const a = t < 0 ? 0 : t > 64 ? 64 : t;
  const n = Math.min(pal1.length, pal2.length);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = ((pal1[i] ?? 0) * (64 - a) + (pal2[i] ?? 0) * a) >> 6;
  }
  return out;
}
