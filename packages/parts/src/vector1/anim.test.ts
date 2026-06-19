import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeAnimation } from './anim.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('vector1 animation decoder (VISU/C/U2A.C)', () => {
  const { frames, resetFrame } = decodeAnimation(fixture('U2A.0AB'));

  it('decodes 521 frames and loops at resetscene (FF FF)', () => {
    // Frames 0..520 each end on an FOV terminator; the bare FF FF after frame 520 is the loop point.
    expect(frames).toHaveLength(521);
    expect(resetFrame).toBe(521);
  });

  it('co[0] is the static camera: constant pose + FOV across the whole track', () => {
    const first = frames[0];
    const last = frames[500];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) return;
    const c0 = first.slots[0];
    expect(c0).toBeDefined();
    if (!c0) return;
    expect([c0.x, c0.y, c0.z]).toEqual([-221, -323, 7088]);
    expect(c0.m).toEqual([-16385, 0, 0, 0, 10, -16384, 0, -16384, -10]);
    expect(first.fov).toBe(0x2200);
    // The camera never moves through the whole flythrough.
    const c500 = last.slots[0];
    if (!c500) return;
    expect([c500.x, c500.y, c500.z]).toEqual([-221, -323, 7088]);
    expect(last.fov).toBe(0x2200);
  });

  it('ship visibility timeline matches the decoded events', () => {
    const onAt = (slot: number) => frames.findIndex((f) => f.slots[slot]?.on);
    expect(onAt(2)).toBe(16); // Sippi appears first
    expect(onAt(1)).toBe(259); // pixel ship + its copies
    expect(onAt(4)).toBe(259);
    expect(onAt(5)).toBe(270);
    // moottori (obj3 -> co[3]) is never switched on in this track.
    expect(frames.some((f) => f.slots[3]?.on)).toBe(false);
  });

  it('Sippi (co[2]) sweeps a large -Y translation past the camera', () => {
    const f16 = frames[16]?.slots[2];
    const fLast = frames[520]?.slots[2];
    expect(f16).toBeDefined();
    expect(fLast).toBeDefined();
    if (!f16 || !fLast) return;
    expect([f16.x, f16.y, f16.z]).toEqual([0, -9178, 318]);
    expect([fLast.x, fLast.y, fLast.z]).toEqual([10, -519890, -1186]);
  });

  it('pixel-ship copies (co[4], co[5]) end at the decoded poses', () => {
    const f = frames[520];
    expect(f).toBeDefined();
    if (!f) return;
    expect([f.slots[4]?.x, f.slots[4]?.y, f.slots[4]?.z]).toEqual([-1118, -55201, -302]);
    expect([f.slots[5]?.x, f.slots[5]?.y, f.slots[5]?.z]).toEqual([-653, -52392, -545]);
    expect(f.slots[5]?.m).toEqual([12999, 0, -9966, 0, 16384, 0, -9966, 0, -12999]);
  });
});
