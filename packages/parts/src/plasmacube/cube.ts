import { cdiv, sar } from './cint.js';

/**
 * The cube transform, projection, backface sort and light shading, ported verbatim from VECT.C
 * (count_const / rotate / sort_faces / calculate). All integer arithmetic matches Microsoft C large
 * model: the matrix and projection use 32-bit `long` (the `(long)` casts), but `rotate`'s per-axis
 * accumulation is 16-bit `int` and DOES wrap — so each axis sum is reduced to a signed 16-bit value
 * before the `>>7`. C operator precedence: `>>` binds looser than `+`/`*`, so `A>>15+7` ≡ `A>>22`.
 */

/** Reduce to a signed 16-bit value (the original `int` arithmetic in rotate wraps at 16 bits). */
function s16(x: number): number {
  const m = x & 0xffff;
  return m >= 0x8000 ? m - 0x10000 : m;
}

/** The 8 cube vertices (VECT.C object, ±125). */
export const CUBE_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [125, 125, 125],
  [125, -125, 125],
  [-125, -125, 125],
  [-125, 125, 125],
  [125, 125, -125],
  [125, -125, -125],
  [-125, -125, -125],
  [-125, 125, -125],
];

/** A cube face: four vertex indices (CCW) and the palette/texture band color. */
export interface CubeFace {
  readonly p: readonly [number, number, number, number];
  readonly color: number;
}

/** The 6 quad faces (VECT.C object pg[], p1..p4 and color). */
export const CUBE_FACES: readonly CubeFace[] = [
  { p: [1, 2, 3, 0], color: 0 },
  { p: [7, 6, 5, 4], color: 0 },
  { p: [0, 4, 5, 1], color: 1 },
  { p: [1, 5, 6, 2], color: 2 },
  { p: [2, 6, 7, 3], color: 1 },
  { p: [3, 7, 4, 0], color: 2 },
];

/** The 3×3 fixed-point rotation matrix (count_const). Entries are small (≈±256). */
export interface RotMatrix {
  cxx: number;
  cxy: number;
  cxz: number;
  cyx: number;
  cyy: number;
  cyz: number;
  czx: number;
  czy: number;
  czz: number;
}

/**
 * count_const (VECT.C:153-178): build the rotation matrix from the sine/cosine of the three Euler
 * angles. SX = sinit[kx], CX = kosinit[kx], etc. (kx/ky/kz already masked to [0,1024)).
 */
export function countConst(
  kx: number,
  ky: number,
  kz: number,
  sinit: Int16Array,
  kosinit: Int16Array,
): RotMatrix {
  const sx = sinit[kx] ?? 0;
  const sy = sinit[ky] ?? 0;
  const sz = sinit[kz] ?? 0;
  const cx = kosinit[kx] ?? 0;
  const cy = kosinit[ky] ?? 0;
  const cz = kosinit[kz] ?? 0;
  return {
    cxx: sar(cy * cz, 22),
    cxy: sar(cy * sz, 22),
    cxz: sar(-sy, 7),
    cyx: sar(sar(sx * cz + 16384, 15) * sy - cx * sz, 22),
    cyy: sar(sar(sx * sy + 16384, 15) * sz + cx * cz, 22),
    cyz: sar(cy * sx, 22),
    czx: sar(sar(cx * cz + 16384, 15) * sy + sx * sz, 22),
    czy: sar(sar(cx * sy + 16384, 15) * sz - sx * cz, 22),
    czz: sar(cy * cx, 22),
  };
}

/** A projected vertex: post-rotation camera coords (xx,yy,zz) and screen coords (sx,sy). */
export interface ProjectedPoint {
  xx: number;
  yy: number;
  zz: number;
  sx: number;
  sy: number;
}

/**
 * rotate (VECT.C:180-201): apply the matrix to each cube vertex and project. The per-axis sum of the
 * three `>>1` products is 16-bit (wraps), then `>>7`, then the translation/distance is added (those are
 * 16-bit too). The projection `(xx*256)/zz`, `(yy*142)/zz` is 32-bit (`256L`/`142L`) integer divide
 * (truncate toward zero); the `+160+160` / `+66` are the original screen biases.
 */
export function rotateProject(
  m: RotMatrix,
  tx: number,
  ty: number,
  dis: number,
  xBias = 160 + 160,
  yBias = 66,
): ProjectedPoint[] {
  const out: ProjectedPoint[] = [];
  for (const [x, y, z] of CUBE_POINTS) {
    const xx = s16(s16(sar(x * m.cxx, 1) + sar(y * m.cxy, 1) + sar(z * m.cxz, 1)) >> 7) + tx;
    const yy = s16(s16(sar(x * m.cyx, 1) + sar(y * m.cyy, 1) + sar(z * m.cyz, 1)) >> 7) + ty;
    const zz = s16(s16(sar(x * m.czx, 1) + sar(y * m.czy, 1) + sar(z * m.czz, 1)) >> 7) + dis;
    const sx = cdiv(xx * 256, zz) + xBias;
    const sy = cdiv(yy * 142, zz) + yBias;
    out.push({ xx, yy, zz, sx, sy });
  }
  return out;
}

/**
 * Port re-centering: the original biased screen x by +320 / y by +66 to place the cube in its wide,
 * copper-scrolled mode-X buffer. For our square 320×200 field we centre the cube directly with these
 * biases (chosen so the steady-state spin fits with margin). The projection math is otherwise verbatim.
 */
export const PORT_X_BIAS = 165;
export const PORT_Y_BIAS = 98;

/** The light direction (calculate(), VECT.C:144-146): a 16-bit unit vector ×~128 from ls_kx/ls_ky. */
export interface LightDir {
  x: number;
  y: number;
  z: number;
}

/**
 * calculate() light setup (VECT.C:144-146): ls_kx/ls_ky masked to [0,1024).
 *   ls_y = kosinit[ls_kx] >> 8
 *   ls_x = ((sinit[ls_kx] >> 8) · (sinit[ls_ky] >> 8)) >> 7
 *   ls_z = ((sinit[ls_kx] >> 8) · (kosinit[ls_ky] >> 8)) >> 7
 */
export function lightDir(
  lsKx: number,
  lsKy: number,
  sinit: Int16Array,
  kosinit: Int16Array,
): LightDir {
  const kx = lsKx & 1023;
  const ky = lsKy & 1023;
  const sKx = sar(sinit[kx] ?? 0, 8);
  return {
    x: sar(sKx * sar(sinit[ky] ?? 0, 8), 7),
    y: sar(kosinit[kx] ?? 0, 8),
    z: sar(sKx * sar(kosinit[ky] ?? 0, 8), 7),
  };
}

/** A visible (front-facing) face ready to draw: its index plus the per-face light intensity. */
export interface VisibleFace {
  faceIndex: number;
  /** Light intensity for shadepal: (ls·n)/250000 + 32. */
  light: number;
}

/**
 * sort_faces (VECT.C:203-246): backface-cull each face by the sign of the view·normal dot product,
 * and compute its light intensity from the light·normal dot. The normal is the cross product of two
 * edges built from the first three vertices' POST-ROTATION (xx,yy,zz) coords; the view vector is −p1.
 * A face with view·normal > 0 points away and is dropped. Light = (ls·n)/250000 + 32 (C trunc divide).
 */
export function sortFaces(points: readonly ProjectedPoint[], light: LightDir): VisibleFace[] {
  const visible: VisibleFace[] = [];
  for (let f = 0; f < CUBE_FACES.length; f++) {
    const face = CUBE_FACES[f];
    if (!face) continue;
    const a0 = points[face.p[0]];
    const a1 = points[face.p[1]];
    const a2 = points[face.p[2]];
    if (!a0 || !a1 || !a2) continue;
    const x = a0.xx;
    const y = a0.yy;
    const z = a0.zz;
    const ax = a1.xx - x;
    const ay = a1.yy - y;
    const az = a1.zz - z;
    const bx = a2.xx - x;
    const by = a2.yy - y;
    const bz = a2.zz - z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    // view vector k = −p1; s = k·n
    const s = -x * nx + -y * ny + -z * nz;
    if (s > 0) continue; // back-facing
    const lit = cdiv(light.x * nx + light.y * ny + light.z * nz, 250000) + 32;
    visible.push({ faceIndex: f, light: lit });
  }
  return visible;
}
