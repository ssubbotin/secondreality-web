import { describe, expect, it } from 'vitest';
import { MAIN_SOLID, QQQ, SMALL_SOLID, ZZZ } from './geometry.js';

describe('glenz geometry — verbatim from GLENZ/MAIN.C', () => {
  it('uses the original scale constants', () => {
    expect(ZZZ).toBe(50);
    expect(QQQ).toBe(99);
  });

  it('MAIN_SOLID is a 14-vertex / 24-triangle spiked cube (points[] / epolys[])', () => {
    expect(MAIN_SOLID.vertices).toHaveLength(14);
    expect(MAIN_SOLID.faces).toHaveLength(24);
    // First cube corner: (-100,-100,-100)*ZZZ.
    expect(MAIN_SOLID.vertices[0]).toEqual([-100 * ZZZ, -100 * ZZZ, -100 * ZZZ]);
    // Vertex 8 = +Z spike at -170 (points[] row 8).
    expect(MAIN_SOLID.vertices[8]).toEqual([0, 0, -170 * ZZZ]);
    // Vertex 13 = -Y spike.
    expect(MAIN_SOLID.vertices[13]).toEqual([0, -170 * ZZZ, 0]);
    // Every face is a triangle whose indices are valid.
    for (const f of MAIN_SOLID.faces) {
      expect(f.v).toHaveLength(3);
      for (const idx of f.v) expect(idx).toBeGreaterThanOrEqual(0);
      for (const idx of f.v) expect(idx).toBeLessThan(14);
    }
    // First face: epolys row `3,0x4002,0,1,8`.
    expect(MAIN_SOLID.faces[0]?.v).toEqual([0, 1, 8]);
    // Last face: `3,0x4030,6,5,9`.
    expect(MAIN_SOLID.faces[23]?.v).toEqual([6, 5, 9]);
  });

  it('SMALL_SOLID is the QQQ-scaled spiked cube (pointsb[] / epolysb[])', () => {
    expect(SMALL_SOLID.vertices).toHaveLength(14);
    expect(SMALL_SOLID.faces).toHaveLength(24);
    expect(SMALL_SOLID.vertices[0]).toEqual([-60 * QQQ, -60 * QQQ, -60 * QQQ]);
    expect(SMALL_SOLID.vertices[8]).toEqual([0, 0, -105 * QQQ]);
    // epolysb first face `3,0x4004,0,1,8`.
    expect(SMALL_SOLID.faces[0]?.v).toEqual([0, 1, 8]);
  });
});
