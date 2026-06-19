import { cdiv } from './cint.js';
import { CUBE_FACES, type ProjectedPoint, type VisibleFace } from './cube.js';
import { DIST_W, TILE_H, TILE_W } from './texture.js';

/** The cube renders into the original 320×200 mode-X playfield. */
export const SCREEN_W = 320;
export const SCREEN_H = 200;

/**
 * y-clip. The original playfield was 134 rows tall (PLZA.ASM `cmp [yy],134d`) within its wide
 * copper-scrolled buffer; our re-centred cube uses the full 200-row field so the whole spin is visible.
 */
export const CLIP_H = SCREEN_H;

/**
 * The fixed texture quad mapped onto every cube face (PLZFILL.C do_poly `txt[]`): a sub-rectangle of
 * the 256×64 kuva tile. Indices line up with the screen-vertex order pnts[0..3].
 */
const TXT: ReadonlyArray<readonly [number, number]> = [
  [64, 4],
  [190, 4],
  [190, 60],
  [64, 60],
];

const ONE = 65536; // 16.16 fixed-point one
const HALF = 0x8000; // 16.16 fixed-point one-half

/** One interpolating polygon edge (16.16 fixed point), mirroring do_poly's xx1/txx1/txy1 + slopes. */
interface Edge {
  x: number;
  tx: number;
  ty: number;
  dx: number;
  dtx: number;
  dty: number;
  src: number; // current source vertex index (0..3)
  dst: number; // destination vertex index
}

/**
 * Sample one texel from the kuva tile with the do_block linear-address wobble: the integer texture
 * coords (tx,ty) form a linear byte address `ty·256 + tx` into the 256×64 tile; `dist[(ty+dd)·256+tx]`
 * (= sini[(ty+dd)·8]/3) is added to that address, shifting the sample (the liquid shimmer). The result
 * is clamped to the tile bounds (the original wraps within the far segment; clamping is in-image and
 * visually identical for the small ±42 offset and the [4,60] texture-y band).
 */
function sampleTile(tile: Uint8Array, dist: Int8Array, tx: number, ty: number, dd: number): number {
  const cx = tx < 0 ? 0 : tx > TILE_W - 1 ? TILE_W - 1 : tx;
  const cy = ty < 0 ? 0 : ty > TILE_H - 1 ? TILE_H - 1 : ty;
  const wobble = dist[((cy + dd) & (128 - 1)) * DIST_W + cx] ?? 0;
  let addr = cy * TILE_W + cx + wobble;
  if (addr < 0) addr = 0;
  if (addr > TILE_W * TILE_H - 1) addr = TILE_W * TILE_H - 1;
  return tile[addr] ?? 0;
}

/** Build an edge from screen vertex `s` to `d` over the projected points (do_poly edge setup). */
function makeEdge(pts: readonly ProjectedPoint[], s: number, d: number): Edge {
  const ps = pts[s];
  const pd = pts[d];
  const txs = TXT[s] ?? [0, 0];
  const txd = TXT[d] ?? [0, 0];
  if (!ps || !pd) return { x: 0, tx: 0, ty: 0, dx: 0, dtx: 0, dty: 0, src: s, dst: d };
  let dy = pd.sy - ps.sy;
  if (dy === 0) dy = 1; // do_poly: if(dy==0) dy++
  return {
    x: ps.sx * ONE + HALF,
    tx: txs[0] * ONE + HALF,
    ty: txs[1] * ONE + HALF,
    dx: cdiv((pd.sx - ps.sx) * ONE, dy),
    dtx: cdiv((txd[0] - txs[0]) * ONE, dy),
    dty: cdiv((txd[1] - txs[1]) * ONE, dy),
    src: s,
    dst: d,
  };
}

/**
 * drawPoly (PLZFILL.C do_poly + PLZA.ASM do_block): affine texture-map one cube face quad into the
 * index buffer. The quad's 4 screen vertices (pnts[0..3]) map to the fixed TXT[] texture quad; we walk
 * the two edges down from the topmost vertex, interpolating screen x and texture (tx,ty) in 16.16 fixed
 * point, and fill each scanline span sampling `tile` with the dist wobble. `dd` is frames&63.
 */
export function drawPoly(
  out: Uint8Array,
  pts: readonly ProjectedPoint[],
  tile: Uint8Array,
  dist: Int8Array,
  dd: number,
): void {
  // Topmost vertex (do_poly:98).
  let n = 0;
  for (let a = 1; a < 4; a++) {
    const pa = pts[a];
    const pn = pts[n];
    if (pa && pn && pa.sy < pn.sy) n = a;
  }
  // Left edge n→(n+1)&3, right edge n→(n−1)&3 (do_poly:100).
  let left = makeEdge(pts, n, (n + 1) & 3);
  let right = makeEdge(pts, n, (n + 3) & 3);
  const startY = pts[n]?.sy ?? 0;
  let yy = startY;

  let drawn = 0; // vertices consumed (do_poly loops until n>=4)
  while (drawn < 4) {
    const yL = pts[left.dst]?.sy ?? yy;
    const yR = pts[right.dst]?.sy ?? yy;
    const m = Math.min(yL, yR);
    fillBlock(out, left, right, yy, m, tile, dist, dd);
    yy = m;
    if (yL === yR) {
      left = makeEdge(pts, left.dst, (left.dst + 1) & 3);
      right = makeEdge(pts, right.dst, (right.dst + 3) & 3);
      drawn += 2;
    } else if (yL < yR) {
      left = makeEdge(pts, left.dst, (left.dst + 1) & 3);
      drawn += 1;
    } else {
      right = makeEdge(pts, right.dst, (right.dst + 3) & 3);
      drawn += 1;
    }
  }
}

/** Fill scanlines [y0,y1) between the two edges (do_block), advancing both edges per row. */
function fillBlock(
  out: Uint8Array,
  left: Edge,
  right: Edge,
  y0: number,
  y1: number,
  tile: Uint8Array,
  dist: Int8Array,
  dd: number,
): void {
  for (let y = y0; y < y1; y++) {
    if (y >= 0 && y < CLIP_H) {
      // The two edges bound the span; whichever has the smaller x is the left boundary this row (the
      // winding of a projected cube face flips with orientation, so resolve it per scanline). Texture
      // coords interpolate from the left boundary's texel to the right boundary's texel.
      const ax = left.x >> 16;
      const bx = right.x >> 16;
      const lo = ax <= bx ? left : right;
      const hi = ax <= bx ? right : left;
      const xLo = lo.x >> 16;
      const xHi = hi.x >> 16;
      const span = xHi - xLo;
      if (span > 0) {
        const dtx = cdiv(hi.tx - lo.tx, span);
        const dty = cdiv(hi.ty - lo.ty, span);
        let tx = lo.tx;
        let ty = lo.ty;
        for (let x = xLo; x < xHi; x++) {
          if (x >= 0 && x < SCREEN_W) {
            out[y * SCREEN_W + x] = sampleTile(tile, dist, tx >> 16, ty >> 16, dd);
          }
          tx += dtx;
          ty += dty;
        }
      }
    }
    left.x += left.dx;
    left.tx += left.dtx;
    left.ty += left.dty;
    right.x += right.dx;
    right.tx += right.dtx;
    right.ty += right.dty;
  }
}

/**
 * Index value the plasma-behind composite fills the cube buffer with before drawing: a marker meaning
 * "the cube did not draw here". The cube tiles only ever produce 32..191 (texture.ts), so 0xFF is never
 * a cube pixel and is safe as the transparent sentinel.
 */
export const CUBE_TRANSPARENT = 0xff;

/**
 * Draw each visible face's quad with its shaded tile band into `out` WITHOUT clearing — the caller owns
 * the background (the plasma, or a sentinel fill). Faces are drawn in sortFaces order (front-to-back is
 * irrelevant — the cube is convex and back faces are culled, so visible faces never overlap).
 */
export function drawCubeFaces(
  out: Uint8Array,
  pts: readonly ProjectedPoint[],
  visible: readonly VisibleFace[],
  tiles: readonly [Uint8Array, Uint8Array, Uint8Array],
  dist: Int8Array,
  dd: number,
): void {
  for (const vf of visible) {
    const face = CUBE_FACES[vf.faceIndex];
    if (!face) continue;
    const quad: ProjectedPoint[] = [];
    for (const idx of face.p) {
      const p = pts[idx];
      if (p) quad.push(p);
    }
    if (quad.length !== 4) continue;
    const tile = tiles[face.color] ?? tiles[0];
    drawPoly(out, quad, tile, dist, dd);
  }
}

/**
 * Rasterise the whole cube into a fresh buffer: clear to 0, then draw each visible face. The caller
 * supplies the three pre-shaded tile bands (one per face color) and the dist map; `dd` is frames&63.
 */
export function rasterCube(
  out: Uint8Array,
  pts: readonly ProjectedPoint[],
  visible: readonly VisibleFace[],
  tiles: readonly [Uint8Array, Uint8Array, Uint8Array],
  dist: Int8Array,
  dd: number,
): void {
  out.fill(0);
  drawCubeFaces(out, pts, visible, tiles, dist, dd);
}

/**
 * Rasterise the cube ON TOP of the plasma background (MAIN.C plz() then vect(): the cube overdraws the
 * plasma where its faces cover, the plasma shows through everywhere else). The cube faces are drawn into
 * a separate index buffer pre-filled with CUBE_TRANSPARENT so the composite step can keep each layer's
 * own palette (the plasma palette and the cube palette index-collide; compositing in colour space is the
 * faithful equivalent of the original's two sequential passes sharing the VGA buffer).
 */
export function rasterCubeBuffer(
  cubeBuf: Uint8Array,
  pts: readonly ProjectedPoint[],
  visible: readonly VisibleFace[],
  tiles: readonly [Uint8Array, Uint8Array, Uint8Array],
  dist: Int8Array,
  dd: number,
): void {
  cubeBuf.fill(CUBE_TRANSPARENT);
  drawCubeFaces(cubeBuf, pts, visible, tiles, dist, dd);
}

/**
 * Composite the cube layer over the plasma background into an RGBA buffer (×4 VGA-DAC scaling): where the
 * cube buffer is CUBE_TRANSPARENT the plasma index goes through `plasmaPalette`, otherwise the cube index
 * goes through `cubePalette`. This is the colour-space equivalent of the original's two sequential VGA
 * passes (plz() then vect()); the cube ALWAYS wins where it drew. Pure (no GPU) so the ordering is
 * unit-testable; RasterSurface.composite uses the same rule for the on-screen path.
 */
export function compositeToRgb(
  plasma: Uint8Array,
  plasmaPalette: Uint8Array,
  cube: Uint8Array,
  cubePalette: Uint8Array,
  rgba: Uint8Array,
): void {
  const n = Math.min(plasma.length, cube.length, rgba.length >> 2);
  for (let i = 0; i < n; i++) {
    const cc = cube[i] ?? CUBE_TRANSPARENT;
    const transparent = cc === CUBE_TRANSPARENT;
    const c = transparent ? (plasma[i] ?? 0) : cc;
    const pal = transparent ? plasmaPalette : cubePalette;
    const d = i * 4;
    rgba[d] = (pal[c * 3] ?? 0) * 4;
    rgba[d + 1] = (pal[c * 3 + 1] ?? 0) * 4;
    rgba[d + 2] = (pal[c * 3 + 2] ?? 0) * 4;
    rgba[d + 3] = 255;
  }
}
