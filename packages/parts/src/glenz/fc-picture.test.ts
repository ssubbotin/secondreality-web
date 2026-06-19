import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeFcPicture, fcBackground, fcBackpal } from './fc-picture.js';
import { SCREEN_H, SCREEN_W } from './glenz-fill.js';

const fcBytes = (): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/FC.UH', import.meta.url))));

describe('decodeFcPicture — byte-exact raw "Uh1" FC backdrop decode (GLENZ/FC.UH)', () => {
  it('reads the header dimensions and the full 320x200 index plane', () => {
    const d = fcBytes();
    const pic = decodeFcPicture(d);
    expect(pic.width).toBe(320);
    expect(pic.height).toBe(200);
    expect(pic.indices).toHaveLength(320 * 200);
    expect(pic.palette6).toHaveLength(256 * 3);
  });

  it('palette is the 768-byte 6-bit VGA table at offset 16, verbatim', () => {
    const d = fcBytes();
    const pic = decodeFcPicture(d);
    // The whole palette must equal the on-disk bytes 16..16+768.
    expect(Array.from(pic.palette6)).toEqual(Array.from(d.subarray(16, 16 + 768)));
    // Spot-check known entries: index 0 is black, index 1 is the dark FC purple.
    expect([pic.palette6[0], pic.palette6[1], pic.palette6[2]]).toEqual([0, 0, 0]);
    expect([pic.palette6[3], pic.palette6[4], pic.palette6[5]]).toEqual([13, 9, 13]);
  });

  it('index plane is the raw bytes at offset 16+768, verbatim', () => {
    const d = fcBytes();
    const pic = decodeFcPicture(d);
    const pix = d.subarray(16 + 768, 16 + 768 + 320 * 200);
    expect(Array.from(pic.indices)).toEqual(Array.from(pix));
    // Known sample pixels (top-row-first ordering).
    expect(pic.indices[0]).toBe(0); // top-left black border
    expect(pic.indices[100 * 320 + 160]).toBe(5); // interior of the logo
    expect(pic.indices[320 * 200 - 1]).toBe(0); // bottom-right black border
  });

  it('only uses the 16-colour background ramp indices the FC picture defines', () => {
    const pic = decodeFcPicture(fcBytes());
    const used = new Set(pic.indices);
    for (const v of used) expect(v).toBeLessThan(16);
    expect([...used].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14]);
  });
});

describe('fcBackpal — the 16-colour ramp MAIN.C copies into backpal (fc[a*3+0x10])', () => {
  it('is the first 16 palette entries of the picture', () => {
    const pic = decodeFcPicture(fcBytes());
    const bp = fcBackpal(pic);
    expect(bp).toHaveLength(16 * 3);
    expect(Array.from(bp)).toEqual(Array.from(pic.palette6.subarray(0, 16 * 3)));
  });
});

describe('fcBackground — the bgpic the additive glenz fill ORs over', () => {
  it('is a 320x200 index buffer equal to the picture (FC.UH is exactly the field size)', () => {
    const pic = decodeFcPicture(fcBytes());
    const bg = fcBackground(pic);
    expect(bg).toHaveLength(SCREEN_W * SCREEN_H);
    expect(Array.from(bg)).toEqual(Array.from(pic.indices));
  });

  it('centres a smaller picture inside the field, leaving a zero border', () => {
    // Synthetic 2x2 picture of index 9 — centred in 320x200 it lands at the middle, border stays 0.
    const pic = {
      width: 2,
      height: 2,
      indices: new Uint8Array([9, 9, 9, 9]),
      palette6: new Uint8Array(768),
    };
    const bg = fcBackground(pic);
    const xOff = (SCREEN_W - 2) >> 1;
    const yOff = (SCREEN_H - 2) >> 1;
    expect(bg[yOff * SCREEN_W + xOff]).toBe(9);
    expect(bg[0]).toBe(0); // border untouched
  });
});
