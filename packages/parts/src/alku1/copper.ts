/**
 * The HOI horizon backdrop for the ALKU presentation cards, ported from `ALKU/MAIN.C` + `COPPER.ASM`.
 *
 * The opening text cards sit over the **HOI horizon picture** (`hzpic`), not a synthetic rainbow. `init()`
 * draws the horizon strip into the field with `outline()` and the copper ISR (`COPPER.ASM copper1`,
 * lines 64-81) pans it horizontally each frame via `cop_start = a/4 (+ p*88)` (the CRTC display-start byte)
 * and `cop_scrl = (a&3)*2` (the attribute-controller fine pixel pan). The two combine to a one-pixel-per-step
 * left pan of the 640-wide source. The card phase holds the picture roughly still while the text fades
 * in/out via `dofade`; we render the *visible* result — a 320-pixel window sampled from the 640-wide HOI
 * source, wrapping over the source width.
 */

/** The original mode-X opening field is 320×200. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** The HOI picture source is 640 wide (`HOI.U` header) — a 320-px slack for the copper pan. */
export const HOI_W = 640;
export const HOI_H = 200;

/**
 * The pixel offset into the 640-wide HOI source for copper scroll step `a`. `cop_start = a/4` and
 * `cop_scrl = (a&3)*2` reassemble to a left pan of exactly `a` pixels; we wrap it over the source width so
 * the backdrop loops seamlessly.
 */
export function backdropOffset(scroll: number): number {
  return ((scroll % HOI_W) + HOI_W) % HOI_W;
}

/**
 * Sample one 320-pixel backdrop scanline from the 640-wide HOI source row `y`, starting at pixel `offset`
 * and wrapping over the source width. Writes the 320 palette indices into `dstRow` (length ≥ SCREEN_W).
 */
export function sampleBackdropRow(
  dstRow: Uint8Array,
  hoi: Uint8Array,
  y: number,
  offset: number,
): void {
  const srcBase = y * HOI_W;
  for (let x = 0; x < SCREEN_W; x++) {
    const sx = (offset + x) % HOI_W;
    dstRow[x] = hoi[srcBase + sx] ?? 0;
  }
}

/**
 * Lay the HOI backdrop window across every scanline of `dst` (320×200), starting at pixel `offset` into the
 * 640-wide source and wrapping. `dst` is overwritten (no accumulation between frames).
 */
export function composeBackdrop(dst: Uint8Array, hoi: Uint8Array, offset: number): void {
  const off = backdropOffset(offset);
  const row = new Uint8Array(SCREEN_W);
  for (let y = 0; y < SCREEN_H; y++) {
    sampleBackdropRow(row, hoi, y, off);
    dst.set(row, y * SCREEN_W);
  }
}
