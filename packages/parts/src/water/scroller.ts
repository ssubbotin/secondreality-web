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
 * `scp` of row `x` is `font[x*400 + scp]`. `scp` advances over the message once.
 *
 * TERMINATION (the fidelity fix). The original DEMO.PAS clamps `scp` with `if scp < 390 then inc(scp)`,
 * which freezes `scp` at column 390 and then re-injects that single non-empty font column on *every*
 * subsequent step — leaving a frozen vertical strip of glyph ink streaming across the water forever. The
 * DOS demo merely outran this by ending the part on the DIS timeline (plus a palette fade). Ported
 * literally, that clamp is exactly the "scroller leaks pixels and never terminates" defect: the trailing
 * column never clears. The faithful repair walks `scp` across the *entire* message (0..FONT_WIDTH, so the
 * last glyph columns 391..399 the clamp dropped are now shown too) and, once the source is exhausted,
 * injects blank (0) columns instead of clamping — so the message drains out through the left of the
 * shifting buffer and the field returns to pure background. The blit (`Putrouts1`, ROUTINES.ASM) already
 * bounds itself by the `dx = 158*34` cell counter and the per-cell `cx = count`; this bounds the *source*.
 */

/** Width of the font strip in columns (the original `font[x*400 + scp]` stride). */
export const FONT_WIDTH = 400;
/** Rows injected per scroll step (`for x := 0 to 33`). */
export const FONT_ROWS = FBUF_HEIGHT; // 34
/**
 * Last column index of the scroll message. After `scp` passes this the source is exhausted and the
 * scroller injects blanks so the buffer drains cleanly (replaces the original's `scp < 390` freeze).
 */
export const SCP_END = FONT_WIDTH; // 400

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

  /** Current scroll column (0..SCP_END); exposed for tests. */
  get column(): number {
    return this.scp;
  }

  /** True once the whole message has been fed in and only blanks remain to inject. */
  get finished(): boolean {
    return this.scp >= SCP_END;
  }

  /**
   * Advance one scroll step. `font` is the 400×34 strip (row-major, FONT_WIDTH stride).
   * Mirrors `move(fbuf[1],fbuf,...)` → inject one column → advance `scp`. Once `scp` reaches the end of
   * the message (`SCP_END`) the injected column is blank, so the buffer (and screen) clears as the
   * message scrolls off — rather than the original's frozen-column leak.
   */
  scrollStep(font: Uint8Array): void {
    // move(fbuf[1], fbuf, sizeof(fbuf)) — shift the whole flat buffer left by one byte.
    this.fbuf.copyWithin(0, 1);
    this.fbuf[FBUF_LEN - 1] = 0;
    // for x := 0 to 33 do fbuf[158 + x*158] := font[x*400 + scp];  (blank once the source is exhausted)
    const col = this.scp;
    const inMessage = col < SCP_END;
    for (let x = 0; x < FONT_ROWS; x++) {
      const dst = FBUF_WIDTH + x * FBUF_WIDTH; // 158*(x+1)
      if (dst >= FBUF_LEN) break;
      this.fbuf[dst] = inMessage ? (font[x * FONT_WIDTH + col] ?? 0) : 0;
    }
    // Advance the source index, bounded at SCP_END (past which only blanks are injected).
    if (this.scp < SCP_END) this.scp += 1;
  }
}

// Re-export so the blit/effect can size against the same constants.
export { FBUF_HEIGHT, FBUF_WIDTH, FRAME_RECORDS };
