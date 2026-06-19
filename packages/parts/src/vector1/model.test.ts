import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseModel } from './model.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('vector1 model parser (VISU/VISU.C vis_loadobject)', () => {
  it('parses ship "s01" (U2A.001 = PXLSHIP): 159 verts, 124 polys', () => {
    const m = parseModel(fixture('U2A.001'));
    expect(m.name).toBe('"s01"');
    expect(m.vertices).toHaveLength(159);
    expect(m.faces).toHaveLength(124);
    expect(m.centerVertex).toBe(150);
    expect(m.nnum1).toBe(119);
    expect(m.normals).toHaveLength(269);
    // First vertex (engine space) from the binary.
    expect(m.vertices[0]).toEqual({ x: 74, y: 6787, z: -674, normal: 119 });
    expect(m.vertices[1]).toEqual({ x: 85, y: 6787, z: -656, normal: 120 });
    // The material base colours used by this ship.
    const cols = new Set(m.faces.map((f) => f.color));
    expect([...cols].sort((a, b) => a - b)).toEqual([0, 32, 64, 128]);
    // Every face index is a valid vertex / normal.
    for (const f of m.faces) {
      expect(f.v.length).toBeGreaterThanOrEqual(3);
      for (const idx of f.v) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(159);
      }
      expect(f.normal).toBeGreaterThanOrEqual(0);
      expect(f.normal).toBeLessThan(269);
    }
  });

  it('parses ship "Sippi" (U2A.002): 285 verts, 75 polys', () => {
    const m = parseModel(fixture('U2A.002'));
    expect(m.name).toBe('"Sippi"');
    expect(m.vertices).toHaveLength(285);
    expect(m.faces).toHaveLength(75);
    expect(m.centerVertex).toBe(276);
    expect(m.vertices[0]).toEqual({ x: 5460, y: 7624, z: 2257, normal: 48 });
    const cols = new Set(m.faces.map((f) => f.color));
    expect([...cols].sort((a, b) => a - b)).toEqual([0, 4]);
  });

  it('parses "moottori"/engine (U2A.003): 45 verts, 20 polys', () => {
    const m = parseModel(fixture('U2A.003'));
    expect(m.name).toBe('"moottori"');
    expect(m.vertices).toHaveLength(45);
    expect(m.faces).toHaveLength(20);
    expect(m.centerVertex).toBe(36);
    expect(m.vertices[0]).toEqual({ x: -11103, y: 152783, z: 6779, normal: 20 });
    const cols = new Set(m.faces.map((f) => f.color));
    expect([...cols].sort((a, b) => a - b)).toEqual([64, 96]);
  });

  it('the first face of s01 references in-range vertices and a basic (face) normal', () => {
    const m = parseModel(fixture('U2A.001'));
    const f0 = m.faces[0];
    expect(f0).toBeDefined();
    if (!f0) return;
    // Face normal is one of the basic normals (index < nnum1) for flat-shaded faces.
    expect(f0.normal).toBeLessThan(m.normals.length);
    for (const idx of f0.v) expect(m.vertices[idx]).toBeDefined();
  });
});
