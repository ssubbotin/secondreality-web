// The lens warp — the runtime side of drawlens (MAIN.C:49) + dorow/dorow2/dorow3 (ASM.ASM).
//
// drawlens(x0,y0) sets the lens base offset u = (x0-lensxs) + (y0-lensys)*320 (the lens top-left in
// 320×200 screen space) and walks the LENS_HIG rows from the outside in: for y in [0, lenshig/2) it
// plots row y at u1 (descending from the top) and row (lenshig-1-y) at u2 (ascending from the bottom),
// advancing u1 by +320 and u2 by -320. Each plotted row replays its precomputed plot-ops.

import { LENS_HIG, LENS_XS, LENS_YS, type LensPlan, SCREEN_W } from './displacement.js';

export const SCREEN_H = 200;
export const SCREEN_PIXELS = SCREEN_W * SCREEN_H; // 64000

/**
 * Build the source ("back") buffer: the raw 320×200 index image plus the 1536-byte overflow guard
 * MAIN.C:302 appends (`memcpy(back+64000, back+64000-1536, 1536)`) so the magnified reads near the bottom
 * edge never run past the array. Source offsets are masked to 16 bits (mode-X segment addressing) before
 * the read, exactly as the original far pointers wrapped.
 */
export function makeBackBuffer(raw: Uint8Array): Uint8Array {
  const back = new Uint8Array(SCREEN_PIXELS + 1536);
  back.set(raw.subarray(0, SCREEN_PIXELS));
  back.set(raw.subarray(SCREEN_PIXELS - 1536, SCREEN_PIXELS), SCREEN_PIXELS);
  return back;
}

function plotRow(out: Uint8Array, back: Uint8Array, plan: LensPlan, u: number, y: number): void {
  if (u < 0 || u > SCREEN_PIXELS) return; // MAIN.C drawlens row guard
  const row = plan.rows[y];
  if (!row) return;
  const ops = row.ops;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op) continue;
    const dst = u + op.dst;
    if (dst < 0 || dst >= SCREEN_PIXELS) continue;
    const src = (u + op.src) & 0xffff;
    out[dst] = (back[src] ?? 0) | op.flag;
  }
}

/**
 * Warp one frame: paint the background, then overlay the lens at (x0,y0) screen pixels (the drawlens
 * top↕bottom row walk). `out` must hold SCREEN_PIXELS bytes; `back` must be makeBackBuffer's output.
 */
export function warpLens(
  out: Uint8Array,
  back: Uint8Array,
  plan: LensPlan,
  x0: number,
  y0: number,
): void {
  out.set(back.subarray(0, SCREEN_PIXELS));
  let u1 = x0 - LENS_XS + (y0 - LENS_YS) * SCREEN_W;
  let u2 = x0 - LENS_XS + (y0 + LENS_YS - 1) * SCREEN_W;
  const ys = LENS_HIG >> 1;
  const ye = LENS_HIG - 1;
  for (let y = 0; y < ys; y++) {
    plotRow(out, back, plan, u1, y);
    u1 += SCREEN_W;
    plotRow(out, back, plan, u2, ye - y);
    u2 -= SCREEN_W;
  }
}
