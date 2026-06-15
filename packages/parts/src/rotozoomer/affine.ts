/** A 2-vector in source-texel space. */
export type Vec2 = readonly [number, number];

/** Fixed-point→texel scale (ASM.ASM: (xa,ya)<<6 added to .16 positions → /2^10). */
const S = 1 / 1024;
/** Mode-13h pixel aspect applied to the row step only (ASM.ASM: xadd/yadd ×307>>8). */
export const ASPECT = 307 / 256;

export interface AffineBasis {
  startUV: Vec2;
  colStep: Vec2;
  rowStep: Vec2;
}

/**
 * Turn a spline pose into the screen-pixel→texel basis the GPU pass walks:
 * texel(col,row) = startUV + col·colStep + row·rowStep (then wrapped mod 256).
 * Decoded from ASM.ASM _rotate: colStep = (ya,−xa)·S ; rowStep = (xa,ya)·S·ASPECT.
 */
export function affineBasis(p: { x: number; y: number; xa: number; ya: number }): AffineBasis {
  return {
    startUV: [p.x, p.y],
    colStep: [p.ya * S, -p.xa * S],
    rowStep: [p.xa * S * ASPECT, p.ya * S * ASPECT],
  };
}
