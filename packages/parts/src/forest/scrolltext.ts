/**
 * The FOREST scrolltext strip + sliding font window, ported verbatim from `READ2.PAS`.
 *
 * `O2.SCI` (vendored as `OFOREST.SCI`) is a ColoRIX "RIX3" image: a 778-byte header (10-byte info +
 * 768-byte palette) then chunky 8-bit pixels. `READ2.PAS` reads 31 rows of 640 bytes starting at byte
 * `x*640 + 778` into `fbuf` (so `fbuf` is 31×640), then biases every non-zero pixel by `+128` to push the
 * text into the upper palette band (`for x ... if fbuf[x] > 0 then inc(fbuf[x],128)`).
 *
 * `font` is the 237×31 window the warp tables sample. It is initialised by copying `fbuf` columns 0..132
 * into `font` columns 104..236 (`move(fbuf[x*640], font[x*237+104], 133)`) with the read cursor `scp := 133`.
 * Each scroll step shifts the whole 7347-byte `font` buffer left by one byte (`move(font[1],font[0],237*31)`)
 * and refills each row's rightmost column from `fbuf` at `scp` (`font[ff*237+236] := fbuf[ff*640+scp]`),
 * then advances `scp` while `scp < 639`.
 */

import { FONT_H, FONT_W } from './pos.js';

/** Scrolltext strip width in the RIX3 source (READ2 reads 640 bytes/row). */
export const STRIP_W = 640;
/** Scrolltext strip height (31 source rows used). */
export const STRIP_H = FONT_H; // 31
/** Header bytes before pixel data in the RIX3 file (10-byte info + 768 palette). */
const STRIP_HEADER = 778;
/** Initial right-aligned fill width and matching start cursor (`move(...,133); scp := 133`). */
const INIT_FILL = 133;
const INIT_COL = FONT_W - INIT_FILL; // 104
/** Last refillable strip column (`if scp < 639 then inc(scp)`). */
const SCP_MAX = STRIP_W - 1; // 639

/**
 * Parse the scrolltext strip from a RIX3 `.SCI` buffer into a 31×640 byte array with the `+128` text bias
 * applied. Rows are read from `x*640 + 778` exactly as `READ2.PAS` does.
 */
export function parseScrolltext(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fbuf = new Uint8Array(STRIP_W * STRIP_H);
  for (let x = 0; x < STRIP_H; x++) {
    const srcBase = x * STRIP_W + STRIP_HEADER;
    const dstBase = x * STRIP_W;
    for (let col = 0; col < STRIP_W; col++) {
      const v = d[srcBase + col] ?? 0;
      fbuf[dstBase + col] = v > 0 ? (v + 128) & 0xff : 0;
    }
  }
  return fbuf;
}

/**
 * The sliding font window. Holds the 7347-byte `font` buffer and the strip read cursor `scp`, and exposes
 * `step()` which performs one column of right-to-left scroll exactly as `READ2.PAS scr(2)` does.
 */
export class Scroller {
  /** The 237×31 font window the warp tables sample, row-major. */
  readonly font = new Uint8Array(FONT_W * FONT_H);
  private readonly fbuf: Uint8Array;
  private scp = INIT_FILL;

  constructor(fbuf: Uint8Array) {
    this.fbuf = fbuf;
    this.reset();
  }

  /** Reset to the initial right-aligned fill (`move(fbuf,font+104,133); scp := 133`). */
  reset(): void {
    this.font.fill(0);
    for (let row = 0; row < FONT_H; row++) {
      const src = row * STRIP_W;
      const dst = row * FONT_W + INIT_COL;
      for (let k = 0; k < INIT_FILL; k++) this.font[dst + k] = this.fbuf[src + k] ?? 0;
    }
    this.scp = INIT_FILL;
  }

  /** Current strip read cursor (for tests / debug). */
  get cursor(): number {
    return this.scp;
  }

  /**
   * Advance one scroll column. Faithful port of `READ2.PAS scr(2)`:
   *   move(font[1],font[0],237*31)              ; shift the whole buffer left one byte
   *   for ff:=0 to 30 do font[ff*237+236] := fbuf[ff*640+scp]
   *   if scp < 639 then inc(scp)
   * The flat memmove crosses row boundaries (the original does too); each row's rightmost column is then
   * overwritten, so the visible per-row result is a clean left shift with a fresh column fed in.
   */
  step(): void {
    const font = this.font;
    const n = FONT_W * FONT_H;
    // move(font[1], font[0], n): font[i] := font[i+1] for i = 0..n-2 (copyWithin is the memmove).
    font.copyWithin(0, 1, n);
    for (let ff = 0; ff < FONT_H; ff++) {
      font[ff * FONT_W + (FONT_W - 1)] = this.fbuf[ff * STRIP_W + this.scp] ?? 0;
    }
    if (this.scp < SCP_MAX) this.scp++;
  }
}
