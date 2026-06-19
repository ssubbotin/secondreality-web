import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeTrack, readSceneIndex } from './track-decode.js';

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))),
  );
}

describe('readSceneIndex on U2E.00M', () => {
  const { conum, indices } = readSceneIndex(fixture('U2E.00M'));

  it('reads conum = 58 (camera + 57 objects)', () => {
    expect(conum).toBe(58);
  });

  it('maps the first co entries to their numbered-file indices', () => {
    // co[1]→.001, co[2]→.002, ... with duplicate entries reusing earlier files near the end.
    expect(indices.slice(1, 5)).toEqual([1, 2, 3, 4]);
    expect(indices[43]).toBe(9); // Tree01g copy
    expect(indices[57]).toBe(32); // fcirto01 copy
  });
});

describe('decodeTrack on U2E.0AB', () => {
  const { conum } = readSceneIndex(fixture('U2E.00M'));
  const track = decodeTrack(fixture('U2E.0AB'), conum);

  it('decodes exactly 1801 frames and consumes the whole stream', () => {
    expect(track.frames.length).toBe(1801);
  });

  it('holds the FOV at 0x1C00 (7168) for the entire flythrough', () => {
    expect(track.frames.every((f) => f.fov === 0x1c00)).toBe(true);
  });

  it('reproduces the camera position trajectory (first frames, verbatim)', () => {
    const f0 = track.frames[0];
    expect([f0?.cam.x, f0?.cam.y, f0?.cam.z]).toEqual([46712, 1346, -2151]);
    const f1 = track.frames[1];
    expect([f1?.cam.x, f1?.cam.y, f1?.cam.z]).toEqual([46712, 1231, 388]);
    const f4 = track.frames[4];
    expect([f4?.cam.x, f4?.cam.y, f4?.cam.z]).toEqual([46088, 972, 6672]);
  });

  it('ends at the recorded final camera matrix + position', () => {
    const last = track.frames[track.frames.length - 1];
    expect([last?.cam.x, last?.cam.y, last?.cam.z]).toEqual([76297, -28448, 95565]);
    expect(last?.cam.m).toEqual([15561, -5124, 135, -4522, -13928, -7350, 2413, 6943, -14643]);
  });

  it('streams object visibility (kulmatalot on at frame 0; logo alone at the end)', () => {
    expect(track.frames[0]?.on).toEqual([21]);
    expect(track.frames[track.frames.length - 1]?.on).toEqual([23]);
  });

  it('snapshots each enabled object`s accumulated matrix per frame (in `on` order)', () => {
    const f0 = track.frames[0];
    expect(f0?.objects.map((o) => o.co)).toEqual(f0?.on);
    const kulma = f0?.objects[0]; // kulmatalot (co 21) is static at frame 0 → identity, zero position.
    expect(kulma?.m).toEqual([16384, 0, 0, 0, 16384, 0, 0, 0, 16384]);
    expect([kulma?.x, kulma?.y, kulma?.z]).toEqual([0, 0, 0]);
  });

  it('decodes per-object animation: BuildingH (co 2) enters rotated + translated at frame 601', () => {
    // BuildingH is off through frame 600, then enabled at 601 already carrying a rotation (m != identity)
    // and a translation off origin — the rotating building of the final scene.
    expect(track.frames[600]?.objects.some((o) => o.co === 2)).toBe(false);
    const bh = track.frames[601]?.objects.find((o) => o.co === 2);
    expect(bh).toBeDefined();
    expect(bh?.m).toEqual([14670, -7295, 0, 7295, 14670, 0, 0, 0, 16384]);
    expect([bh?.x, bh?.y, bh?.z]).toEqual([-7130, -5279, 101]);
  });
});
