import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  F_GOURAUD,
  F_SHADE16,
  F_SHADE32,
  parseChunkObject,
  shadeBitsFromFlags,
} from './object-chunk.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('parseChunkObject (VISU compiled-object format, U2E.001..042)', () => {
  it('parses "_platform" (U2E.001): 29 verts, 5 quad faces, leading-_ name', () => {
    const o = parseChunkObject(fixture('U2E.001'));
    expect(o.name).toBe('"_platform"');
    expect(o.vertices).toHaveLength(29);
    expect(o.normals).toHaveLength(1);
    expect(o.nnum1).toBe(1);
    expect(o.centerVertex).toBe(20);
    expect(o.faces).toHaveLength(5);
    expect(o.vertices[0]).toEqual({ x: -24992, y: -25983, z: 33, normal: o.vertices[0]?.normal });
    // name[1] is the leading-`_` engine sort flag (names carry surrounding quotes).
    expect(o.name[1]).toBe('_');
  });

  it('parses "BuildingH" (U2E.002): the animated building, 41 verts, 24 SHADE32 quads', () => {
    const o = parseChunkObject(fixture('U2E.002'));
    expect(o.name).toBe('"BuildingH"');
    expect(o.vertices).toHaveLength(41);
    expect(o.normals).toHaveLength(14);
    expect(o.nnum1).toBe(6);
    expect(o.centerVertex).toBe(32);
    expect(o.faces).toHaveLength(24);
    const f0 = o.faces[0];
    expect(f0?.v).toEqual([0, 1, 2, 3]);
    expect(f0?.color).toBe(64);
    expect(f0?.flags).toBe(F_SHADE32); // 0x0c
    expect(f0?.normal).toBe(0);
    // The first vertex is the verbatim chunk coordinate (object-local engine space).
    expect([o.vertices[0]?.x, o.vertices[0]?.y, o.vertices[0]?.z]).toEqual([8139, -17034, 5033]);
    // The first stored normal is +Z, length UNIT.
    expect(o.normals[0]).toEqual({ x: 0, y: 0, z: 16384 });
  });

  it('parses the FC "logo" finale (U2E.023): 275 verts, 190 faces, far in -X', () => {
    const o = parseChunkObject(fixture('U2E.023'));
    expect(o.name).toBe('"logo"');
    expect(o.vertices).toHaveLength(275);
    expect(o.normals).toHaveLength(247);
    expect(o.nnum1).toBe(67);
    expect(o.centerVertex).toBe(266);
    expect(o.faces).toHaveLength(190);
    expect([o.vertices[0]?.x, o.vertices[0]?.y, o.vertices[0]?.z]).toEqual([-106092, -3030, 3389]);
  });

  it('parses gouraud-flagged faces (U2E.035 "Car02": flags include F_GOURAUD|F_SHADE16)', () => {
    const o = parseChunkObject(fixture('U2E.035'));
    expect(o.name).toBe('"Car02"');
    expect(o.vertices).toHaveLength(21);
    const f0 = o.faces[0];
    expect(f0?.flags).toBe(F_GOURAUD | F_SHADE16); // 0x18
    expect(f0?.color).toBe(208);
  });

  it('every face references in-range vertices and a valid stored normal (all 42 chunks)', () => {
    const indices = Array.from({ length: 42 }, (_, i) => i + 1);
    let totalTris = 0;
    for (const e of indices) {
      const o = parseChunkObject(fixture(`U2E.${String(e).padStart(3, '0')}`));
      for (const f of o.faces) {
        expect(f.v.length).toBeGreaterThanOrEqual(3);
        for (const idx of f.v) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(o.vertices.length);
        }
        expect(f.normal).toBeGreaterThanOrEqual(0);
        expect(f.normal).toBeLessThan(o.normals.length);
        totalTris += f.v.length - 2;
      }
    }
    // 987 polygons over the 42 distinct objects → 1973 triangles after fan-triangulation.
    expect(totalTris).toBe(1973);
  });

  it('throws on a corrupt chunk (unknown tag) so format drift is caught', () => {
    const bad = new Uint8Array([0x42, 0x41, 0x44, 0x21, 0, 0, 0, 0]); // "BAD!" len 0
    expect(() => parseChunkObject(bad)).toThrow(/unknown chunk|missing POLY/);
  });
});

describe('shadeBitsFromFlags (face flag byte → ADRAW calclight shift)', () => {
  it('maps the F_SHADE bits to 3/4/5, unshaded to 0', () => {
    expect(shadeBitsFromFlags(F_SHADE32)).toBe(3);
    expect(shadeBitsFromFlags(F_SHADE16)).toBe(4);
    expect(shadeBitsFromFlags(0x04)).toBe(5); // F_SHADE8
    expect(shadeBitsFromFlags(F_GOURAUD)).toBe(0); // no shade bits set
    expect(shadeBitsFromFlags(F_GOURAUD | F_SHADE32)).toBe(3);
  });
});
