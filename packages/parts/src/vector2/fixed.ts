/**
 * Fixed-point 3D math ported verbatim from the VISU engine (ACALC.ASM / ADRAW.ASM, C.H / CD.H).
 *
 * The rmatrix is the engine's combined rotation+position transform: a 3×3 rotation `m[9]` in 16.14
 * fixed point (UNIT = 16384, UNITSHR = 14) plus an integer position `x,y,z`. Rotations stored row-major:
 * world' = (M · world) >> 14 + (x,y,z).
 *
 * All integer divisions/shifts truncate toward zero to match Borland C / x86 `sar`/`idiv` exactly. We use
 * BigInt for the 64-bit intermediate products the original computes with `imul`/`shrd` (a 32×32→64 mul
 * then a 14- or 16-bit shift), so the truncation matches the ASM bit-for-bit.
 */

export const UNIT = 16384;
export const UNITSHR = 14n;

/** rmatrix: rotation m[0..8] (16.14 fixed) + integer position (x,y,z). */
export interface RMatrix {
  m: number[]; // length 9, row-major
  x: number;
  y: number;
  z: number;
}

export function identityMatrix(): RMatrix {
  return { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 0, y: 0, z: 0 };
}

/** Truncating 64-bit arithmetic-shift-right by `s` bits (matches x86 `sar`/`shrd` on a signed value). */
function sar64(v: bigint, s: bigint): number {
  // BigInt >> floors toward -inf; the ASM `shrd`/`sar` truncate toward -inf too for the stored result,
  // because it keeps the low bits then sign-extends — i.e. it is an arithmetic shift (floor), so use >>.
  return Number(v >> s);
}

/**
 * mulmatrices (ACALC): dest3x3 = (m1 · m2) >> 14, row-major. Each element is sum of three 32×32 products
 * shifted right 14. Position is NOT touched here (only the 3×3 part).
 */
export function mulMatrices3x3(m1: number[], m2: number[]): number[] {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const acc =
        BigInt(m1[row * 3 + 0] ?? 0) * BigInt(m2[0 * 3 + col] ?? 0) +
        BigInt(m1[row * 3 + 1] ?? 0) * BigInt(m2[1 * 3 + col] ?? 0) +
        BigInt(m1[row * 3 + 2] ?? 0) * BigInt(m2[2 * 3 + col] ?? 0);
      out[row * 3 + col] = sar64(acc, UNITSHR);
    }
  }
  return out;
}

/** rotatesingle (ACALC): out = (M · v) >> 14. Rotates a single (x,y,z) by a 3×3 matrix, no translation. */
export function rotateSingle(
  m: number[],
  vx: number,
  vy: number,
  vz: number,
): [number, number, number] {
  const X = sar64(
    BigInt(vx) * BigInt(m[0] ?? 0) +
      BigInt(vy) * BigInt(m[1] ?? 0) +
      BigInt(vz) * BigInt(m[2] ?? 0),
    UNITSHR,
  );
  const Y = sar64(
    BigInt(vx) * BigInt(m[3] ?? 0) +
      BigInt(vy) * BigInt(m[4] ?? 0) +
      BigInt(vz) * BigInt(m[5] ?? 0),
    UNITSHR,
  );
  const Z = sar64(
    BigInt(vx) * BigInt(m[6] ?? 0) +
      BigInt(vy) * BigInt(m[7] ?? 0) +
      BigInt(vz) * BigInt(m[8] ?? 0),
    UNITSHR,
  );
  return [X, Y, Z];
}

/**
 * calc_applyrmatrix(dest, apply) (ACALC): combine an object's own transform `dest` with the camera
 * `apply`. Verbatim: dest.m = (dest.m · apply.m) >> 14; dest.pos = rotate(dest.pos by apply.m) + apply.pos.
 * Returns a new matrix (the original mutates in place; here we keep `dest` immutable for the bake step).
 */
export function applyRMatrix(dest: RMatrix, apply: RMatrix): RMatrix {
  const m = mulMatrices3x3(dest.m, apply.m);
  const [rx, ry, rz] = rotateSingle(apply.m, dest.x, dest.y, dest.z);
  return { m, x: rx + apply.x, y: ry + apply.y, z: rz + apply.z };
}

/**
 * calc_rotate (ACALC): rotate+translate a world vertex by an rmatrix. out = (M · v) >> 14 + pos.
 * The ASM uses 16-bit (movsx) matrix elements here, so values are within int16 — true for rotation
 * matrices (|m| <= UNIT = 16384 < 32768).
 */
export function rotateVertex(
  r: RMatrix,
  vx: number,
  vy: number,
  vz: number,
): [number, number, number] {
  const [X, Y, Z] = rotateSingle(r.m, vx, vy, vz);
  return [X + r.x, Y + r.y, Z + r.z];
}

/** calc_singlez (ACALC): the rotated+translated Z of one vertex (used for the painter's depth sort). */
export function singleZ(r: RMatrix, vx: number, vy: number, vz: number): number {
  const Z = sar64(
    BigInt(vx) * BigInt(r.m[6] ?? 0) +
      BigInt(vy) * BigInt(r.m[7] ?? 0) +
      BigInt(vz) * BigInt(r.m[8] ?? 0),
    UNITSHR,
  );
  return Z + r.z;
}
