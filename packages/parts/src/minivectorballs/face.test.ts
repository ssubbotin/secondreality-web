import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FACE_TERMINATOR, parseFaceInc } from './face.js';

const fixtureText = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

describe('parseFaceInc — FACE.C → FACE.INC vertex data', () => {
  it('reproduces the shipped FACE.INC vertices byte-for-byte and appends the ASM.ASM terminator', () => {
    const v = parseFaceInc(fixtureText('FACE.INC'));
    // FACE.INC ships exactly one vertex; ASM.ASM appends `dw 30000,30000,30000` after the include.
    expect(Array.from(v)).toEqual([2248, -2306, 0, 30000, 30000, 30000]);
  });

  it('the appended sentinel is the documented 30000,30000,30000 terminator', () => {
    const v = parseFaceInc(fixtureText('FACE.INC'));
    const last3 = Array.from(v.slice(v.length - 3));
    expect(last3).toEqual(FACE_TERMINATOR);
  });

  it('parses multiple lines, negative values, and the FACE.C ×1000-scaled / axis-swapped int output', () => {
    // Synthetic FACE.INC-shaped input: FACE.C prints `dw (int)(x*1000),-(int)(z*1000),(int)(y*1000)`.
    const v = parseFaceInc('dw 1000,-2000,3000\r\ndw -42,0,7\r\n');
    expect(Array.from(v)).toEqual([1000, -2000, 3000, -42, 0, 7, ...FACE_TERMINATOR]);
  });

  it('ignores blank lines and assembler directives that are not `dw`', () => {
    const v = parseFaceInc('; a comment\n_face LABEL WORD\n\ndw 5,6,7\n');
    expect(Array.from(v)).toEqual([5, 6, 7, ...FACE_TERMINATOR]);
  });
});
