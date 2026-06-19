import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSceneMaterials } from './assets.js';
import {
  calcLight,
  effectiveFaceFlags,
  F_GOURAUD,
  F_SHADE16,
  F_SHADE32,
  F_SHADE_MASK,
  normalLight,
} from './light.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('vector1 scene materials (U2A.00M)', () => {
  const mat = parseSceneMaterials(fixture('U2A.00M'));

  it('extracts the 256-entry 6-bit VGA palette', () => {
    expect(mat.palette).toHaveLength(768);
    expect([...mat.palette.slice(0, 9)]).toEqual([0, 0, 0, 1, 1, 1, 3, 3, 3]);
    // DEFAULT material fade ramp starts at colour index 96 (a low blue gradient).
    expect([...mat.palette.slice(96 * 3, 96 * 3 + 9)]).toEqual([1, 1, 2, 2, 2, 4, 3, 3, 6]);
  });

  it('maps co[1..5] to ship meshes with the pixel ship instanced x3', () => {
    expect(mat.conum).toBe(6);
    // co[1]->obj1, co[2]->obj2, co[3]->obj3, co[4]->obj1, co[5]->obj1.
    expect(mat.objectIndex).toEqual([1, 2, 3, 1, 1]);
  });
});

describe('vector1 flat-shade lighting (VISU/ADRAW.ASM)', () => {
  it('effectiveFaceFlags recovers the shade/gouraud bits from the polydata byte', () => {
    // s01 faces carry byte 0x1C = gouraud + shade32, 0x18 = gouraud + shade16, 0x0C = shade32.
    expect(effectiveFaceFlags(0x1c) & F_SHADE_MASK).toBe(F_SHADE32);
    expect(effectiveFaceFlags(0x1c) & F_GOURAUD).toBe(F_GOURAUD);
    expect(effectiveFaceFlags(0x18) & F_SHADE_MASK).toBe(F_SHADE16);
    expect(effectiveFaceFlags(0x0c) & F_SHADE_MASK).toBe(F_SHADE32);
    // Sippi faces carry byte 0x08 = flat shade16.
    expect(effectiveFaceFlags(0x08) & F_SHADE_MASK).toBe(F_SHADE16);
    expect(effectiveFaceFlags(0x08) & F_GOURAUD).toBe(0);
  });

  it('calcLight reproduces ADRAW shade offsets for s01 face normals (shade32)', () => {
    // The first six basic normals of s01 (engine fixed-point), shade32 -> offsets 5,20,21,23,23,23.
    const norms: [number, number, number][] = [
      [0, -16384, 0],
      [12139, -4675, -9960],
      [14425, -5750, -5222],
      [15169, -6185, 261],
      [14355, -5719, 5445],
      [12003, -4710, 10107],
    ];
    const flags = effectiveFaceFlags(0x1c); // gouraud+shade32; calcLight uses the shade bits
    const got = norms.map(([x, y, z]) => calcLight(x, y, z, flags));
    expect(got).toEqual([5, 20, 21, 23, 23, 23]);
  });

  it('normalLight is centred at 128 for a perpendicular normal and clamps to 0..255', () => {
    expect(normalLight(0, 0, 0)).toBe(128);
    expect(normalLight(32767, 32767, 32767)).toBe(255);
    expect(normalLight(-32767, -32767, -32767)).toBe(0);
  });

  it('calcLight is 0 for an unshaded face', () => {
    expect(calcLight(12139, -4675, -9960, 0)).toBe(0);
  });
});
