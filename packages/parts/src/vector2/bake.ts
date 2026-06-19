/**
 * Offline bake: combine the VISU compiled-object chunks (U2E.001..042) + U2E.0AB (camera + per-object
 * animation) + U2E.00M (object index table) into the compact runtime model (model.ts BakedModel). This is
 * the SAME load U2E.C's `main` does — `vis_loadobject` for each numbered chunk via the .00M index, then the
 * .0AB stream replay — but baked offline so the lab/tests never need the original assets.
 *
 *   node --experimental-strip-types packages/parts/src/vector2/bake.ts
 *
 * (or via vitest's transform in a test). NOT part of CI — it is a one-shot asset converter; the JSON
 * outputs are committed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BakedFrame, BakedMesh, BakedModel, BakedObject } from './model.js';
import { type ChunkObject, F_2SIDE, parseChunkObject, shadeBitsFromFlags } from './object-chunk.js';
import { decodeTrack, readSceneIndex } from './track-decode.js';

const here = (n: string) => fileURLToPath(new URL(n, import.meta.url));

/** Triangulate a convex polygon ring (fan from v[0]) into [a,b,c] index triples. */
function triangulate(ring: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  const a = ring[0] ?? 0;
  for (let i = 1; i + 1 < ring.length; i++) {
    out.push([a, ring[i] ?? 0, ring[i + 1] ?? 0]);
  }
  return out;
}

/** Convert one parsed chunk object into a runtime mesh (object-local verts, stored normals, tris). */
function toMesh(o: ChunkObject): BakedMesh {
  const verts: number[] = [];
  for (const v of o.vertices) verts.push(v.x, v.y, v.z);
  const normals: number[] = [];
  for (const n of o.normals) normals.push(n.x, n.y, n.z);
  const tris: BakedMesh['tris'] = [];
  for (const f of o.faces) {
    const shadeBits = shadeBitsFromFlags(f.flags);
    const twoSided = (f.flags & F_2SIDE) !== 0;
    for (const [a, b, c] of triangulate(f.v)) {
      tris.push({ a, b, c, n: f.normal, baseColor: f.color, shadeBits, twoSided });
    }
  }
  return { name: o.name, verts, normals, tris, centerVertex: o.centerVertex };
}

export function bake(): BakedModel {
  // Read the .00M index: conum + each co slot's numbered-file index (co[0]=camera, dups reuse a file).
  const { conum, indices } = readSceneIndex(
    new Uint8Array(readFileSync(here('./__fixtures__/U2E.00M'))),
  );

  // Load each distinct numbered chunk once (vis_loadobject), keyed by its file index.
  const chunkCache = new Map<number, ChunkObject>();
  const meshes: BakedMesh[] = [];
  const fileToMesh = new Map<number, number>();
  for (let c = 1; c < conum; c++) {
    const e = indices[c] ?? 0;
    if (fileToMesh.has(e)) continue;
    let chunk = chunkCache.get(e);
    if (!chunk) {
      const fn = `U2E.${String(e).padStart(3, '0')}`;
      chunk = parseChunkObject(new Uint8Array(readFileSync(here(`./__fixtures__/${fn}`))));
      chunkCache.set(e, chunk);
    }
    fileToMesh.set(e, meshes.length);
    meshes.push(toMesh(chunk));
  }

  // co[] slot → mesh index + the leading-`_` far-sort flag (U2E.C: name[1]=='_' → dist=1e9).
  const coMesh: number[] = [];
  const coFar: boolean[] = [];
  for (let c = 0; c < conum; c++) {
    if (c === 0) {
      coMesh.push(-1); // camera
      coFar.push(false);
      continue;
    }
    const e = indices[c] ?? 0;
    coMesh.push(fileToMesh.get(e) ?? -1);
    const name = chunkCache.get(e)?.name ?? '';
    coFar.push(name[1] === '_'); // names carry surrounding quotes, so name[1] is the first real char.
  }

  const track = decodeTrack(new Uint8Array(readFileSync(here('./__fixtures__/U2E.0AB'))), conum);

  const frames: BakedFrame[] = track.frames.map((f) => {
    const objects: BakedObject[] = [];
    for (const ox of f.objects) {
      const mesh = coMesh[ox.co] ?? -1;
      if (mesh < 0) continue;
      objects.push({
        mesh,
        m: ox.m,
        x: ox.x,
        y: ox.y,
        z: ox.z,
        far: coFar[ox.co] ?? false,
        co: ox.co,
      });
    }
    return { m: f.cam.m, x: f.cam.x, y: f.cam.y, z: f.cam.z, objects };
  });

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
