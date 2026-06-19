import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bake, writeBakedArtifacts } from './bake.js';

const committed = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./__fixtures__/vector2-model.json', import.meta.url)),
    'utf8',
  ),
);

describe('bake (CITY.ASC + U2E.0AB + U2E.00M + U2E.MAT → BakedModel)', () => {
  const model = bake();

  it('produces 25 city meshes, 796 triangles, and the 1801-frame flythrough', () => {
    expect(model.meshes.length).toBe(25);
    expect(model.meshes.reduce((s, m) => s + m.tris.length, 0)).toBe(796);
    expect(model.frames.length).toBe(1801);
    expect(model.fov).toBe(0x1c00);
    expect(model.window).toEqual([0, 319, 25, 174, 512, 9999999]);
  });

  it('maps animation object visibility onto the ASC meshes (frame 0 shows kulmatalot)', () => {
    const kulma = model.meshes.findIndex((m) => m.name === 'kulmatalot');
    expect(model.frames[0]?.vis).toContain(kulma);
  });

  it('the committed fixture matches a fresh bake (regeneration is deterministic)', () => {
    // Regenerate and confirm the committed artifact is byte-identical, so the lab JSON stays in sync.
    const fresh = writeBakedArtifacts();
    expect(fresh.meshes).toBe(committed.meshes.length);
    expect(fresh.frames).toBe(committed.frames.length);
    expect(JSON.stringify(model)).toBe(JSON.stringify(committed));
  });
});
