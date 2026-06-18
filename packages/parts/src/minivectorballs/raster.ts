import { type BallsState, DOTNUM, projectBall, SHADOW_INDEX } from './balls-sim.js';
import type { DepthTables } from './tables.js';

export const SCREEN_W = 320;
export const SCREEN_H = 200;

/**
 * Rasterise one frame to a 320×200 8-bit palette-index buffer (ASM.ASM `_drawdots`). For every ball in
 * id order: project (which also integrates its gravity), and if on-screen plot
 *   - a 2-pixel shadow (index 87) at (sx, shy), (sx+1, shy);
 *   - the depth-shaded ball sprite when the ball row is on-screen — three short rows from the depth
 *     tables: row0 (2 px) at (sx+1, by), (sx+2, by); row1 (4 px) at (sx..sx+3, by+1); row2 (2 px) at
 *     (sx+1, by+2), (sx+2, by+2). These offsets are the asm's `bx+1`, `bx+320`, `bx+641`.
 * Clears the buffer first — clear-and-redraw replaces the original `oldpos`/`bgpic` incremental erase
 * (no decoded background is available; the image is identical apart from the missing background picture).
 * The original clipped only the sprite's centre and could wrap a sprite across a scanline edge; we clip
 * every plotted pixel to the buffer to keep writes in-bounds (documented deviation).
 */
export function rasterBalls(out: Uint8Array, s: BallsState, dt: DepthTables): void {
  out.fill(0);
  for (let i = 0; i < DOTNUM; i++) {
    const r = projectBall(s, i);
    if (!r.visible) continue;
    const sx = r.screenX;

    // Shadow: 2 px at (sx, shy), (sx+1, shy).
    plot(out, sx, r.shadowRow, SHADOW_INDEX);
    plot(out, sx + 1, r.shadowRow, SHADOW_INDEX);

    if (!r.ballVisible) continue;
    const by = r.ballRow;
    const d2 = r.depthIdx * 2;
    const d4 = r.depthIdx * 4;
    // Row 0 (by): bytes [row0[0], row0[1]] at (sx+1, sx+2).
    plot(out, sx + 1, by, dt.row0[d2] ?? 0);
    plot(out, sx + 2, by, dt.row0[d2 + 1] ?? 0);
    // Row 1 (by+1): bytes [row1[0..3]] at (sx..sx+3).
    plot(out, sx, by + 1, dt.row1[d4] ?? 0);
    plot(out, sx + 1, by + 1, dt.row1[d4 + 1] ?? 0);
    plot(out, sx + 2, by + 1, dt.row1[d4 + 2] ?? 0);
    plot(out, sx + 3, by + 1, dt.row1[d4 + 3] ?? 0);
    // Row 2 (by+2): bytes [row2[0], row2[1]] at (sx+1, sx+2).
    plot(out, sx + 1, by + 2, dt.row2[d2] ?? 0);
    plot(out, sx + 2, by + 2, dt.row2[d2 + 1] ?? 0);
  }
}

function plot(out: Uint8Array, x: number, y: number, value: number): void {
  if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H) return;
  out[y * SCREEN_W + x] = value;
}
