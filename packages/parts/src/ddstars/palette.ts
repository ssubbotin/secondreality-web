/**
 * The DDSTARS star palette (STARS.ASM do_stars lines 569-618), as 256 6-bit VGA RGB triples (0..63).
 *
 * The original fades the three star DAC entries up from black over the first 32 ticks: each tick it writes
 *   pal[i] = trunc((C · bl) / 256)   with bl = clamp((starpalfade+1) << 3, 255)
 * for the per-channel constants C below, then freezes once starpalfade > 32 (the block is skipped). We bake
 * the *frozen endpoint* (bl = 255) here; the renderers apply the time fade as a global brightness scale
 * f∈[0,1] (see star-sim `palfadeScale`), which is byte-exact at the steady state shown for ~all of the part.
 *
 * The MASM source constants are integer-folded at assembly time (e.g. `25*70/100` = trunc(1750/100) = 17):
 *   index 1 — far/dim band  (z ≥ 180): C = (17, 21, 26)   = (25,31,38)·70/100
 *   index 2 — mid band      (110≤z<180): C = (25, 32, 38)   = (45,58,69)·56/100
 *   index 3 — near/bright   (z < 110): C = (42, 53, 63)   = (67,84,99)·64/100
 * A plotted star's bit-plane combination maps to these indices (plane A → 1, plane B → 2, both → 3); the
 * background and everything else stay black. Tag the uploaded texture SRGBColorSpace so the 6-bit→8-bit (×4)
 * bytes land verbatim on the canvas.
 */

/** Per-channel constants C, integer-folded from the MASM `n*scale/100` literals (see header). */
const STAR_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [Math.trunc((25 * 70) / 100), Math.trunc((31 * 70) / 100), Math.trunc((38 * 70) / 100)], // index 1
  [Math.trunc((45 * 56) / 100), Math.trunc((58 * 56) / 100), Math.trunc((69 * 56) / 100)], // index 2
  [Math.trunc((67 * 64) / 100), Math.trunc((84 * 64) / 100), Math.trunc((99 * 64) / 100)], // index 3
];

/** Final (bl=255) fade value of one channel: trunc((C · 255) / 256), via the original `mul bl`/high-byte. */
function faded(c: number): number {
  return (c * 255) >> 8;
}

export function buildStarPalette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  for (let band = 0; band < STAR_BANDS.length; band++) {
    const c = STAR_BANDS[band] ?? [0, 0, 0];
    const i = (band + 1) * 3; // star indices 1,2,3
    p[i] = faded(c[0] ?? 0);
    p[i + 1] = faded(c[1] ?? 0);
    p[i + 2] = faded(c[2] ?? 0);
  }
  return p;
}
