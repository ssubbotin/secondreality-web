// Flat-polygon scanline fill (the VISU/ADRAW.ASM normal-fill path, AVIDFILL), rasterising the painter-
// ordered ScreenPoly list into the 320x200 8-bit index buffer. Each convex face is filled with its single
// flat colour: walk left+right edges down from the topmost vertex, fill each scanline span. Coordinates are
// clipped to the viewport [0,320)x[0,200) here (the original clipped polygons in 3D via newclip; for the
// web port we clip in screen space, which is visually identical for these convex faces). Painter ordering
// (objects back-to-front) is preserved by the caller, so later polys overwrite earlier ones.

import { SCREEN_H, SCREEN_W, type ScreenPoly } from './scene.js';

/** Build the edge list for a polygon and fill it flat into `out`. */
function fillPoly(out: Uint8Array, pts: readonly { x: number; y: number }[], color: number): void {
  const n = pts.length;
  if (n < 3) return;

  // Find vertical extent (clipped to the screen).
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of pts) {
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const y0 = Math.max(0, Math.ceil(yMin));
  const y1 = Math.min(SCREEN_H - 1, Math.floor(yMax));
  if (y0 > y1) return;

  // Per-scanline active-edge crossings.
  for (let y = y0; y <= y1; y++) {
    // Collect X crossings of edges spanning this scanline (using the pixel-centre sampling y).
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      if (!a || !b) continue;
      const ay = a.y;
      const by = b.y;
      // Half-open [min,max) so shared vertices aren't double-counted.
      const lo = Math.min(ay, by);
      const hi = Math.max(ay, by);
      if (y < lo || y >= hi) continue;
      const t = (y - ay) / (by - ay);
      xs.push(a.x + t * (b.x - a.x));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    // Fill spans pairwise.
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = xs[k];
      const xb = xs[k + 1];
      if (xa === undefined || xb === undefined) continue;
      let sx = Math.max(0, Math.ceil(xa));
      const ex = Math.min(SCREEN_W - 1, Math.floor(xb));
      const rowBase = y * SCREEN_W;
      for (; sx <= ex; sx++) out[rowBase + sx] = color;
    }
  }
}

/** Rasterise the whole frame's polygon list (already painter-ordered) into `out` (cleared to `bg`). */
export function rasterFrame(out: Uint8Array, polys: readonly ScreenPoly[], bg = 0): void {
  out.fill(bg);
  for (const p of polys) fillPoly(out, p.pts, p.color);
}

export { SCREEN_H, SCREEN_W };
