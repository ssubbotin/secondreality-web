/**
 * The FOREST frame compositor — a verbatim port of `ROUTINES.ASM Putrouts` (equivalently the inline asm in
 * `READ2.PAS scr()`). Each frame:
 *
 *   1. copy the static mountain background into the screen index buffer;
 *   2. for the active warp phase, walk all 7347 font pixels in lockstep with the font index, and for each
 *      listed destination screen offset, add the font pixel value to the background pixel there.
 *
 * The original does an 8-bit `add al, font[bx]` that wraps mod 256. On the real FOREST data the background
 * is dark (low indices) and lit text is biased into 128.., so the sum never overflows; we **clamp to 255**
 * defensively (a deliberate, invisible-on-real-data departure from mod-256 wrap — see the design doc).
 */

import type { PosTable } from './pos.js';
import { POS_ENTRIES, SCREEN_PIXELS } from './pos.js';

/** Copy the background into the screen buffer (the per-frame `move(hback, screen, 64000)`). */
export function blitBackground(screen: Uint8Array, background: Uint8Array): void {
  screen.set(background.subarray(0, SCREEN_PIXELS));
}

/**
 * Stamp one warp phase of the font window onto `screen` (which must already hold the background). For each
 * font pixel `i` with a non-zero value, add it (clamped to 255) to every destination the phase lists.
 * Font value 0 contributes nothing, matching the original (adding 0 is a no-op) and skipping the inner
 * loop entirely when the pixel is dark.
 */
export function stampPhase(screen: Uint8Array, font: Uint8Array, pos: PosTable): void {
  const { count, start, dests } = pos;
  for (let i = 0; i < POS_ENTRIES; i++) {
    const value = font[i] ?? 0;
    if (value === 0) continue; // adding 0 changes nothing
    const c = count[i] ?? 0;
    if (c === 0) continue; // hidden font pixel — no destinations
    const s = start[i] ?? 0;
    for (let j = 0; j < c; j++) {
      const off = dests[s + j] ?? 0;
      const sum = (screen[off] ?? 0) + value;
      screen[off] = sum > 255 ? 255 : sum;
    }
  }
}

/** Convenience: blit the background then stamp the phase in one call. */
export function composeFrame(
  screen: Uint8Array,
  background: Uint8Array,
  font: Uint8Array,
  pos: PosTable,
): void {
  blitBackground(screen, background);
  stampPhase(screen, font, pos);
}
