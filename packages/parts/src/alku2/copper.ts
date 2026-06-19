/**
 * The HOI backdrop horizontal scroll, ported from ALKU `do_scroll` + `COPPER.ASM`. The 640-wide HOI picture
 * (`HOI.U`) is panned left behind the credits: `do_scroll` posts `cop_start = a/4 (+ p*88)` (the CRTC
 * display-start byte) and `cop_scrl = (a&3)*2` (the attribute-controller pixel pan), and the copper ISR
 * (`COPPER.ASM copper1`, lines 64-81) programmes both each frame. The two together pan the 640-px source
 * left by exactly one pixel per scroll step (`a`): `a/4` is the 4-pixel byte step, `(a&3)` the fine 0..3
 * sub-byte pan. We reproduce the *visible* result — the 320-pixel window sampled from the 640-wide source at
 * a per-pixel offset, wrapping over the source width.
 */

/** The original opening field is 320×200 visible (mode-X). */
export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** The HOI picture source is 640 wide (`HOI.U` header), giving the scroller a 320-px slack to pan across. */
export const HOI_W = 640;
export const HOI_H = 200;

/**
 * The pixel offset into the 640-wide HOI source for scroll step `a` (`cop_start*4 + cop_scrl/2` reassembled
 * to a single pixel offset). The original `cop_start = a/4`, `cop_scrl = (a&3)*2` combine to a left pan of
 * `a` pixels; we wrap it over the source so the backdrop loops seamlessly.
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
