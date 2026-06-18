// Verbatim ports of the GLENZ/VEC.ASM vector engine: rotlist (matrix * point), projlist (perspective
// projection) and checkhiddenbx (back-face test + brightness). All integer maths match the 80386 asm:
// 32x32->64 imul for rotation, signed idiv (truncate toward zero) for projection.

/** A projected screen vertex (projlist output: word sx, sy, dword z, word visibility flags). */
export interface Point3 {
  sx: number;
  sy: number;
  z: number;
  flags: number;
}

/** Projection constants (VID.ASM:init320x200). */
export interface ProjParams {
  xmul: number;
  ymul: number;
  xadd: number;
  yadd: number;
  minz: number;
  wminx: number;
  wminy: number;
  wmaxx: number;
  wmaxy: number;
}

/** 320x200 projection (VID.ASM:init320x200). */
export const PROJ_320: ProjParams = {
  xmul: 256,
  ymul: 213,
  xadd: 160,
  yadd: 130,
  minz: 128,
  wminx: 0,
  wminy: 0,
  wmaxx: 319,
  wmaxy: 199,
};

/** Truncate to signed 32-bit (x86 register width). */
const s32 = (v: number): number => v | 0;

/**
 * rotlist (VEC.ASM): out = (M · p) >> 15 + (xadd,yadd,zadd). The matrix `m` is 9 Q15 words (row-major,
 * the calcMatrixYXZ layout). Each axis sums three 32x16->48 products, then `shld ecx,ebx,17` keeps the
 * value shifted right by 15 (Q15 normalise). BigInt holds the 64-bit accumulator exactly, then we
 * truncate to signed 32-bit. `count` source points start at `src[0..]` as (x,y,z) int32 triples.
 */
export function rotatePoints(
  m: Int16Array,
  src: Int32Array,
  count: number,
  xadd: number,
  yadd: number,
  zadd: number,
): Int32Array {
  const out = new Int32Array(count * 3);
  const m0 = BigInt(m[0] ?? 0);
  const m1 = BigInt(m[1] ?? 0);
  const m2 = BigInt(m[2] ?? 0);
  const m3 = BigInt(m[3] ?? 0);
  const m4 = BigInt(m[4] ?? 0);
  const m5 = BigInt(m[5] ?? 0);
  const m6 = BigInt(m[6] ?? 0);
  const m7 = BigInt(m[7] ?? 0);
  const m8 = BigInt(m[8] ?? 0);
  for (let i = 0; i < count; i++) {
    const x = BigInt(src[i * 3] ?? 0);
    const y = BigInt(src[i * 3 + 1] ?? 0);
    const z = BigInt(src[i * 3 + 2] ?? 0);
    // Row order matches calcMatrix element layout: X uses m[0],m[1],m[2]; Y uses m[3],m[4],m[5];
    // Z uses m[6],m[7],m[8] (the asm's mtrm00/02/04, 06/08/10, 12/14/16).
    const rx = Number((x * m0 + y * m1 + z * m2) >> 15n);
    const ry = Number((x * m3 + y * m4 + z * m5) >> 15n);
    const rz = Number((x * m6 + y * m7 + z * m8) >> 15n);
    out[i * 3] = s32(rx + xadd);
    out[i * 3 + 1] = s32(ry + yadd);
    out[i * 3 + 2] = s32(rz + zadd);
  }
  return out;
}

/** The diagonal scale matrix the driver loads before the second crotlist (MAIN.C: matrix[0]=xscale*64). */
export function scaleMatrix(xscale: number, yscale: number, zscale: number): Int16Array {
  const m = new Int16Array(9);
  m[0] = xscale * 64;
  m[4] = yscale * 64;
  m[8] = zscale * 64;
  return m;
}

/** Sign-extend / truncate to signed 16-bit, as a MASM word store does. */
const s16 = (v: number): number => (v << 16) >> 16;

/**
 * projlist (VEC.ASM): perspective project each rotated point. z is clamped to minz (flag 16). The asm
 * does Y first: `imul projymul; idiv z; +projyadd`, then X. idiv truncates toward zero. Visibility flags:
 * 16 = near-clipped, 8 = below wmaxy, 4 = above wminy, 2 = right of wmaxx, 1 = left of wminx.
 */
export function projectPoints(rotated: Int32Array, p: ProjParams): Point3[] {
  const count = Math.floor(rotated.length / 3);
  const out: Point3[] = [];
  for (let i = 0; i < count; i++) {
    const x = rotated[i * 3] ?? 0;
    const y = rotated[i * 3 + 1] ?? 0;
    const zRaw = rotated[i * 3 + 2] ?? 0;
    let flags = 0;
    let z = zRaw;
    if (z < p.minz) {
      z = p.minz;
      flags |= 16;
    }
    // Y: 16-bit screen coord (the asm stores `ax`, a word).
    const sy = s16(Math.trunc((y * p.ymul) / z) + p.yadd);
    if (sy > p.wmaxy) flags |= 8;
    if (sy < p.wminy) flags |= 4;
    // X.
    const sx = s16(Math.trunc((x * p.xmul) / z) + p.xadd);
    if (sx > p.wmaxx) flags |= 2;
    if (sx < p.wminx) flags |= 1;
    out.push({ sx, sy, z: zRaw, flags });
  }
  return out;
}

/** A 2D screen vertex (the x,y that checkhiddenbx reads from the polylist). */
export interface Vertex2 {
  sx: number;
  sy: number;
}

/**
 * checkhiddenbx (VEC.ASM): signed 2D cross of the first three polygon vertices.
 *   cross = (x0-x1)*(y0-y2) - (y0-y1)*(x0-x2)
 * cross < 0 (high word negative) => back-facing (hidden). The magnitude feeds demo_glz brightness.
 * Inputs are 16-bit screen coords; the products are computed in full precision then the sign tested
 * exactly as the 32-bit subtraction `sub ax,si / sbb dx,cx` does.
 */
export function faceCross(
  v0: Vertex2,
  v1: Vertex2,
  v2: Vertex2,
): { cross: number; hidden: boolean } {
  const a = s16(v0.sx - v1.sx);
  const b = s16(v0.sy - v2.sy);
  const c = s16(v0.sy - v1.sy);
  const d = s16(v0.sx - v2.sx);
  const cross = a * b - c * d; // exact (each factor int16, product < 2^31)
  return { cross, hidden: cross < 0 };
}
