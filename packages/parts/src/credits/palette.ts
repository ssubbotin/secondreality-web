/**
 * The ENDSCRL greyscale palette, ported verbatim from the `setrgbpalette` calls in `main()`
 * (`MAIN.C:27-41`). The font writes only colour indices 0..3 (the 2-bit ink level becomes the index, since
 * the original ORs plane bits 1/2 for values ≤3), so the ramp that matters is:
 *
 *   index 0 = black (background, never written by the font)
 *   index 1 = (20,20,20)   ; setrgbpalette(1,20,20,20)
 *   index 2 = (40,40,40)   ; setrgbpalette(2,40,40,40)
 *   index 3 = (60,60,60)   ; setrgbpalette(3..15, 60,60,60)
 *
 * Indices 4..15 are also set to (60,60,60) by the original for completeness (the 16-colour EGA palette);
 * the font never reaches them. Values are 6-bit VGA DAC (0..63); the GPU LUT multiplies by 4 to reach 8-bit.
 */

function set(p: Uint8Array, i: number, r: number, g: number, b: number): void {
  p[i * 3] = r;
  p[i * 3 + 1] = g;
  p[i * 3 + 2] = b;
}

export function buildCreditsPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  // index 0 stays black.
  set(p, 1, 20, 20, 20);
  set(p, 2, 40, 40, 40);
  for (let i = 3; i <= 15; i++) set(p, i, 60, 60, 60);
  return p;
}
