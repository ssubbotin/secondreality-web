import { sar } from './cint.js';
import type { RataPoint } from './tables.js';

/** The camera state `getspl` writes each frame (the spline-interpolated path point). */
export interface SplinePoint {
  tx: number;
  ty: number;
  dis: number;
  kx: number;
  ky: number;
  kz: number;
  lsKx: number;
  lsKy: number;
}

/**
 * getspl (SPLINE.ASM): cubic-spline interpolation of the RATA control points (`buu`).
 *
 *   pt = position >> 8          // which control point
 *   p  = position & 255         // sub-position 0..255 (the original shifts to a byte offset)
 *   four taps = splinecoef[p], [p+256], [p+512], [p+768]
 *   for each of the 8 fields f: out = (Σ_k cp[pt+3−k][f] · tap[k]) >> 15
 *     (the ASM's `shld cx,bx,1` keeps the high word after a 1-bit left shift = an arithmetic >>15)
 *
 * The four control points used are cp[pt+3], cp[pt+2], cp[pt+1], cp[pt+0] paired with taps 0..3.
 * Field order in a control point is {dx, dy, dz, kx, ky, kz, l_kx, l_ky}; the eight results map (by the
 * ASM pop order) to {tx, ty, dis, kx, ky, kz, ls_kx, ls_ky}. Indices are clamped so a near-the-end
 * position never reads past the (static-tail) control list.
 */
export function getspl(position: number, coef: Int32Array, rata: readonly RataPoint[]): SplinePoint {
  const pt = position >> 8;
  const p = position & 255;
  const t0 = coef[p] ?? 0;
  const t1 = coef[p + 256] ?? 0;
  const t2 = coef[p + 512] ?? 0;
  const t3 = coef[p + 768] ?? 0;
  const last = rata.length - 1;
  const cp = (i: number): RataPoint => rata[Math.min(Math.max(i, 0), last)] ?? rata[last] ?? ZERO;
  const c0 = cp(pt + 3);
  const c1 = cp(pt + 2);
  const c2 = cp(pt + 1);
  const c3 = cp(pt + 0);
  const field = (f: number): number =>
    sar((c0[f] ?? 0) * t0 + (c1[f] ?? 0) * t1 + (c2[f] ?? 0) * t2 + (c3[f] ?? 0) * t3, 15);
  return {
    tx: field(0),
    ty: field(1),
    dis: field(2),
    kx: field(3),
    ky: field(4),
    kz: field(5),
    lsKx: field(6),
    lsKy: field(7),
  };
}

const ZERO: RataPoint = [0, 0, 0, 0, 0, 0, 0, 0];
