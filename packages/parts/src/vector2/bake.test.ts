import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bake, writeBakedArtifacts } from './bake.js';
import type { BakedModel } from './model.js';

const committed: BakedModel = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./__fixtures__/vector2-model.json', import.meta.url)),
    'utf8',
  ),
);

describe('bake (U2E.001..042 chunks + U2E.0AB + U2E.00M → BakedModel)', () => {
  const model = bake();

  it('loads the 42 distinct object meshes and the 1801-frame flythrough', () => {
    // 57 co slots map to 42 distinct numbered chunk files (the rest are duplicate references).
    expect(model.meshes.length).toBe(42);
    expect(model.frames.length).toBe(1801);
    expect(model.fov).toBe(0x1c00);
    expect(model.window).toEqual([0, 319, 25, 174, 512, 9999999]);
  });

  it('triangulates every polygon (1973 triangles across the city)', () => {
    expect(model.meshes.reduce((s, m) => s + m.tris.length, 0)).toBe(1973);
  });

  it('includes the dense final-scene objects the ASC export lacked', () => {
    const names = model.meshes.map((m) => m.name);
    expect(names).toContain('"logo"'); // the FC-logo finale
    expect(names).toContain('"fcirto"');
    expect(names).toContain('"talot03"');
    expect(names).toContain('"talot04"');
    expect(names).toContain('"talot05"');
    expect(names).toContain('"Car02"');
  });

  it('shows kulmatalot at frame 0 and the logo alone at the finale', () => {
    const kulma = model.meshes.findIndex((m) => m.name === '"kulmatalot"');
    const logo = model.meshes.findIndex((m) => m.name === '"logo"');
    expect(model.frames[0]?.objects.some((o) => o.mesh === kulma)).toBe(true);
    const last = model.frames[model.frames.length - 1];
    expect(last?.objects).toHaveLength(1);
    expect(last?.objects[0]?.mesh).toBe(logo);
  });

  it('tags the leading-_ ground/platform objects as far-sorted', () => {
    // co[1] = "_platform" → far; co[2] = "BuildingH" → not far.
    const farMesh = model.meshes.findIndex((m) => m.name === '"_platform"');
    const nearMesh = model.meshes.findIndex((m) => m.name === '"BuildingH"');
    let sawFar = false;
    let sawNear = false;
    for (const f of model.frames) {
      for (const o of f.objects) {
        if (o.mesh === farMesh) {
          expect(o.far).toBe(true);
          sawFar = true;
        }
        if (o.mesh === nearMesh) {
          expect(o.far).toBe(false);
          sawNear = true;
        }
      }
    }
    expect(sawFar).toBe(true);
    expect(sawNear).toBe(true);
  });

  it('the committed fixture matches a fresh bake (regeneration is deterministic)', () => {
    const fresh = writeBakedArtifacts();
    expect(fresh.meshes).toBe(committed.meshes.length);
    expect(fresh.frames).toBe(committed.frames.length);
    expect(JSON.stringify(model)).toBe(JSON.stringify(committed));
  });
});
