/**
 * The FOREST frame compositor — a verbatim port of `ROUTINES.ASM Putrouts` (equivalently the inline asm in
 * `READ2.PAS scr()`). Each frame:
 *
 *   1. copy the static mountain background into the screen index buffer;
 *   2. for the active warp phase, walk all 7347 font pixels in lockstep with the font index, and for each
 *      listed destination screen offset, add the font pixel value to the background pixel there.
 *
 * `ROUTINES.ASM Putrouts` does a plain 8-bit `add al, byte ptr fs:[bx]` and stores the result with no
 * saturation, so the sum wraps mod 256. We reproduce that wrap verbatim: where the lit reflection (font
 * biased into 128..) lands on an already-bright background highlight (lake-edge indices ~120..127) the sum
 * exceeds 255 and wraps down into the dark band, which is exactly the speckled shimmer the original shows
 * on the rippling water. (A previous port clamped to 255 here; on the real FOREST data ~2.5% of stamps
 * overflow, so clamping was *not* invisible — the faithful behaviour is the mod-256 wrap.)
 */

import type { PosTable } from './pos.js';
import { POS_ENTRIES, SCREEN_PIXELS } from './pos.js';

/** Copy the background into the screen buffer (the per-frame `move(hback, screen, 64000)`). */
export function blitBackground(screen: Uint8Array, background: Uint8Array): void {
  screen.set(background.subarray(0, SCREEN_PIXELS));
}

/**
 * Stamp one warp phase of the font window onto `screen` (which must already hold the background). For each
 * font pixel `i` with a non-zero value, add it to every destination the phase lists, wrapping mod 256 like
 * the original `add al, byte ptr fs:[bx]` / `mov byte ptr es:[di], al`. Font value 0 contributes nothing,
 * matching the original (adding 0 is a no-op) and skipping the inner loop entirely when the pixel is dark.
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
      // 8-bit add with wraparound (ROUTINES.ASM stores the byte result unsaturated).
      screen[off] = ((screen[off] ?? 0) + value) & 0xff;
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
