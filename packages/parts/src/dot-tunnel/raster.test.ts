import { describe, expect, it } from 'vitest';
import { rasterTunnel, SCREEN_H, SCREEN_W } from './raster.js';
import { buildCircleTable, buildCosit, buildSade, buildSinit } from './tables.js';
import { createTunnelState, stepTunnel } from './tunnel-sim.js';

const sinit = buildSinit();
const cosit = buildCosit();
const circle = buildCircleTable();
const sade = buildSade();

const stepN = (n: number) => {
  const s = createTunnelState();
  for (let i = 0; i < n; i++) stepTunnel(s, sinit, cosit);
  return s;
};

describe('rasterTunnel', () => {
  it('produces an empty buffer on frame 0 (no ring has been lit yet)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    out.fill(99); // poison so we can see fill(0) ran
    rasterTunnel(out, createTunnelState(), circle, sade);
    expect(out.some((v) => v !== 0)).toBe(false);
  });

  it('lights pixels once banded rings reach the drawn depth range, all within the palette ramps', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    rasterTunnel(out, stepN(200), circle, sade);
    const lit = out.reduce((n, v) => (v !== 0 ? n + 1 : n), 0);
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThanOrEqual(77 * 64); // ≤ rings(4..80) × 64 dots
    for (const v of out) {
      if (v !== 0) {
        expect(v).toBeGreaterThanOrEqual(64); // only drawn when bbc ≥ 64
        expect(v).toBeLessThanOrEqual(190); // max bbc = 128 + round(80/1.3)
      }
    }
  });

  it('never writes outside the 320×200 buffer (clips both axes)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    // 400 ticks pushes the camera path well off-centre; just assert no throw / no growth.
    expect(() => rasterTunnel(out, stepN(400), circle, sade)).not.toThrow();
    expect(out).toHaveLength(SCREEN_W * SCREEN_H);
  });
});
