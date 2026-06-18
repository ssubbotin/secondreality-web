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
