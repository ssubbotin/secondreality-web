import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MONSTER_H, MONSTER_SIZE, MONSTER_W, parsePicture } from './picture.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('panic picture (MONSTER.U)', () => {
  const raw = new Uint8Array(fixture('MONSTER.U'));

  it('is a raw 320×200 8-bit index buffer (64000 bytes)', () => {
    expect(MONSTER_W).toBe(320);
    expect(MONSTER_H).toBe(200);
    expect(MONSTER_SIZE).toBe(64000);
    expect(raw).toHaveLength(MONSTER_SIZE);
  });

  it('parsePicture returns the indices byte-for-byte', () => {
    const pic = parsePicture(raw);
    expect(pic).toHaveLength(MONSTER_SIZE);
    expect(Buffer.from(pic).equals(raw.subarray(0, MONSTER_SIZE))).toBe(true);
  });

  it('index 0 dominates (the black background) — over a quarter of the buffer', () => {
    const pic = parsePicture(raw);
    let zeros = 0;
    for (const v of pic) if (v === 0) zeros++;
    expect(zeros).toBeGreaterThan(MONSTER_SIZE / 4); // background is the most common index
  });

  it('rejects a short buffer', () => {
    expect(() => parsePicture(new Uint8Array(100))).toThrow();
  });
});
