/**
 * The U2E scene palette (U2E.PAL): 256 RGB triplets in 6-bit VGA DAC units (0..63). The shade ramps for
 * each material live here — e.g. GRAYCEMENT at index 16 (ramp 16), BLUEMETAL at 64 (ramp 32), CYANMETAL
 * at 192. The flat-shaded face colour `base + calclight()` indexes directly into this LUT.
 *
 * For GPU upload the 6-bit values are scaled ×4 to 8-bit and the texture is tagged sRGB so the VGA DAC
 * bytes land verbatim (the same discipline the other parts use). Index 0 (background) is black.
 */

export const PALETTE_SIZE = 256;

/** Parse a raw 768-byte VGA palette (256 × RGB, 6-bit) into a Uint8Array. */
export function parsePalette(raw: Uint8Array): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 3);
  out.set(raw.subarray(0, Math.min(raw.length, PALETTE_SIZE * 3)));
  return out;
}

/** Expand a 6-bit palette to an 8-bit RGBA LUT (256×1), scaling DAC units ×4. Index 0 → opaque black. */
export function paletteToRgba(palette: Uint8Array): Uint8Array {
  const data = new Uint8Array(PALETTE_SIZE * 4);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    data[i * 4] = (palette[i * 3] ?? 0) * 4;
    data[i * 4 + 1] = (palette[i * 3 + 1] ?? 0) * 4;
    data[i * 4 + 2] = (palette[i * 3 + 2] ?? 0) * 4;
    data[i * 4 + 3] = 255;
  }
  return data;
}
