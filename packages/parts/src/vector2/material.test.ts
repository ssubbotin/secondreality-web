import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMaterials, shadeBitsForLen } from './material.js';

const MAT = readFileSync(
  fileURLToPath(new URL('./__fixtures__/U2E.MAT', import.meta.url)),
  'latin1',
);

describe('parseMaterials on U2E.MAT', () => {
  const mats = parseMaterials(MAT);

  it('maps the city materials to their base palette index and ramp length', () => {
    expect(mats.get('GRAYCEMENT')).toMatchObject({ color: 16, colorlen: 16 });
    expect(mats.get('BLUEMETAL')).toMatchObject({ color: 64, colorlen: 32 });
    expect(mats.get('CYANMETAL')).toMatchObject({ color: 192, colorlen: 32 });
    expect(mats.get('GREENGRASS')).toMatchObject({ color: 32, colorlen: 32, gouraud: true });
  });

  it('parses the DEFAULT material (base 0, ramp 32)', () => {
    expect(mats.get('DEFAULT')).toMatchObject({ color: 0, colorlen: 32 });
  });

  it('derives shadeBits 3/4/5 for ramp 32/16/8 and 0 for unshaded', () => {
    expect(shadeBitsForLen(32)).toBe(3);
    expect(shadeBitsForLen(16)).toBe(4);
    expect(shadeBitsForLen(8)).toBe(5);
    expect(shadeBitsForLen(1)).toBe(0);
  });

  it('flags gouraud (G) and two-sided (X) materials', () => {
    expect(mats.get('FCG')?.gouraud).toBe(true);
    expect(mats.get('FC')?.gouraud).toBe(false);
  });
});
