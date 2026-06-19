/**
 * Offline bake: combine CITY.ASC (geometry) + U2E.0AB (camera flythrough) + U2E.00M (object index
 * table) + U2E.MAT (materials) into the compact runtime model (model.ts BakedModel). Run with the repo's
 * TypeScript runner; the output is committed so the lab/tests load it without the original assets.
 *
 *   node --experimental-strip-types packages/parts/src/vector2/bake.ts
 *
 * (or via vitest's transform in a test). This is NOT part of CI — it is a one-shot asset converter.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAsc } from './asc.js';
import { baseName, CO_NAMES } from './co-names.js';
import { buildCity } from './geometry.js';
import { parseMaterials } from './material.js';
import type { BakedFrame, BakedMesh, BakedModel } from './model.js';
import { decodeTrack, readSceneIndex } from './track-decode.js';

const here = (n: string) => fileURLToPath(new URL(n, import.meta.url));

export function bake(): BakedModel {
  const asc = parseAsc(readFileSync(here('./__fixtures__/CITY.ASC'), 'latin1'));
  const mats = parseMaterials(readFileSync(here('./__fixtures__/U2E.MAT'), 'latin1'));
  const city = buildCity(asc, mats);

  // Mesh-name → index in the meshes array.
  const meshIndex = new Map<string, number>();
  for (let i = 0; i < city.length; i++) {
    const m = city[i];
    if (m) meshIndex.set(m.name, i);
  }

  // co[] object index → meshes[] index (or -1 when the geometry is not in CITY.ASC).
  const coToMesh: number[] = CO_NAMES.map((n) => {
    if (n === 'CAMERA') return -1;
    const idx = meshIndex.get(baseName(n));
    return idx === undefined ? -1 : idx;
  });

  const { conum } = readSceneIndex(new Uint8Array(readFileSync(here('./__fixtures__/U2E.00M'))));
  const track = decodeTrack(new Uint8Array(readFileSync(here('./__fixtures__/U2E.0AB'))), conum);

  const frames: BakedFrame[] = track.frames.map((f) => {
    // Map each visible co index to a mesh index, dropping the ones with no ASC geometry, de-duplicating
    // so a mesh drawn from two co entries (e.g. a base + a copy at the same place) is filled once.
    const vis = new Set<number>();
    for (const co of f.on) {
      const mi = coToMesh[co] ?? -1;
      if (mi >= 0) vis.add(mi);
    }
    return { m: f.cam.m, x: f.cam.x, y: f.cam.y, z: f.cam.z, vis: [...vis].sort((p, q) => p - q) };
  });

  const meshes: BakedMesh[] = city.map((m) => ({
    name: m.name,
    verts: Array.from(m.verts),
    tris: m.tris.map((t) => ({
      a: t.a,
      b: t.b,
      c: t.c,
      nx: t.nx,
      ny: t.ny,
      nz: t.nz,
      baseColor: t.baseColor,
      shadeBits: t.shadeBits,
      twoSided: t.twoSided,
    })),
  }));

  return {
    fov: track.frames[0]?.fov ?? 0x1c00,
    window: [0, 319, 25, 174, 512, 9999999],
    meshes,
    frames,
  };
}

/**
 * Write the baked artifacts to the fixture dir and the lab's public models dir. Called by the
 * regeneration test (`bake.test.ts`) so it runs under vitest's node environment; the JSON outputs are
 * committed so the lab/tests never need the original assets.
 */
export function writeBakedArtifacts(): { meshes: number; frames: number; bytes: number } {
  const model = bake();
  const json = JSON.stringify(model);
  writeFileSync(here('./__fixtures__/vector2-model.json'), json);
  writeFileSync(here('../../../../apps/lab/public/models/vector2.json'), json);
  return { meshes: model.meshes.length, frames: model.frames.length, bytes: json.length };
}
