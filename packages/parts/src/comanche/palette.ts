import { buildSin1024, cdiv } from './tables.js';

/**
 * The COMAN palette (MAIN.C main()), as 256 6-bit VGA RGB triples (0..63). Ported verbatim:
 *
 *   for a in 0..255:                                  // the sky/terrain colour ramp
 *     uc = (223 − a·22/26) · 3                         // target colour index (many a share one uc)
 *     pal[uc+1] (green) = clamp((230−a)/4 + sin1024[a·4 & 1023]/32, 0, 63)
 *     pal[uc+2] (blue)  = clamp((255−a)/3, ≤63)
 *     pal[uc+0] (red)   = (40 − clamp(|a−220|, ≤40)) / 3     // a small red bump around a≈220
 *   for a in 0..(768−48):  pal[a] = min(pal[a]·9/6, 63)      // brightness boost over indices 0..239
 *   for a in 0..23:        uc=(255−a)·3; pal[uc] = max(a−4,0)/2; green=blue=0   // the red band 232..255
 *   pal[0..2] = 0                                            // index 0 forced black
 *   for x in 720..767:  pal[x] = combg[16+x]                 // DEFERRED — the COMBG.LBM picture entries
 *
 * The final COMBG loop (palette indices 240..255) needs the not-yet-built image pipeline; it is
 * **deferred** — those entries keep their red-band procedural values (a faithful stub). All `/` are C
 * integer division. Tag the uploaded texture SRGBColorSpace so the 6-bit→8-bit (×4) bytes land verbatim.
 */
export function buildComanchePalette(): Uint8Array {
  const sin1024 = buildSin1024();
  const p = new Uint8Array(256 * 3);
  const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

  for (let a = 0; a < 256; a++) {
    const uc = (223 - cdiv(a * 22, 26)) * 3;
    let g = cdiv(230 - a, 4) + cdiv(sin1024[(a * 4) & 1023] ?? 0, 32);
    g = clamp(g, 0, 63);
    p[uc + 1] = g;
    let b = cdiv(255 - a, 3);
    if (b > 63) b = 63;
    p[uc + 2] = b;
    let r = a - 220;
    if (r < 0) r = -r;
    if (r > 40) r = 40;
    r = 40 - r;
    p[uc] = cdiv(r, 3);
  }
  // Brightness boost over palette bytes 0..(768 − 16·3) = 0..719 → colour indices 0..239.
  for (let i = 0; i < 768 - 16 * 3; i++) {
    let b = cdiv((p[i] ?? 0) * 9, 6);
    if (b > 63) b = 63;
    p[i] = b;
  }
  // The red band in the top 24 colour indices (232..255).
  for (let a = 0; a < 24; a++) {
    const uc = (255 - a) * 3;
    let r = a - 4;
    if (r < 0) r = 0;
    p[uc] = cdiv(r, 2);
    p[uc + 1] = 0;
    p[uc + 2] = 0;
  }
  p[0] = 0;
  p[1] = 0;
  p[2] = 0;
  // DEFERRED: the COMBG.LBM-sourced entries (colour indices 240..255) are left at their red-band
  // stub values until the image pipeline lands. See STATUS.
  return p;
}
