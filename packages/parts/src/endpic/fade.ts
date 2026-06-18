/**
 * The ENDPIC flash/fade, ported verbatim from `ENDPIC/BEG.C`:
 *
 *   for (c = 0; c <= 128; c++) {
 *     for (a = 0; a < 768-3; a++) pal2[a] = ((128-c)*63 + palette[a]*c) / 128;
 *     setpalarea(pal2, 0, 255);
 *   }
 *
 * At `c=0` every touched component is `63` (a full-white flash); at `c=128` the palette is the real
 * picture palette. C integer division truncates toward zero. BEG.C's loop bound `a < 768-3` leaves the
 * final three palette bytes (index 255's RGB) at their cleared-to-black value — that off-by-three is
 * reproduced here exactly so the fade matches the original frame-for-frame.
 */

/** Number of fade frames (c = 0..128 inclusive), one per `dis_waitb()` in the original. */
export const FADE_STEPS = 129;

const PAL_BYTES = 768;
const TOUCHED = PAL_BYTES - 3; // BEG.C's `a < 768-3`

/**
 * Compute the 6-bit (0..63) palette for fade frame `c` from the picture's real 6-bit palette.
 * `c` is clamped into [0, 128]. Returns a fresh 768-byte palette (256 RGB triples).
 */
export function fadeStep(c: number, palette6: Uint8Array): Uint8Array {
  const cc = c < 0 ? 0 : c > 128 ? 128 : c;
  const out = new Uint8Array(PAL_BYTES); // tail (765..767) stays 0, matching BEG.C
  const inv = (128 - cc) * 63;
  for (let a = 0; a < TOUCHED; a++) {
    out[a] = Math.trunc((inv + (palette6[a] ?? 0) * cc) / 128);
  }
  return out;
}
