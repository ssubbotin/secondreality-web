import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildLensPlan, type ExTable, parseExTable } from './displacement.js';
import { makeBackBuffer, SCREEN_PIXELS, warpLens } from './warp.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));
const ex = (name: string): ExTable => parseExTable(new Uint8Array(fixture(name)));

const plan = buildLensPlan(ex('LENS.EX1'), ex('LENS.EX2'), ex('LENS.EX3'), ex('LENS.EX4'));
const back = makeBackBuffer(new Uint8Array(fixture('LENS.U')));

const bandHist = (s: Uint8Array): Record<number, number> => {
  const h: Record<number, number> = { 0: 0, 64: 0, 128: 0, 192: 0 };
  for (const b of s) h[b & 0xc0] = (h[b & 0xc0] ?? 0) + 1;
  return h;
};
const checksum = (s: Uint8Array): number => {
  let sum = 0;
  for (const b of s) sum = (sum + b) % 1000000007;
  return sum;
};

describe('warpLens', () => {
  it('produces the four palette bands with the lens-shape pixel counts (position-invariant)', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    warpLens(out, back, plan, 80, 60);
    expect(bandHist(out)).toEqual({ 0: 54549, 64: 7664, 128: 1544, 192: 243 });
  });

  it('matches the reference render byte-for-byte (sum checksum) at two lens positions', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    warpLens(out, back, plan, 80, 60);
    expect(checksum(out)).toBe(771462);
    expect(out[60 * 320 + 90]).toBe(65);
    expect(out[40 * 320 + 60]).toBe(65);

    warpLens(out, back, plan, 160, 100);
    expect(checksum(out)).toBe(770904);
  });

  it('starts from the background (drawlens overlays a pre-painted screen)', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    // Off-screen lens position leaves the screen as the pure background.
    warpLens(out, back, plan, -400, -400);
    expect(checksum(out)).toBe(checksum(back.subarray(0, SCREEN_PIXELS)));
  });
});
