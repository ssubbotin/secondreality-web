import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseScrollText } from './scrolltext.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const scroll = parseScrollText(fixture('ENDSCROL.TXT'));

describe('parseScrollText (ENDSCROL.TXT)', () => {
  it('splits the CRLF file into 119 newline segments', () => {
    expect(scroll.lines.length).toBe(119);
  });

  it('keeps the first line verbatim (with the trailing CR)', () => {
    expect(scroll.lines[0]).toBe('Lerto has coded this hilariously fantastic\r');
  });

  it('preserves the font-test lines used to exercise the glyph sheet', () => {
    expect(scroll.lines[30]).toBe('abcdefghijklmnopqrstuvwxyz\r');
    expect(scroll.lines[31]).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ\r');
    expect(scroll.lines[32]).toBe('1234567890!?;:-,.=+\r');
  });

  it('keeps the dashed separator line with its leading tabs', () => {
    expect(scroll.lines[21]).toBe('\t\t-     -     -\r');
  });

  it('has 24 lines with printable content (the rest are blank scroll spacing)', () => {
    const nonBlank = scroll.lines.filter((l) => l.trim().length > 0);
    expect(nonBlank.length).toBe(24);
  });
});
