/**
 * Perspective projection, camera-angle (FOV) setup, flat-shading and back-face culling — ported verbatim
 * from the VISU engine (ACALC.ASM `_calc_project`, AVID.ASM `_vid_cameraangle` + AVISTAN.INC, ADRAW.ASM
 * `calclight` / `normallight` / `checkculling`).
 *
 * Projection: screen_x = projmulx·X / Z + projaddx ; screen_y = projmuly·Y / Z + projaddy, with Z clamped
 * to the near plane. All integer ops truncate toward zero (BigInt for the imul/idiv intermediates).
 */

import { UNIT } from './fixed.js';

/** Visual-angle tangent table (AVISTAN.INC) — 256 words covering 90°; index = (halfAngle>>5)&~1. */
// prettier-ignore
export const AVISTAN: number[] = [
  32767, 32767, 20859, 13905, 10428, 8341, 6950, 5956, 5210, 4631, 4166, 3787, 3470, 3202, 2972,
  2773, 2599, 2445, 2308, 2185, 2075, 1975, 1884, 1801, 1725, 1655, 1591, 1531, 1475, 1423, 1374,
  1329, 1286, 1246, 1209, 1173, 1140, 1108, 1077, 1049, 1022, 996, 971, 947, 925, 903, 882, 862,
  843, 825, 808, 791, 774, 759, 744, 729, 715, 701, 688, 675, 663, 651, 640, 628, 618, 607, 597,
  587, 577, 568, 558, 549, 541, 532, 524, 516, 508, 500, 493, 486, 478, 471, 465, 458, 451, 445,
  439, 433, 427, 421, 415, 409, 404, 398, 393, 388, 383, 378, 373, 368, 363, 358, 354, 349, 345,
  340, 336, 332, 328, 323, 319, 315, 311, 308, 304, 300, 296, 293, 289, 285, 282, 278, 275, 272,
  268, 265, 262, 259, 256, 252, 249, 246, 243, 240, 237, 234, 232, 229, 226, 223, 220, 218, 215,
  212, 210, 207, 204, 202, 199, 197, 194, 192, 189, 187, 185, 182, 180, 177, 175, 173, 171, 168,
  166, 164, 162, 159, 157, 155, 153, 151, 149, 147, 145, 142, 140, 138, 136, 134, 132, 130, 128,
  126, 124, 123, 121, 119, 117, 115, 113, 111, 109, 107, 106, 104, 102, 100, 98, 96, 95, 93, 91, 89,
  88, 86, 84, 82, 81, 79, 77, 75, 74, 72, 70, 69, 67, 65, 64, 62, 60, 59, 57, 55, 54, 52, 50, 49,
  47, 46, 44, 42, 41, 39, 37, 36, 34, 33, 31, 29, 28, 26, 25, 23, 22, 20, 18, 17, 15, 14, 12, 11, 9,
  7, 6, 4, 3, 1,
];

/** The light direction (ADRAW.ASM `newlight`), 16.14 fixed: ~(0.74, 0.65, 0.18). */
export const NEWLIGHT: [number, number, number] = [12118, 10603, 3030];

/** Visibility flags (CD.H). */
export const VF_UP = 1;
export const VF_DOWN = 2;
export const VF_LEFT = 4;
export const VF_RIGHT = 8;
export const VF_NEAR = 16;
export const VF_FAR = 32;

export interface Projection {
  mulx: number;
  muly: number;
  addx: number;
  addy: number;
  clipXmin: number;
  clipXmax: number;
  clipYmin: number;
  clipYmax: number;
  clipZmin: number;
  clipZmax: number;
}

/** vid_window(x1,x2,y1,y2,z1,z2): set the clip rect and centre the add offsets (ACALC default 320×200). */
export function makeWindow(
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  z1: number,
  z2: number,
): Projection {
  return {
    clipXmin: x1,
    clipXmax: x2,
    addx: (x1 + x2) >> 1,
    clipYmin: y1,
    clipYmax: y2,
    addy: (y1 + y2) >> 1,
    clipZmin: z1,
    clipZmax: z2,
    mulx: 0,
    muly: 0,
  };
}

/** projaspect (ADATA): 256 = 1:1 (square pixels in projection; mode-X aspect correction is applied later). */
export const PROJASPECT = 256;

/**
 * vid_cameraangle(a) (AVID.ASM): set projmulx/projmuly from the half-screen width and the avistan table.
 * `a` is the angle 0..65535; halfAngle = a>>1 clamped to [8*64, 16383]; index = (halfAngle>>5)&~1.
 */
export function setCameraAngle(proj: Projection, a: number): void {
  const halfwidth = proj.clipXmax - proj.addx; // right edge - centre X
  let bx = a >> 1;
  if (bx < 8 * 64) bx = 8 * 64;
  if (bx >= 16384) bx = 16383;
  const index = (bx >> 5) & ~1;
  const tan = AVISTAN[index] ?? 0;
  proj.mulx = Number((BigInt(halfwidth) * BigInt(tan)) >> 8n);
  proj.muly = Number((BigInt(proj.mulx) * BigInt(PROJASPECT)) >> 8n);
}

export interface Projected {
  x: number;
  y: number;
  vf: number;
}

/**
 * calc_project for ONE vertex (ACALC `_calc_project` inner loop). Camera-space (x,y,z) → screen.
 * Z is clamped to the near/far clip; X/Y use truncating integer divide by Z. Returns the screen point
 * plus its visibility flags (VF_NEAR set when behind the near plane → x/y undefined).
 */
export function projectVertex(proj: Projection, x: number, y: number, z: number): Projected {
  let vf = 0;
  let zc = z;
  if (zc < proj.clipZmin) {
    vf |= VF_NEAR;
    zc = proj.clipZmin;
  } else if (zc > proj.clipZmax) {
    vf |= VF_FAR;
  }
  // Y: (projmuly * y) / z + addy  (ASM order: eax=y; imul projmuly; idiv z; add addy)
  const sy = Number((BigInt(y) * BigInt(proj.muly)) / BigInt(zc)) + proj.addy;
  if (sy > proj.clipYmax) vf |= VF_DOWN;
  if (sy < proj.clipYmin) vf |= VF_UP;
  // X: (projmulx * x) / z + addx
  const sx = Number((BigInt(proj.mulx) * BigInt(x)) / BigInt(zc)) + proj.addx;
  if (sx > proj.clipXmax) vf |= VF_RIGHT;
  if (sx < proj.clipXmin) vf |= VF_LEFT;
  // ASM stores the low 16 bits (word) of sx/sy; emulate the int16 wrap so off-screen coords match.
  return { x: int16(sx), y: int16(sy), vf };
}

function int16(v: number): number {
  const w = v & 0xffff;
  return w >= 0x8000 ? w - 0x10000 : w;
}

/**
 * normallight (ADRAW): relative brightness 0..255 from a rotated face normal (length UNIT). The ASM does
 * a 32-bit dot with newlight (each term imul gives 64-bit), takes the high dword, `sar` by (2*14-7-16) =
 * -11 → i.e. shift LEFT 11 of the high dword... we reproduce by computing the full 64-bit dot and
 * `>> (28-7) = >>21` of the full product, +128, clamped [0,255]. (high-dword sar -11 == full sar 32-11=21.)
 */
export function normalLight(nx: number, ny: number, nz: number): number {
  const dot =
    BigInt(nx) * BigInt(NEWLIGHT[0]) +
    BigInt(ny) * BigInt(NEWLIGHT[1]) +
    BigInt(nz) * BigInt(NEWLIGHT[2]);
  let v = Number(dot >> 21n) + 128;
  if (v > 255) v = 255;
  if (v < 0) v = 0;
  return v;
}

/**
 * calclight (ADRAW): shade index 0..30 for a flat face. `shadeMask` selects bits (5/4/3 for SHADE 32/16/8);
 * returns 0 when the material is unshaded. Verbatim: light = normalLight(); shr by shadeBits; clamp [1,30].
 */
export function calcLight(nx: number, ny: number, nz: number, shadeBits: number): number {
  if (shadeBits === 0) return 0;
  const light = normalLight(nx, ny, nz);
  let ax = light >> shadeBits; // shr cl where cl = 6 - dx, dx in {5,4,3} → shift {5,4,3}... see note
  if (ax < 1) ax = 1;
  if (ax > 30) ax = 30;
  return ax;
}

/**
 * checkculling (ADRAW): a face is hidden when N·V >= 0 (N = rotated normal, V = any rotated face vertex
 * in camera space). Returns true when the face should be culled (back-facing).
 */
export function isBackFacing(
  nx: number,
  ny: number,
  nz: number,
  vx: number,
  vy: number,
  vz: number,
): boolean {
  const dot = BigInt(nx) * BigInt(vx) + BigInt(ny) * BigInt(vy) + BigInt(nz) * BigInt(vz);
  return dot >= 0n;
}

export { UNIT };
