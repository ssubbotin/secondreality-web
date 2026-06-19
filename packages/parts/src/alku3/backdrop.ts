/**
 * The HOI horizon backdrop window for the ALKU title reveal, ported from `ALKU/MAIN.C` + `COPPER.ASM`.
 *
 * The title card sits over the HOI horizon picture (`hzpic`), panned horizontally by the copper ISR
 * (`COPPER.ASM copper1`, lines 64-81) via `cop_start`/`cop_scrl`. We render the *visible* result — a
 * 320-pixel window sampled from the 640-wide HOI source, wrapping over the source width.
 */

/** The original mode-X opening field is 320×200. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** The HOI picture source is 640 wide (`HOI.U` header). */
export const HOI_W = 640;

/** Wrap the copper pan offset over the 640-wide source. */
export function backdropOffset(scroll: number): number {
  return ((scroll % HOI_W) + HOI_W) % HOI_W;
}

/**
 * Lay the HOI backdrop window across every scanline of `dst` (320×200), starting at pixel `offset` into the
 * 640-wide source and wrapping. `dst` is overwritten (no accumulation between frames).
 */
export function composeBackdrop(dst: Uint8Array, hoi: Uint8Array, offset: number): void {
  const off = backdropOffset(offset);
  for (let y = 0; y < SCREEN_H; y++) {
    const srcBase = y * HOI_W;
    const dstBase = y * SCREEN_W;
    for (let x = 0; x < SCREEN_W; x++) {
      const sx = (off + x) % HOI_W;
      dst[dstBase + x] = hoi[srcBase + sx] ?? 0;
    }
  }
}
