import { type CircleTable, pround } from './tables.js';
import type { TunnelState } from './tunnel-sim.js';

export const SCREEN_W = 320;
export const SCREEN_H = 200;

/**
 * Rasterise one frame to a 320×200 8-bit palette-index buffer (TUN10.PAS:153-198). For ring depth
 * x = 80 downto 4: offset = putki[x] − putki[5]; colour bbc = putki[x].c + round(x/1.3); skip the ring
 * if bbc < 64 (unlit); otherwise plot the 64 dots of circle row sade[x], offset and clipped to screen.
 * Clears the buffer first — clear-and-redraw replaces the original `oldpos` incremental erase and yields
 * the same image (every visible dot redraws every frame). The original clips X only (and would read
 * out of bounds vertically); we additionally skip rows outside [0,200) to keep writes in-bounds.
 */
export function rasterTunnel(
  out: Uint8Array,
  s: TunnelState,
  circle: CircleTable,
  sade: Int32Array,
): void {
  out.fill(0);
  const ref5x = s.cx[5] ?? 0;
  const ref5y = s.cy[5] ?? 0;
  for (let x = 80; x >= 4; x--) {
    const bbc = (s.cc[x] ?? 0) + pround(x / 1.3);
    if (bbc < 64) continue;
    const offX = (s.cx[x] ?? 0) - ref5x;
    const offY = (s.cy[x] ?? 0) - ref5y;
    const row0 = (sade[x] ?? 0) * 64;
    for (let a = 0; a < 64; a++) {
      const col = (circle.x[row0 + a] ?? 0) + offX;
      if (col < 0 || col > 319) continue;
      const row = (circle.y[row0 + a] ?? 0) + offY;
      if (row < 0 || row > 199) continue;
      out[col + row * SCREEN_W] = bbc;
    }
  }
}
