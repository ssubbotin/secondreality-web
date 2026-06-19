// The glenz palette + face-brightness rule. The original draws the FC backdrop picture (GLENZ/FC.UH) and
// the additive glenz solids OR their colour over it (NEW.ASM ng_pass3). The DAC palette during the loop is
// MAIN.C's `tmppal` (MAIN.C:357-388): indices 0..15 are the FC picture's own 16-colour ramp (`backpal`,
// copied from the picture's palette), and the glenz overlay reuses `a&7` brightened by the lit bit. The
// original additionally reprogrammed the DAC per face from each face's brightness (VEC.ASM demo_glz); a
// static index->colour LUT can't do that, so the glenz overlay brightening here is keyed by *coverage*
// (the more faces overlap, the brighter/glassier the pixel) — a documented compromise faithful to the
// observable look. buildGlenzPalette reproduces `tmppal` byte-exactly; buildGlenzRenderPalette is the
// composite LUT the GPU surface samples (FC base + glenz coverage brightening).

export const PAL_BYTES = 768; // 256 entries * 3 (6-bit VGA components)

/**
 * The synthetic 16-entry "fadeout" ramp MAIN.C rebuilds late in the loop (MAIN.C:769-787), kept as a
 * known reference fixture for the buildGlenzPalette test:
 *   r = (a&1?10:0)+(a&2?30:0)+(a&4?20:0); g=b=0; if(a&8){ r+=16; g+=16; b+=16; } clamp 63.
 * (The live background ramp is the FC picture's own palette, fc-picture.ts fcBackpal — not this.)
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
 * buildGlenzPalette (MAIN.C:366-388): the 256-entry `tmppal` VGA LUT, byte-exact.
 *   for a in [0,256): base = a<16 ? a : (a&7); take backpal[base]; if (a&8) && a>15 add 16 to each
 *   component; clamp 63.
 * Indices 0..15 are the straight background ramp; 16..255 reuse hue (a&7) and brighten on bit 3. Kept as
 * the verified reference of the original DAC table (the FC picture's `backpal` feeds it).
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

/** Count set bits in a byte. */
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
 * The glenz *render* palette, keyed by the additive fill's byte = `fcIndex | glenzBits`.
 *
 * Bits 0..3 carry the FC backdrop index (the picture only uses indices 0..14); the glenz fill ORs further
 * colour bits (render.ts: a per-face slot bit plus bit 3, the demo_glz "lit" bit) over them. A pixel the
 * glenz solids never touch keeps its FC byte and renders the FC picture colour verbatim from `backpal`;
 * where the solids overlap, the extra set bits raise the pixel toward a cool blue-white glass highlight —
 * the additive/transparent glenz look. This stands in for the original per-face DAC reprogramming
 * (VEC.ASM demo_glz), which a static LUT cannot reproduce (see STATUS); it is faithful to the observable
 * look, with the genuine FC backdrop underneath (replacing the earlier procedural copper-bar stub).
 *
 * `backpal` is the FC picture's own 16-colour 6-bit ramp (fc-picture.ts fcBackpal).
 */
export function buildGlenzRenderPalette(backpal: Uint8Array): Uint8Array {
  const pal = new Uint8Array(PAL_BYTES);
  for (let a = 0; a < 256; a++) {
    // FC backdrop base colour (the low nibble selects one of the 16 picture colours).
    const base = a & 0x0f;
    const br = backpal[base * 3] ?? 0;
    const bg = backpal[base * 3 + 1] ?? 0;
    const bb = backpal[base * 3 + 2] ?? 0;

    // Glenz coverage: bits above the FC nibble (4..7) plus the lit bit (3). The more set, the glassier.
    const cover = popcount8(a & 0xf0) + (a & 0x08 ? 1 : 0);
    // t in 0..1: how much glass highlight to add over the FC base.
    const t = Math.min(1, cover / 4);

    // Blend the FC base toward a cool blue-white glenz highlight as coverage rises.
    const hr = 24 + t * 39;
    const hg = t * t * 55;
    const hb = t * 63;
    const r = Math.round(br * (1 - t) + Math.max(br, hr) * t);
    const g = Math.round(bg * (1 - t) + Math.max(bg, hg) * t);
    const b = Math.round(bb * (1 - t) + Math.max(bb, hb) * t);

    pal[a * 3] = Math.min(63, r);
    pal[a * 3 + 1] = Math.min(63, g);
    pal[a * 3 + 2] = Math.min(63, b);
  }
  return pal;
}
