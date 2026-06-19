/**
 * The DDSTARS "Desert Dream" text/picture reveal — a faithful port of STARS.ASM `risetext` and the
 * `do_stars` frame schedule that drives it (lines 413-538 and 650-667).
 *
 * The original renders into the mode-X back-buffer (80 bytes per row, 4-plane addressing) but the reveal
 * only ever touches plane 0 and plane 1, copying 40 bytes per plane = one full 320-pixel row per row of the
 * `_textpic` source. In chunky 8-bit terms (what we composite in) it is therefore a per-row copy of the
 * 2-bit `_textpic` indices, framed by black "lip" rows, with the whole block sliding/growing as the open and
 * close counters animate. This module reproduces that exactly.
 *
 * The schedule (do_stars, the `starframe` counter incremented once per tick):
 *   frame == 1200 → block 1: startxtp0 = 80 (source row 1), startxtopen = -256, startxtclose = 1500
 *   frame == 3200 → block 2: startxtp0 = 101*80 (source row 101), startxtopen = -256, startxtclose = 1500
 * (Block 2 simply re-points `startxtp0` and re-arms the counters; the second text overwrites the first.)
 *
 * Each tick `risetext` runs:
 *   startxtopen += 1   (clamped: stops at 99)
 *   startxtclose -= 1  (clamped: stops at 0)
 *   startxtuse = min(startxtopen, startxtclose)
 *   if startxtuse <= 0 → nothing visible (return)
 *   else clamp startxtuse to >= 2, draw the curtain.
 *
 * The curtain (with `use = startxtuse`, `cx = use - 1`, source pointer `si = 0x40 + startxtp0`, anchored at
 * destination half-row `150 - use`):
 *   1. a black 40-byte half-row at `di - 40`  (the rising top lip), then `di += 80`
 *   2. if rows remain, another black full row, then `di += 80`
 *   3. then `cx` source rows copied verbatim (`di += 80`, `si += 80` each), and
 *   4. a final black bottom-lip row.
 * `di` advances by 80 bytes = one screen row; `150 - use` is in the *bottom* (reflection) half of the
 * 200-row screen, so the text rises out of the horizon as `use` grows.
 *
 * Cite: DDSTARS/STARS.ASM (`risetext` / `do_stars` `@@st1`/`@@st2`), DDSTARS/POLYEGA.ASM (the polygon filler
 * is `include`d but the shipped `risetext` reveal is the planar copy above — the `_nostar1`/`_nostar2`
 * polygon-clip path in the copy loops is commented out in STARS.ASM).
 */

import { SCREEN_H, SCREEN_W } from './raster.js';

/** Pixel offset where `_textpic` data begins (`mov si,040h` — the 64-byte ".16" header). */
export const TEXTPIC_DATA_OFFSET = 0x40;
/** Source-row stride of the 2-plane `_textpic` in bytes (2 planes × 40). One screen row of pixels. */
export const TEXTPIC_ROW_BYTES = 80;

/** Block 1 source pointer (`mov cs:startxtp0,80` → source row 1). */
export const STARTXTP0_BLOCK1 = 80;
/** Block 2 source pointer (`mov cs:startxtp0,101*80` → source row 101). */
export const STARTXTP0_BLOCK2 = 101 * 80;
/** Reveal arming values (`startxtopen,-256` / `startxtclose,1500`). */
export const STARTXTOPEN_ARM = -256;
export const STARTXTCLOSE_ARM = 1500;

/** do_stars trigger frames for the two text blocks (`cmp ax,1200` / `cmp ax,3200`). */
export const REVEAL_FRAME_BLOCK1 = 1200;
export const REVEAL_FRAME_BLOCK2 = 3200;

/** The animatable reveal state — the three `cs:` words `risetext` reads and writes. */
export interface RevealState {
  /** startxtopen — opening counter, ramps up to 99 (`-9999` = inactive at init). */
  startxtopen: number;
  /** startxtclose — closing counter, ramps down to 0 (`10000` = inactive at init). */
  startxtclose: number;
  /** startxtp0 — byte offset of the active text block within `_textpic` pixels. */
  startxtp0: number;
}

/** init_stars values: `startxtopen,-9999` / `startxtclose,10000` (no text until a block is armed). */
export function createRevealState(): RevealState {
  return { startxtopen: -9999, startxtclose: 10000, startxtp0: 0 };
}

/**
 * do_stars's per-frame block scheduler (`@@st1`/`@@st2`). Call once per tick with the *new* frame value
 * (after the increment). Arms block 1 at frame 1200 and block 2 at frame 3200.
 */
export function scheduleReveal(state: RevealState, frame: number): void {
  if (frame === REVEAL_FRAME_BLOCK1) {
    state.startxtp0 = STARTXTP0_BLOCK1;
    state.startxtopen = STARTXTOPEN_ARM;
    state.startxtclose = STARTXTCLOSE_ARM;
  } else if (frame === REVEAL_FRAME_BLOCK2) {
    state.startxtp0 = STARTXTP0_BLOCK2;
    state.startxtopen = STARTXTOPEN_ARM;
    state.startxtclose = STARTXTCLOSE_ARM;
  }
}

/**
 * Advance the open/close counters one tick and return `startxtuse` (the visible height driver), exactly as
 * `risetext` computes it: open ramps up (cap 99), close ramps down (floor 0), use = min(open, close).
 * A `use <= 0` result means the curtain is fully hidden.
 */
export function advanceReveal(state: RevealState): number {
  if (state.startxtopen < 99) state.startxtopen += 1;
  if (state.startxtclose > 0) state.startxtclose -= 1;
  return Math.min(state.startxtopen, state.startxtclose);
}

/**
 * Composite the reveal curtain over an existing chunky 320×200 index buffer (the rendered star frame),
 * mutating `out` in place. `use` is the value returned by `advanceReveal`; `srcOffset` is the byte offset of
 * the active block (`TEXTPIC_DATA_OFFSET + state.startxtp0`); `textpic` is the decoded chunky `_textpic`
 * indices (one row = SCREEN_W bytes), and `textpicWidth`/`textpicHeight` its dimensions.
 *
 * This is a row-granular re-expression of `risetext`: the original's 40-byte half-row top lip writes only the
 * left half of a row, but because it lands on a row that the same frame's source copy never reaches (it sits
 * above the first copied row), and the next iteration immediately blacks the following full row, the net
 * visible effect is a black band above the text. We therefore black whole rows for the lips, matching what
 * the screen shows.
 */
export function compositeReveal(
  out: Uint8Array,
  use: number,
  srcOffset: number,
  textpic: Uint8Array,
  textpicWidth: number,
  textpicHeight: number,
): void {
  if (use <= 0) return;
  // risetext: `cmp ax,1 / jg @@tnz / mov ax,2` — a use of exactly 1 is bumped to 2.
  const u = use < 2 ? 2 : use;

  // di starts at half-row (150 - u), then `sub di,40` (the rising top lip lands one screen row above).
  // In chunky rows: anchor screen row = 150 - u; the lip row = anchor - 1.
  let row = 150 - u - 1; // the `sub di,40` top-lip row (then `add di,80` advances a whole row)
  let cx = u - 1;

  // (1) top lip: a black row.
  blackRow(out, row);
  row += 1;
  cx -= 1;
  if (cx === 0) {
    // @@tc0c: one extra full black row at the advanced position (the original's `REPT 80/4` write).
    blackRow(out, row);
    return;
  }

  // (2) second black row.
  blackRow(out, row);
  row += 1;
  cx -= 1;
  if (cx === 0) return; // @@tc0
  cx -= 1;
  if (cx === 0) {
    // @@tc0b: only the bottom lip remains.
    blackRow(out, row);
    return;
  }

  // (3) the copied source rows (@@tc1 loop runs `cx` times before falling into @@tc0b).
  let srcRow = (srcOffset - TEXTPIC_DATA_OFFSET) / TEXTPIC_ROW_BYTES; // == startxtp0 / 80
  while (cx > 0) {
    copyTextRow(out, row, textpic, textpicWidth, textpicHeight, srcRow);
    row += 1;
    srcRow += 1;
    cx -= 1;
  }

  // (4) bottom lip: a black row (@@tc0b).
  blackRow(out, row);
}

/** Clear one full 320-pixel screen row (when on-screen) to index 0. */
function blackRow(out: Uint8Array, row: number): void {
  if (row < 0 || row >= SCREEN_H) return;
  const base = row * SCREEN_W; // chunky buffer: one byte per pixel, 320 px per row
  out.fill(0, base, base + SCREEN_W);
}

/**
 * Copy one source row of `_textpic` into screen `row`. The reveal overwrites whatever stars were there
 * (the original's set/reset plane write replaces plane 0 and plane 1 with the source bits), so the text
 * indices (0..3) land verbatim — index 0 (background) clears, indices 1..3 light the green DAC entries.
 */
function copyTextRow(
  out: Uint8Array,
  row: number,
  textpic: Uint8Array,
  textpicWidth: number,
  textpicHeight: number,
  srcRow: number,
): void {
  if (row < 0 || row >= SCREEN_H) return;
  if (srcRow < 0 || srcRow >= textpicHeight) {
    blackRow(out, row);
    return;
  }
  const dst = row * SCREEN_W;
  const src = srcRow * textpicWidth;
  const w = Math.min(SCREEN_W, textpicWidth);
  for (let x = 0; x < w; x++) {
    out[dst + x] = textpic[src + x] ?? 0;
  }
}
