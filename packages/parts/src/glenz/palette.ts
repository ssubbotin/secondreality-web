// The glenz palette + face-brightness rule. The original loads the 16-colour background ramp from the FC
// picture (deferred — see STATUS) and animates it per scanline (the copper bars). We use the procedural
// ramp MAIN.C builds itself (MAIN.C:557-584) as a faithful stand-in: a red-biased copper gradient keyed
// off the colour-index bits, which is exactly what the additive glenz fill ORs over. buildGlenzPalette
// reproduces MAIN.C:357-388 (`tmppal`): the 256-entry LUT that turns OR-accumulated colour bytes into a
// brightening ramp.

export const PAL_BYTES = 768; // 256 entries * 3 (6-bit VGA components)

/**
 * The 16-entry background ramp, MAIN.C:557-584 verbatim:
 *   r = (a&1?10:0)+(a&2?30:0)+(a&4?20:0); g=b=0; if(a&8){ r+=16; g+=16; b+=16; } clamp 63.
 * A copper-style red gradient that brightens with bit 3 set.
 */
export function buildBackpalRamp(): Uint8Array {
  const bp = new Uint8Array(16 * 3);
  for (let a = 0; a < 16; a++) {
    let r = 0;
    let g = 0;
    let b = 0;
    if (a & 1) r += 10;
    if (a & 2) r += 30;
    if (a & 4) r += 20;
    if (a & 8) {
      r += 16;
      g += 16;
      b += 16;
    }
    bp[a * 3] = Math.min(63, r);
    bp[a * 3 + 1] = Math.min(63, g);
    bp[a * 3 + 2] = Math.min(63, b);
  }
  return bp;
}

/**
 * buildGlenzPalette (MAIN.C:366-388): 256-entry VGA LUT.
 *   for a in [0,256): base = a<16 ? a : (a&7); take backpal[base]; if (a&8) && a>15 add 16 to each
 *   component; clamp 63.
 * Indices 0..15 are the straight background ramp; 16..255 reuse hue (a&7) and brighten on bit 3 — so an
 * OR-accumulated colour byte renders brighter the more (and higher) bits it carries.
 */
export function buildGlenzPalette(backpal: Uint8Array): Uint8Array {
  const pal = new Uint8Array(PAL_BYTES);
  for (let a = 0; a < 256; a++) {
    const base = a < 16 ? a : a & 7;
    let r = backpal[base * 3] ?? 0;
    let g = backpal[base * 3 + 1] ?? 0;
    let b = backpal[base * 3 + 2] ?? 0;
    if (a & 8 && a > 15) {
      r += 16;
      g += 16;
      b += 16;
    }
    pal[a * 3] = Math.min(63, r);
    pal[a * 3 + 1] = Math.min(63, g);
    pal[a * 3 + 2] = Math.min(63, b);
  }
  return pal;
}

/**
 * faceBrightness (GLENZ/VEC.ASM:demo_glz): convert the signed cross-product magnitude to a 0..63 light
 * value. lightshift==9 (the dominant case) uses `cross >> 7`; otherwise the asm's (cross>>8)+(cross>>9)
 * ~1.5x blend (a documented simplification of the exact shrd sequence). Clamped to [0,63].
 */
export function faceBrightness(cross: number, lightshift: number): number {
  let v: number;
  if (lightshift === 9) v = cross >> 7;
  else v = (cross >> 8) + (cross >> 9);
  if (v < 0) v = 0;
  if (v > 63) v = 63;
  return v;
}

/** Count set bits in a byte (coverage = number of overlapping faces, as OR-accumulated by the fill). */
function popcount8(a: number): number {
  let n = 0;
  let v = a & 0xff;
  while (v) {
    n += v & 1;
    v >>= 1;
  }
  return n;
}

/**
 * The glenz *render* palette: a 256-entry 6-bit VGA LUT keyed by the additive fill's OR-accumulated colour
 * byte. The original brightened overlaps by reprogramming the VGA DAC per face from each face's brightness
 * (demo_glz); a static index->colour LUT can't do that, so for the web port we brighten by *coverage* —
 * the more faces overlap (the more bits set), the brighter and glassier the pixel — which reproduces the
 * additive glass look the part is known for. The hue runs the copper red base (bit-0 group) up to a cool
 * blue-white glenz highlight as coverage rises; bit 3 (the demo_glz "lit" bit) adds a fixed lift.
 * DOCUMENTED COMPROMISE (see STATUS): faithful to the observable look, not to the per-face DAC writes.
 */
export function buildGlenzRenderPalette(): Uint8Array {
  const pal = new Uint8Array(PAL_BYTES);
  for (let a = 0; a < 256; a++) {
    const cover = popcount8(a & 0x07) + popcount8(a & 0xf0); // coverage bits (exclude the lit bit 3)
    const lit = a & 0x08 ? 1 : 0;
    // t in 0..1: how glassy/bright this pixel is.
    const t = Math.min(1, (cover + lit) / 5);
    // Copper-red base warming to a blue-white glenz highlight.
    const r = Math.round(12 + t * 51);
    const g = Math.round(t * t * 55);
    const b = Math.round(t * 63);
    pal[a * 3] = Math.min(63, a === 0 ? 0 : r);
    pal[a * 3 + 1] = Math.min(63, a === 0 ? 0 : g);
    pal[a * 3 + 2] = Math.min(63, a === 0 ? 0 : b);
  }
  return pal;
}

/**
 * A procedural copper-bar background for the 320x200 field (the FC picture is deferred). Returns an 8-bit
 * index buffer whose per-scanline value walks the low copper-ramp indices, giving the moving colour bands
 * the glenz solids are composited over. `phase` shifts the bars (animate it from the music clock).
 */
export function buildCopperBackground(width: number, height: number, phase: number): Uint8Array {
  const bg = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    // A smooth triangular ramp over the low indices 1..7 (the copper red gradient); bit 3 unset so the
    // glenz fill's lit bit still reads as a brightness lift over the background.
    const t = Math.abs(((((y * 2 + phase) % 256) + 256) % 256) - 128) / 128; // 0..1 triangle
    const idx = 1 + Math.min(6, Math.round(t * 6));
    bg.fill(idx, y * width, y * width + width);
  }
  return bg;
}
