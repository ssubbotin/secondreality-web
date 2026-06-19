import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAsc } from './asc.js';

const CITY = readFileSync(
  fileURLToPath(new URL('./__fixtures__/CITY.ASC', import.meta.url)),
  'latin1',
);

describe('parseAsc on CITY.ASC', () => {
  const scene = parseAsc(CITY);

  it('parses every Tri-mesh object (25 meshes + 1 camera, 1 light ignored)', () => {
    // CITY.ASC has 27 "Named object" blocks: 25 Tri-mesh objects, Camera01, and Light02 (a
    // Direct light, which carries no mesh and no camera target — it is skipped).
    expect(scene.meshes.length).toBe(25);
    expect(scene.cameras.length).toBe(1);
  });

  it('parses the first mesh "platform01" with its exact vertex/face counts', () => {
    const m = scene.meshes[0];
    expect(m?.name).toBe('platform01');
    expect(m?.vertices.length).toBe(16);
    expect(m?.faces.length).toBe(8);
  });

  it('reads platform01 vertex 0 verbatim from the ASC text', () => {
    const v = scene.meshes[0]?.vertices[0];
    expect(v?.x).toBeCloseTo(-2500, 3);
    expect(v?.y).toBeCloseTo(-2598.325684, 3);
    expect(v?.z).toBeCloseTo(16.175011, 3);
  });

  it('reads platform01 face 0 indices + material', () => {
    const f = scene.meshes[0]?.faces[0];
    expect(f).toEqual({ a: 0, b: 1, c: 2, material: 'GRAYCEMENT' });
  });

  it('parses BuildingH (16 verts visible in header, 41 not — verify the named building)', () => {
    const bh = scene.meshes.find((m) => m.name === 'BuildingH');
    expect(bh).toBeDefined();
    // BuildingH vertex 0 from the ASC: X 813.99 Y -1703.46 Z 520.19
    const v = bh?.vertices[0];
    expect(v?.x).toBeCloseTo(813.990723, 2);
    expect(v?.y).toBeCloseTo(-1703.455444, 2);
    expect(v?.z).toBeCloseTo(520.186035, 2);
  });

  it('parses the Camera01 position + target', () => {
    const cam = scene.cameras[0];
    expect(cam?.name).toBe('Camera01');
    expect(cam?.position.x).toBeCloseTo(-2560.44873, 2);
    expect(cam?.position.y).toBeCloseTo(-4699.812012, 2);
    expect(cam?.position.z).toBeCloseTo(604.55249, 2);
    expect(cam?.target.y).toBeCloseTo(-3967.84082, 2);
  });

  it('assigns materials per READASC.C — named ones plus the 3DS default (empty)', () => {
    // Faces with a following Material line carry it; faces with none (e.g. all of `tunneli`) keep the
    // default '' exactly as READASC.C leaves material index 0.
    const mats = new Set<string>();
    for (const m of scene.meshes) for (const f of m.faces) mats.add(f.material);
    expect([...mats].sort()).toEqual(['', 'BLUEMETAL', 'CYANMETAL', 'GRAYCEMENT', 'GREENGRASS']);
  });

  it('leaves the whole `tunneli` mesh at the default material (it declares none)', () => {
    const t = scene.meshes.find((m) => m.name === 'tunneli');
    expect(t?.faces.length).toBe(36);
    expect(t?.faces.every((f) => f.material === '')).toBe(true);
  });

  it('totals 610 vertices and 796 faces across all meshes', () => {
    const vtot = scene.meshes.reduce((s, m) => s + m.vertices.length, 0);
    const ftot = scene.meshes.reduce((s, m) => s + m.faces.length, 0);
    expect(vtot).toBe(610);
    expect(ftot).toBe(796);
  });
});
