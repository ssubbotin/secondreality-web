import { describe, expect, it } from 'vitest';
import { buildCosit, buildSinit } from './tables.js';
import { createTunnelState, stepTunnel, VEKE } from './tunnel-sim.js';

const sinit = buildSinit();
const cosit = buildCosit();

describe('tunnel sim', () => {
  it('starts at the origin; tick 1 lights the freshest ring with band colour 64', () => {
    const s = createTunnelState();
    stepTunnel(s, sinit, cosit);
    expect(s.sx).toBe(1);
    expect(s.sy).toBe(1);
    expect(s.frame).toBe(1);
    expect(s.cx[99]).toBe(0); // camera still at origin
    expect(s.cy[99]).toBe(0);
    expect(s.cc[99]).toBe(64); // (sy=1 & 15) = 1, not > 7 → ramp A base
  });

  it('toggles the colour band to 128 once (sy & 15) > 7', () => {
    const s = createTunnelState();
    for (let i = 0; i < 8; i++) stepTunnel(s, sinit, cosit); // sy reaches 8 → (8 & 15) = 8 > 7
    expect(s.sy).toBe(8);
    expect(s.cc[99]).toBe(128);
  });

  it('camera path follows the sine tables (sx==sy, so the two cosit terms cancel in x)', () => {
    const s = createTunnelState();
    for (let i = 0; i < 21; i++) stepTunnel(s, sinit, cosit); // last tick computed with sx=sy=20
    const k = 20;
    const expX = (cosit[k & 2047] ?? 0) - (sinit[(k * 3) & 4095] ?? 0) - (cosit[k & 2047] ?? 0);
    const expY = (sinit[(k * 2) & 4095] ?? 0) - (cosit[k & 2047] ?? 0); // + sinit[0] = 0
    expect(s.cx[99]).toBe(expX);
    expect(s.cy[99]).toBe(expY);
  });

  it('shifts the ring buffer down one each tick (older positions move toward index 0)', () => {
    const s = createTunnelState();
    stepTunnel(s, sinit, cosit); // tick1: cc[99]=64
    for (let i = 0; i < 8; i++) stepTunnel(s, sinit, cosit); // 8 more ticks shift it down by 8
    expect(s.cc[91]).toBe(64); // the tick-1 ring is now 8 slots lower
  });

  it('stops lighting new rings during the end fade (frame ≥ VEKE−102)', () => {
    const s = createTunnelState();
    s.frame = VEKE - 102;
    stepTunnel(s, sinit, cosit);
    expect(s.cc[99]).toBe(0);
  });

  it('clamps the frame counter at VEKE', () => {
    const s = createTunnelState();
    s.frame = VEKE;
    stepTunnel(s, sinit, cosit);
    expect(s.frame).toBe(VEKE);
  });
});
