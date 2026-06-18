/**
 * C integer semantics used throughout the PLZPART cube port (VECT.C, PLZFILL.C). The original is
 * 16-/32-bit C compiled by Microsoft C; we reproduce the exact rounding/shift behaviour.
 */

/** Arithmetic right shift (floor toward −∞), matching C signed `>>` on these compilers. */
export function sar(x: number, n: number): number {
  return Math.floor(x / 2 ** n);
}

/** C integer division: truncate toward zero (so −7/2 = −3, not −4). */
export function cdiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
