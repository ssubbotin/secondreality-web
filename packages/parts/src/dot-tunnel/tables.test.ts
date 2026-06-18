import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCircleTable, buildCosit, buildSade, buildSinit } from './tables.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url are fine here without @types/node.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('dot tunnel tables', () => {
  it('buildSinit/buildCosit reproduce SINIT.DAT byte-for-byte (Int16LE: 4097 sinit, 2049 cosit)', () => {
    const dat = fixture('SINIT.DAT');
    const sinit = buildSinit();
    const cosit = buildCosit();
    expect(sinit).toHaveLength(4097);
    expect(cosit).toHaveLength(2049);
    for (let i = 0; i < 4097; i++) expect(sinit[i]).toBe(dat.readInt16LE(i * 2));
    for (let i = 0; i < 2049; i++) expect(cosit[i]).toBe(dat.readInt16LE((4097 + i) * 2));
  });

  it('buildCircleTable reproduces TUNNEL.DAT byte-for-byte (138×64 records of Int16 x, Int16 y)', () => {
    const dat = fixture('TUNNEL.DAT');
    const { x, y } = buildCircleTable();
    expect(x).toHaveLength(138 * 64);
    expect(y).toHaveLength(138 * 64);
    for (let i = 0; i < 138 * 64; i++) {
      expect(x[i]).toBe(dat.readInt16LE(i * 4));
      expect(y[i]).toBe(dat.readInt16LE(i * 4 + 2));
    }
  });

  it('buildSade matches 16384 div (z·7+95)', () => {
    const sade = buildSade();
    expect(sade).toHaveLength(101);
    expect(sade[0]).toBe(172);
    expect(sade[4]).toBe(133);
    expect(sade[80]).toBe(25);
    expect(sade[100]).toBe(20);
  });
});
