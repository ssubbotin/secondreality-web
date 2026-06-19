import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAsc } from './asc.js';
import { UNIT } from './fixed.js';
import { buildCity, faceNormal, WORLD_SCALE, Z_SHIFT } from './geometry.js';
import { parseMaterials } from './material.js';

const dir = (n: string) => fileURLToPath(new URL(`./__fixtures__/${n}`, import.meta.url));
const scene = parseAsc(readFileSync(dir('CITY.ASC'), 'latin1'));
const materials = parseMaterials(readFileSync(dir('U2E.MAT'), 'latin1'));

describe('buildCity', () => {
  const city = buildCity(scene, materials);

  it('keeps all 25 meshes', () => {
    expect(city.length).toBe(25);
  });

  it('scales ASC vertices into engine space (×10, Z shifted) matching the binary objects', () => {
    // BuildingH ASC vertex 0 = (813.99, -1703.46, 520.19) → binary (8139, -17034, 5033).
    const bh = city.find((m) => m.name === 'BuildingH');
    expect(bh?.verts[0]).toBe(Math.trunc(813.990723 * WORLD_SCALE)); // 8139
    expect(bh?.verts[1]).toBe(Math.trunc(-1703.455444 * WORLD_SCALE)); // -17034
    expect(bh?.verts[2]).toBe(Math.trunc(520.186035 * WORLD_SCALE) + Z_SHIFT); // 5032
  });

  it('emits a normalised face normal of length ≈ UNIT per triangle', () => {
    const m = city[0];
    const t = m?.tris[0];
    if (!t) throw new Error('no tri');
    const len = Math.sqrt(t.nx * t.nx + t.ny * t.ny + t.nz * t.nz);
    expect(len).toBeGreaterThan(UNIT * 0.98);
    expect(len).toBeLessThan(UNIT * 1.02);
  });

  it('assigns material base colours (BuildingH = CYANMETAL base 192)', () => {
    const bh = city.find((m) => m.name === 'BuildingH');
    // BuildingH faces are CYANMETAL in CITY.ASC → base 192 from U2E.MAT.
    expect(bh?.tris[0]?.baseColor).toBe(192);
  });

  it('defaults material-less faces (tunneli) to the DEFAULT material (base 0)', () => {
    const t = city.find((m) => m.name === 'tunneli');
    expect(t?.tris.every((tr) => tr.baseColor === 0)).toBe(true);
  });
});

describe('faceNormal (OPT.C Newell, negated)', () => {
  it('points along +Z for this winding (OPT.C negated-Newell convention)', () => {
    // Triangle a=(0,0,0) b=(UNIT,0,0) c=(0,UNIT,0): Newell z-sum = -UNIT², negated → +UNIT.
    const verts = new Int32Array([0, 0, 0, UNIT, 0, 0, 0, UNIT, 0]);
    const [nx, ny, nz] = faceNormal(verts, 0, 1, 2);
    expect(Math.abs(nx)).toBe(0);
    expect(Math.abs(ny)).toBe(0);
    expect(nz).toBeGreaterThan(0);
    expect(Math.abs(nz)).toBeCloseTo(UNIT, -1);
    // Reversing the winding flips the normal.
    expect(faceNormal(verts, 0, 2, 1)[2]).toBeLessThan(0);
  });

  it('returns a zero normal for a degenerate (zero-area) triangle', () => {
    const verts = new Int32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(faceNormal(verts, 0, 1, 2)).toEqual([0, 0, 0]);
  });
});
