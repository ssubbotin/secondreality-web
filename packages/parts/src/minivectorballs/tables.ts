/**
 * Fixed-point helpers + the ball-sprite depth tables, ported verbatim from DOTS/MAIN.C + ASM.ASM.
 *
 * 8086/386 integer semantics reproduced exactly:
 *   - `idiv`  : 32÷16 signed division, quotient truncated toward zero (C / asm `idiv`).
 *   - `asr`   : arithmetic right shift of a signed value = floor(v / 2^n) (asm `shrd`+`sar` / `sar`).
 *   - `imulHi`: signed high word of a 16×16→32 product (`imul r/m16` leaves it in dx) = asr(a·b, 16).
 */

const tr = (x: number): number => Math.trunc(x);

/** Asm `idiv`: signed 32÷16, quotient truncated toward zero (normalising -0 to 0). */
export function idiv(a: number, b: number): number {
  const q = tr(a / b);
  return q === 0 ? 0 : q;
}

/** Arithmetic right shift of a signed integer by n bits (floor division by 2^n). */
export function asr(v: number, n: number): number {
  return Math.floor(v / 2 ** n);
}

/** Signed high word of a 16×16→32 product, as `imul`'s dx register holds it. */
export function imulHi(a: number, b: number): number {
  return asr(a * b, 16);
}

/** The asm depth-table element index for a perspective divisor `bp`: `((bp >> 6) & ~3) / 4`. */
export function depthElement(bp: number): number {
  return ((asr(bp, 6) & ~3) >> 2) & 0xffff;
}

/** The three sprite rows (palette bytes), row-major over the 128 depth-table elements. */
export interface DepthTables {
  /** Row 0: 2 bytes per element (`depthtable1` low word). */
  row0: Uint8Array;
  /** Row 1: 4 bytes per element (`depthtable2` full dword). */
  row1: Uint8Array;
  /** Row 2: 2 bytes per element (`depthtable3` low word). */
  row2: Uint8Array;
  /** Per-element brightness level `c ∈ [0,15]` (exposed for the modern renderer's disc shade). */
  bright: Uint8Array;
}

/**
 * MAIN.C: for a∈[0,128) compute the brightness `c = 15 − clamp((a−31)·3/4 + 8, 0, 15)`, then encode the
 * three sprite rows from the 32-bit constants:
 *   depthtable1 = 0x0202     + 0x04040404·c → low-word bytes [2+4c, 2+4c]            (row 0, 2 px)
 *   depthtable2 = 0x02030302 + 0x04040404·c → dword bytes    [2+4c, 3+4c, 3+4c, 2+4c] (row 1, 4 px)
 *   depthtable3 = 0x0202     + 0x04040404·c → low-word bytes [2+4c, 2+4c]            (row 2, 2 px)
 * Byte order is little-endian (the asm reads the constant straight from memory). The drawn byte
 * `2+4c`/`3+4c` selects ball-palette channel b∈{2,3} at brightness level a=c.
 */
export function buildDepthTables(): DepthTables {
  const row0 = new Uint8Array(128 * 2);
  const row1 = new Uint8Array(128 * 4);
  const row2 = new Uint8Array(128 * 2);
  const bright = new Uint8Array(128);
  for (let a = 0; a < 128; a++) {
    let c = a - tr((43 + 20) / 2); // a − 31
    c = tr((c * 3) / 4); // C int div, truncates toward zero (c may be negative here)
    c += 8;
    if (c < 0) c = 0;
    else if (c > 15) c = 15;
    c = 15 - c;
    bright[a] = c;
    const lo = 2 + 4 * c; // byte 0x02 + 0x04·c
    const hi = 3 + 4 * c; // byte 0x03 + 0x04·c
    row0[a * 2] = lo;
    row0[a * 2 + 1] = lo;
    row1[a * 4] = lo;
    row1[a * 4 + 1] = hi;
    row1[a * 4 + 2] = hi;
    row1[a * 4 + 3] = lo;
    row2[a * 2] = lo;
    row2[a * 2 + 1] = lo;
  }
  return { row0, row1, row2, bright };
}
