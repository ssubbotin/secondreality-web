import { COPPER_BASE, COPPER_LEN } from './palette.js';

/** The original mode-X opening field is 320×200. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;

/**
 * The copper backdrop the opening cards sit on. The original ALKU scrolls the HOI picture behind the text
 * with a per-scanline copper (`COPPER.ASM` rewriting the CRTC start + palette per line); that picture
 * scroller is the deferred credit-roll half. For part #1 we render the classic **copper-bar** look: a band
 * of saturated hues mapped across the scanlines, scrolling vertically with the frame. Two pure pieces:
 *
 *  - `copperRowIndex(y, frame)` → the palette index (within the copper band) for scanline `y`.
 *  - `copperBandColors(frame)` → the COPPER_LEN animated 6-bit RGB triples for the band.
 */

/** Map a scanline to a copper-band palette index, scrolling with `frame`. */
export function copperRowIndex(y: number, frame: number): number {
  // A triangle ramp over the band, offset by the frame so the bars drift down the screen.
  const phase = (y + frame) % COPPER_LEN;
  const tri = phase < COPPER_LEN / 2 ? phase : COPPER_LEN - 1 - phase;
  return COPPER_BASE + (((tri * 2) % COPPER_LEN) | 0);
}

/** 6-bit sine helper in 0..63. */
function sin6(t: number): number {
  return Math.round((Math.sin(t) * 0.5 + 0.5) * 63);
}

/**
 * The animated copper-band colours: COPPER_LEN RGB triples cycling through saturated hues, with a slow
 * per-frame drift so the backdrop breathes. Returned as flat 6-bit RGB to splice into the palette.
 */
export function copperBandColors(frame: number): Uint8Array {
  const out = new Uint8Array(COPPER_LEN * 3);
  const drift = frame * 0.05;
  for (let i = 0; i < COPPER_LEN; i++) {
    const a = (i / COPPER_LEN) * Math.PI * 2;
    out[i * 3] = sin6(a + drift);
    out[i * 3 + 1] = sin6(a + drift + 2.094); // +120°
    out[i * 3 + 2] = sin6(a + drift + 4.188); // +240°
  }
  return out;
}
