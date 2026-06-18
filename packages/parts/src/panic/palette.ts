/**
 * The PANIC picture palette. `MONSTER.PAL` is a standalone 768-byte VGA palette = 256 × 6-bit RGB
 * triples (0..63), loaded by `SHUTDOWN.C` (`read(fff,kuvapal,768)`) and pushed to the DAC via
 * `tw_setpalette` (which `outsb`s the bytes straight to port 0x3c9 — i.e. 6-bit DAC values).
 */
export const PALETTE_BYTES = 768;

/** Copy the 768-byte VGA palette into a fresh `Uint8Array(256*3)` of 6-bit components. */
export function parseVgaPalette(bytes: Uint8Array): Uint8Array {
  if (bytes.length < PALETTE_BYTES) {
    throw new Error(`MONSTER.PAL too short: ${bytes.length} < ${PALETTE_BYTES}`);
  }
  return bytes.slice(0, PALETTE_BYTES);
}

/**
 * Expand a 256 × 6-bit VGA palette into a 256×1 sRGB LUT (RGBA bytes). The 6-bit DAC value v maps to
 * the 8-bit byte v×4 (the VGA DAC's top-6-bits behaviour the other parts reproduce); tag the uploaded
 * texture `SRGBColorSpace` so these bytes land verbatim on the canvas.
 */
export function paletteLut(palette: Uint8Array): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lut[i * 4] = (palette[i * 3] ?? 0) * 4;
    lut[i * 4 + 1] = (palette[i * 3 + 1] ?? 0) * 4;
    lut[i * 4 + 2] = (palette[i * 3 + 2] ?? 0) * 4;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/**
 * Reproduce SHUTDOWN.C's `fadepals[a][b] = (a*63 + kuvapal[b]*(64-a))/64` — a per-component linear
 * blend of the picture palette toward white (63), as `a` rises 0→63. C integer division (trunc). The
 * crash flash is a palette swap to `fadepals[fadeA]`; we apply the same blend to the 6-bit palette and
 * expand the result with `paletteLut`. SHUTDOWN.C only fades components b≥3 (it leaves colour index 0's
 * RGB alone, then forces it white separately); we fade all components and pin colour 0 to black so the
 * background stays black through the flash, matching what shows on screen (the buffer's 0s are black).
 */
export function fadeVgaPalette(palette: Uint8Array, a: number): Uint8Array {
  const out = new Uint8Array(256 * 3);
  const amt = a < 0 ? 0 : a > 63 ? 63 : a;
  for (let i = 0; i < 256 * 3; i++) {
    out[i] = Math.trunc((amt * 63 + (palette[i] ?? 0) * (64 - amt)) / 64);
  }
  // Index 0 is the background; keep it black so the flash doesn't wash the whole screen white.
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}
