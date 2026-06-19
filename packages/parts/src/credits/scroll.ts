import { FONAY } from './font.js';

/**
 * The vertical-scroll bookkeeping, ported from `do_scroll` (`MAIN.C:60-96`). The original advances `yscrl`
 * one pixel per frame and renders one font scanline (`line`, cycling 0..29) per frame, so the visible image
 * scrolls up exactly one pixel per frame and each text line occupies `FONAY` (30) vertical pixels with no
 * gap. We model the same motion as a continuous scroll position in pixels.
 */

/**
 * Total scroll height of `lineCount` text lines: each line is `FONAY` pixels tall, stacked with no gap.
 */
export function contentHeight(lineCount: number): number {
  return lineCount * FONAY;
}

/**
 * The scroll position (in pixels, top of the visible window) at sim-frame `frame`: one pixel per frame,
 * wrapped modulo the content height so the scroll loops (default-loop playback). `height` must be > 0.
 */
export function scrollAt(frame: number, height: number): number {
  if (height <= 0) return 0;
  return ((frame % height) + height) % height;
}

/** A resolved (lineIndex, fontRow) for a global content row. */
export interface LineRow {
  /** Index into the line list. */
  lineIndex: number;
  /** Font scanline within that line, 0..FONAY-1. */
  fontRow: number;
}

/**
 * Map a global content row (0-based from the top of the whole scroll) to the text line and the font
 * scanline within it. `globalRow = scroll + screenRow`; `lineIndex = floor(globalRow / FONAY)`,
 * `fontRow = globalRow mod FONAY`. This is the inverse of the original's "render font row `line` of the
 * current text line, advance `line` and `yscrl` each frame" bookkeeping.
 */
export function rowToLineRow(globalRow: number): LineRow {
  const lineIndex = Math.floor(globalRow / FONAY);
  const fontRow = ((globalRow % FONAY) + FONAY) % FONAY;
  return { lineIndex, fontRow };
}
