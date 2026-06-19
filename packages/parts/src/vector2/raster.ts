/**
 * Flat-colour triangle rasteriser into a palette-index buffer — the CPU equivalent of ADRAW.ASM's
 * polygon fill (AVIDPOLY / `cfill`). The original fills convex polygons via left/right edge walks with
 * fixed-point slopes; for the triangulated city we use a straightforward top-to-bottom scanline fill
 * with the same "left edge < right edge" span convention. Coordinates are integer screen pixels.
 */

export const SCREEN_W = 320;
export const SCREEN_H = 200;

export interface RasterPoint {
  x: number;
  y: number;
}

/**
 * Fill one triangle with `color` into `buf` (SCREEN_W × SCREEN_H, top-row-first), clipped to the screen.
 * Standard scanline fill: sort vertices by Y, walk the long edge against the two short edges, emit each
 * row's [xl, xr) span. Pixels are written, not blended (the city is opaque, painter-sorted back-to-front).
 */
export function fillTriangle(
  buf: Uint8Array,
  color: number,
  p0: RasterPoint,
  p1: RasterPoint,
  p2: RasterPoint,
): void {
  // Sort by Y ascending.
  let [a, b, c] = [p0, p1, p2];
  if (a.y > b.y) [a, b] = [b, a];
  if (b.y > c.y) [b, c] = [c, b];
  if (a.y > b.y) [a, b] = [b, a];

  const totalH = c.y - a.y;
  if (totalH === 0) return; // zero-height

  for (let y = Math.max(0, a.y); y <= Math.min(SCREEN_H - 1, c.y); y++) {
    const secondHalf = y > b.y || b.y === a.y;
    const segHeight = secondHalf ? c.y - b.y : b.y - a.y;
    if (segHeight === 0) continue;
    const alpha = (y - a.y) / totalH; // along the long edge a→c
    const beta = secondHalf ? (y - b.y) / segHeight : (y - a.y) / segHeight;
    let ax = Math.round(a.x + (c.x - a.x) * alpha);
    let bx = secondHalf
      ? Math.round(b.x + (c.x - b.x) * beta)
      : Math.round(a.x + (b.x - a.x) * beta);
    if (ax > bx) [ax, bx] = [bx, ax];
    const xl = Math.max(0, ax);
    const xr = Math.min(SCREEN_W - 1, bx);
    if (xr < xl) continue;
    const row = y * SCREEN_W;
    for (let x = xl; x <= xr; x++) buf[row + x] = color;
  }
}
