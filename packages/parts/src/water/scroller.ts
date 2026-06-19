import { FBUF_HEIGHT, FBUF_WIDTH, FRAME_RECORDS } from './wat-data.js';

/**
 * The scroll buffer + text advance, ported verbatim from `WATER/DEMO.PAS`.
 *
 * `fbuf` is the 158×34 buffer the blit walks cell-by-cell (`bx` = 0..5371). Each scroll step the original
 * does, in order:
 *
 *   move(fbuf[1], fbuf, sizeof(fbuf));               { shift the whole flat buffer left by one byte }
 *   for x := 0 to 33 do fbuf[158 + x*158] := font[x*400 + scp];   { inject one font column }
 *   if scp < 390 then inc(scp);
 *
 * `fbuf[158 + x*158]` is `fbuf[(x+1)*158]` — the start of "row x+1" in the flat buffer. Because the whole
 * buffer is a single 1-D strip shifted left by one byte every step, the text streams leftward through it;
 * the stride-158 injection points feed the 34-row font strip in. We reproduce the flat-buffer behaviour
 * exactly (including the one extra trailing byte of the original `array[0..158*34]`).
 *
 * The font strip is the 400×34 image from `_miekka+778` (our `FONT.CLX`): row-major, 400 wide, so column
 * `scp` of row `x` is `font[x*400 + scp]`. `scp` advances 0→390 (clamped), revealing the message once.
 */

/** Width of the font strip in columns (the original `font[x*400 + scp]` stride). */
export const FONT_WIDTH = 400;
/** Rows injected per scroll step (`for x := 0 to 33`). */
export const FONT_ROWS = FBUF_HEIGHT; // 34
/** Last readable scroll column — `if scp < 390 then inc(scp)`. */
export const SCP_MAX = 390;

/** Flat buffer length = `sizeof(fbuf)` for `fbuf : array[0..158*34] of byte` = 158*34 + 1. */
export const FBUF_LEN = FBUF_WIDTH * FBUF_HEIGHT + 1; // 5373

export class Scroller {
  /** The flat scroll buffer the blit indexes by `bx`. */
  readonly fbuf = new Uint8Array(FBUF_LEN);
  /** Current font-strip read column (`scp`). */
  private scp = 0;

  /** Reset to the start of the message with an empty buffer (matches DEMO.PAS init). */
  reset(): void {
    this.fbuf.fill(0);
    this.scp = 0;
  }

  /** Current scroll column (0..SCP_MAX); exposed for tests. */
  get column(): number {
    return this.scp;
  }

  /**
   * Advance one scroll step. `font` is the 400×34 strip (row-major, FONT_WIDTH stride).
   * Mirrors `move(fbuf[1],fbuf,...)` → inject column → `if scp < 390 then inc(scp)`.
   */
  scrollStep(font: Uint8Array): void {
    // move(fbuf[1], fbuf, sizeof(fbuf)) — shift the whole flat buffer left by one byte.
    this.fbuf.copyWithin(0, 1);
    this.fbuf[FBUF_LEN - 1] = 0;
    // for x := 0 to 33 do fbuf[158 + x*158] := font[x*400 + scp];
    for (let x = 0; x < FONT_ROWS; x++) {
      const dst = FBUF_WIDTH + x * FBUF_WIDTH; // 158*(x+1)
      if (dst >= FBUF_LEN) break;
      this.fbuf[dst] = font[x * FONT_WIDTH + this.scp] ?? 0;
    }
    // if scp < 390 then inc(scp);
    if (this.scp < SCP_MAX) this.scp += 1;
  }
}

// Re-export so the blit/effect can size against the same constants.
export { FBUF_HEIGHT, FBUF_WIDTH, FRAME_RECORDS };
