/**
 * The rotozoomer colours the face's index gradient (0..63) through a vivid spectrum, reproducing the
 * original's colourful look (its real palette is not in our LENS source; this is a tuned reconstruction
 * matching the reference screencast). A full-hue sweep turns the smooth shading into smooth rainbow bands.
 */

/** Palette entry count (the rotpic uses indices 0..63). */
export const ROTO_PALETTE_SIZE = 64;

/** HSV → RGB (h in [0,6) hue sectors, s/v in [0,1]); returns three 0..255 bytes. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) [r, g, b] = [c, x, 0];
  else if (h < 2) [r, g, b] = [x, c, 0];
  else if (h < 3) [r, g, b] = [0, c, x];
  else if (h < 4) [r, g, b] = [0, x, c];
  else if (h < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Build the 64-entry vivid palette (RGB bytes, 0..255). The hue sweeps the full circle across the index
 * gradient; the lowest indices (the image's black background) ramp up from black so the background stays
 * dark instead of a flat colour, matching the original's look.
 */
export function buildRotozoomPalette(): Uint8Array {
  const out = new Uint8Array(ROTO_PALETTE_SIZE * 3);
  for (let i = 0; i < ROTO_PALETTE_SIZE; i++) {
    const v = Math.min(1, i / 5); // index 0 → black, 5+ → full brightness
    const [r, g, b] = hsvToRgb((i / ROTO_PALETTE_SIZE) * 6, 1, v);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}
