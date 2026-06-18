import { NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { buildPaletteLut } from './palette-lut.js';

describe('buildPaletteLut', () => {
  it('builds a 256x1 sRGB RGBA LUT from an 8-bit palette', () => {
    // index 0 black, index 1 = (4, 8, 12), index 255 = (200, 164, 132)
    const pal = new Uint8Array(256 * 3);
    pal[3] = 4;
    pal[4] = 8;
    pal[5] = 12;
    pal[255 * 3] = 200;
    pal[255 * 3 + 1] = 164;
    pal[255 * 3 + 2] = 132;

    const tex = buildPaletteLut(pal);
    expect(tex.image.width).toBe(256);
    expect(tex.image.height).toBe(1);
    expect(tex.format).toBe(RGBAFormat);
    expect(tex.colorSpace).toBe(SRGBColorSpace);
    expect(tex.magFilter).toBe(NearestFilter);
    expect(tex.minFilter).toBe(NearestFilter);

    const data = tex.image.data as Uint8Array;
    // index 0
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 255]);
    // index 1
    expect([data[4], data[5], data[6], data[7]]).toEqual([4, 8, 12, 255]);
    // index 255
    const o = 255 * 4;
    expect([data[o], data[o + 1], data[o + 2], data[o + 3]]).toEqual([200, 164, 132, 255]);
    tex.dispose();
  });
});
