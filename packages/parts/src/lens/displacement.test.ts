import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildLensPlan,
  type ExTable,
  LENS_YMAX,
  type PlotPass,
  parseExTable,
} from './displacement.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url are fine here without @types/node.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const ex = (name: string): ExTable => parseExTable(new Uint8Array(fixture(name)));

describe('parseExTable', () => {
  it('decodes the int16-LE header (ymax pairs) and rd[] words for LENS.EX1', () => {
    const t = ex('LENS.EX1');
    expect(t.rowBeg).toHaveLength(LENS_YMAX);
    expect(t.rowCnt).toHaveLength(LENS_YMAX);
    // first six rows are empty (rowbeg = ymax*4 = 480, cnt = 0)
    for (let y = 0; y < 6; y++) {
      expect(t.rowBeg[y]).toBe(480);
      expect(t.rowCnt[y]).toBe(0);
    }
    // first non-empty row of EX1 is y=8, cnt=17, start-x=69, first dest-deltas as captured
    expect(t.rowCnt[8]).toBe(17);
    expect(t.wordAt(8, 0)).toBe(69);
    expect([t.wordAt(8, 1), t.wordAt(8, 2), t.wordAt(8, 3)]).toEqual([-640, -319, -638]);
  });

  it('decodes the pair-stream tables (EX2/EX3) and the core table (EX4)', () => {
    const ex2 = ex('LENS.EX2');
    expect(ex2.rowCnt[8]).toBe(17); // 17 (src,dest) pairs
    expect(ex2.wordAt(8, 0)).toBe(69); // start-x
    expect([ex2.wordAt(8, 1), ex2.wordAt(8, 2)]).toEqual([0, -640]); // first (src,dest) pair

    const ex3 = ex('LENS.EX3');
    expect(ex3.rowCnt[17]).toBe(2);
    expect(ex3.wordAt(17, 0)).toBe(109);

    const ex4 = ex('LENS.EX4');
    expect(ex4.rowCnt[0]).toBe(21);
    expect(ex4.wordAt(0, 0)).toBe(0); // col4 header word is always 0
    expect(ex4.wordAt(0, 1)).toBe(68); // first screen offset
  });
});

describe('buildLensPlan', () => {
  it('flattens the four passes into per-row ops with the correct band flags', () => {
    const plan = buildLensPlan(ex('LENS.EX1'), ex('LENS.EX2'), ex('LENS.EX3'), ex('LENS.EX4'));
    // The plan groups ops by lens row; only rows that any pass touches carry ops.
    expect(plan.rows).toHaveLength(LENS_YMAX);

    // dorow (col1) is skipped when cnt < 4 (ASM.ASM: cmp cx,4 / jge). All EX1 rows have cnt 0 or >= 4.
    // Row 8: EX1 dorow emits 17 consecutive-destination ops with band flag 0x40.
    const row8 = plan.rows[8] ?? { ops: [] };
    const col1 = row8.ops.filter((o: { pass: PlotPass }) => o.pass === 'col1');
    expect(col1).toHaveLength(17);
    expect(col1.every((o) => o.flag === 0x40)).toBe(true);

    // col4 ops carry flag 0 and copy the background straight through (src === dst).
    const row0 = plan.rows[0] ?? { ops: [] };
    const col4 = row0.ops.filter((o: { pass: PlotPass }) => o.pass === 'col4');
    expect(col4).toHaveLength(21);
    expect(col4.every((o) => o.flag === 0 && o.src === o.dst)).toBe(true);
  });

  it('reports the lens bounding box used by drawlens (LENSHIG rows)', () => {
    const plan = buildLensPlan(ex('LENS.EX1'), ex('LENS.EX2'), ex('LENS.EX3'), ex('LENS.EX4'));
    expect(plan.lensHig).toBe(116);
  });
});
