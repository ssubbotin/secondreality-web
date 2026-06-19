import type { BitmapFont } from './font.js';

/** The original EGA scroll surface width (640px); centring is around column 319.5 via `(639-width)/2`. */
export const SCREEN_W = 640;

/**
 * The centred left margin for a line of rendered width `width`, porting `tstart=(639-tstart)/2`
 * (`MAIN.C:73`). C integer division truncates toward zero, so a line wider than the screen yields a
 * negative offset (`Math.trunc`), which clips on the left exactly as the original would.
 */
export function centerOffset(width: number): number {
  return Math.trunc((SCREEN_W - 1 - width) / 2);
}

/** Rendered width of `line` through the font (Σ glyphWidth+gap), i.e. the original `tstart` accumulator. */
export function measureLine(font: BitmapFont, line: string): number {
  return font.measure(line);
}
