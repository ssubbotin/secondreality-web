// Fixed-point 3D math ported verbatim from the VISU engine (VISU/ACALC.ASM, VISU/CD.H). The engine works
// in a 16.14 fixed-point world: rotation-matrix elements are integers scaled by UNIT=16384 (UNITSHR=14),
// positions are raw integers. Every product is accumulated in a wider integer then shifted right by 14
// (the asm `shrd ...,unitshr` after a 32x32->64 `imul`), which on two's-complement is an arithmetic
// floor shift — matched here with JS `>> ` over Number, kept exact by working through BigInt for the
// 64-bit intermediates (JS Number loses precision above 2^53; ship positions reach ~5e5 and matrix
// products overflow 2^53). The perspective divide uses C integer division (truncation toward zero), NOT
// the floor shift — matched with `cdiv`.

export const UNIT = 16384;
export const UNITSHR = 14n;

/** rmatrix (CD.H s_rmatrix): 9 rotation elements (fixed-point, /UNIT) + integer position x,y,z. */
export interface RMatrix {
  /** Row-major 3x3 rotation, fixed-point (element/UNIT). m[r*3+c]. */
  m: number[];
  x: number;
  y: number;
  z: number;
}

/** C integer division: truncate toward zero (matches `idiv`). */
export function cdiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** A fresh zeroed rmatrix (memset 0 — the state the animation stream accumulates deltas into). */
export function zeroMatrix(): RMatrix {
  return { m: [0, 0, 0, 0, 0, 0, 0, 0, 0], x: 0, y: 0, z: 0 };
}

export function identityMatrix(): RMatrix {
  return { m: [UNIT, 0, 0, 0, UNIT, 0, 0, 0, UNIT], x: 0, y: 0, z: 0 };
}

export function cloneMatrix(r: RMatrix): RMatrix {
  return { m: [...r.m], x: r.x, y: r.y, z: r.z };
}

/** `>> 14` over a (possibly 64-bit) BigInt product, returned as a JS integer (arithmetic floor shift). */
function shr14(v: bigint): number {
  return Number(v >> UNITSHR);
}

/**
 * mulmatrices2 (ACALC.ASM): result[r][c] = sum_k a[r][k]*b[k][c] >> 14. Used by calc_applyrmatrix as
 * `dest = apply . dest` (rotation only). Returns a new 9-element array.
 */
export function matMul(a: readonly number[], b: readonly number[]): number[] {
  const r = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let s = 0n;
      for (let k = 0; k < 3; k++) {
        const av = a[row * 3 + k] ?? 0;
        const bv = b[k * 3 + col] ?? 0;
        s += BigInt(av) * BigInt(bv);
      }
      r[row * 3 + col] = shr14(s);
    }
  }
  return r;
}

/** rotatesingle (ACALC.ASM): out = m . p (matrix rows dotted with the vector), each row >> 14. */
export function rotatePoint(
  m: readonly number[],
  px: number,
  py: number,
  pz: number,
): [number, number, number] {
  const x =
    BigInt(m[0] ?? 0) * BigInt(px) +
    BigInt(m[1] ?? 0) * BigInt(py) +
    BigInt(m[2] ?? 0) * BigInt(pz);
  const y =
    BigInt(m[3] ?? 0) * BigInt(px) +
    BigInt(m[4] ?? 0) * BigInt(py) +
    BigInt(m[5] ?? 0) * BigInt(pz);
  const z =
    BigInt(m[6] ?? 0) * BigInt(px) +
    BigInt(m[7] ?? 0) * BigInt(py) +
    BigInt(m[8] ?? 0) * BigInt(pz);
  return [shr14(x), shr14(y), shr14(z)];
}

/**
 * calc_applyrmatrix(dest, apply) (ACALC.ASM): the apply matrix is the camera. dest.m = apply.m . dest.m;
 * dest.pos = (apply.m . dest.pos) + apply.pos. Mutates and returns `dest` (matching the in-place asm).
 */
export function applyMatrix(dest: RMatrix, apply: RMatrix): RMatrix {
  dest.m = matMul(apply.m, dest.m);
  const [rx, ry, rz] = rotatePoint(apply.m, dest.x, dest.y, dest.z);
  dest.x = rx + apply.x;
  dest.y = ry + apply.y;
  dest.z = rz + apply.z;
  return dest;
}

/** Sign-extend the low 16 bits (calc_rotate uses matrix elements via `movsx word`). */
function s16(v: number): number {
  const w = v & 0xffff;
  return w >= 0x8000 ? w - 0x10000 : w;
}

/**
 * calc_rotate (ACALC.ASM) for one vertex: rotate (matrix elements taken as signed 16-bit) then add the
 * matrix position. The 64-bit intermediate is shifted right 14 (floor). `m` is dest's rotation, `(px,py,pz)`
 * its position.
 */
export function rotateVertex(
  m: readonly number[],
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
): [number, number, number] {
  const m0 = BigInt(s16(m[0] ?? 0));
  const m1 = BigInt(s16(m[1] ?? 0));
  const m2 = BigInt(s16(m[2] ?? 0));
  const m3 = BigInt(s16(m[3] ?? 0));
  const m4 = BigInt(s16(m[4] ?? 0));
  const m5 = BigInt(s16(m[5] ?? 0));
  const m6 = BigInt(s16(m[6] ?? 0));
  const m7 = BigInt(s16(m[7] ?? 0));
  const m8 = BigInt(s16(m[8] ?? 0));
  const bx = BigInt(vx);
  const by = BigInt(vy);
  const bz = BigInt(vz);
  const x = shr14(m0 * bx + m1 * by + m2 * bz) + px;
  const y = shr14(m3 * bx + m4 * by + m5 * bz) + py;
  const z = shr14(m6 * bx + m7 * by + m8 * bz) + pz;
  return [x, y, z];
}

/**
 * calc_singlez (ACALC.ASM): rotate one vertex by the Z row of the matrix and add the matrix Z — the object
 * sort key. Matches calc_rotate's Z component exactly (matrix elements are taken as full longs here, as the
 * asm uses `mov eax,[m+24]` not movsx, but for valid rotation matrices the high words are sign extensions).
 */
export function singleZ(
  m: readonly number[],
  pz: number,
  vx: number,
  vy: number,
  vz: number,
): number {
  const s =
    BigInt(m[6] ?? 0) * BigInt(vx) +
    BigInt(m[7] ?? 0) * BigInt(vy) +
    BigInt(m[8] ?? 0) * BigInt(vz);
  return shr14(s) + pz;
}

/** The mode-X projection constants (AVIDM1.ASM m1_init). */
export interface Projection {
  mulX: number;
  mulY: number;
  addX: number;
  addY: number;
  clipZMin: number;
  clipZMax: number;
}

export const PROJ_MODEX: Projection = {
  mulX: 250,
  mulY: 220,
  addX: 160,
  addY: 100,
  clipZMin: 256,
  clipZMax: 1000000000,
};

/** Visibility flags (CD.H). */
export const VF_UP = 1;
export const VF_DOWN = 2;
export const VF_LEFT = 4;
export const VF_RIGHT = 8;
export const VF_NEAR = 16;

export interface Projected {
  sx: number;
  sy: number;
  /** Logical visibility flags (off-screen / near). 0 = fully on screen. */
  vf: number;
}

/**
 * calc_project (ACALC.ASM) for one vertex: perspective divide with C integer-truncating division and the
 * clip-flag accumulation (Z is clamped to clipZMin when too near). `clipX/Y` are the screen bounds used for
 * the off-screen flags (mode-X 0..319 / 0..199).
 */
export function projectVertex(
  x: number,
  y: number,
  z: number,
  proj: Projection,
  clipXMax: number,
  clipYMax: number,
): Projected {
  let vf = 0;
  let zz = z;
  if (zz < proj.clipZMin) {
    vf |= VF_NEAR;
    zz = proj.clipZMin;
  }
  // Y first (matches the asm ordering), then X.
  const sy = cdiv(y * proj.mulY, zz) + proj.addY;
  if (sy > clipYMax) vf |= VF_DOWN;
  if (sy < 0) vf |= VF_UP;
  const sx = cdiv(proj.mulX * x, zz) + proj.addX;
  if (sx > clipXMax) vf |= VF_RIGHT;
  if (sx < 0) vf |= VF_LEFT;
  return { sx, sy, vf };
}
