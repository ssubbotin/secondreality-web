import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeLbm } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { blitBackground, composeFrame, stampPhase } from './compose.js';
import { POS_ENTRIES, type PosTable, parsePos, SCREEN_PIXELS } from './pos.js';
import { parseScrolltext, Scroller } from './scrolltext.js';

const hillback = (): Uint8Array =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('./__fixtures__/HILLBACK.LBM', import.meta.url))),
  );
const pos1 = (): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/POS1.DAT', import.meta.url))));
const sci = (): Uint8Array =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('./__fixtures__/OFOREST.SCI', import.meta.url))),
  );

/** Build a tiny synthetic PosTable for the unit tests of stampPhase. */
function fakePos(entries: { dests: number[] }[]): PosTable {
  const count = new Uint16Array(POS_ENTRIES);
  const start = new Uint32Array(POS_ENTRIES);
  const flat: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    count[i] = e.dests.length;
    start[i] = flat.length;
    flat.push(...e.dests);
  }
  return { count, start, dests: Uint16Array.from(flat), total: flat.length };
}

describe('blitBackground', () => {
  it('copies exactly 64000 background bytes into the screen buffer', () => {
    const bg = new Uint8Array(SCREEN_PIXELS).map((_, i) => (i * 7) & 0xff);
    const screen = new Uint8Array(SCREEN_PIXELS);
    blitBackground(screen, bg);
    expect(screen).toEqual(bg);
  });
});

describe('stampPhase (Putrouts additive blit)', () => {
  it('adds the font value to every listed destination', () => {
    const screen = new Uint8Array(8); // offsets 0..7
    screen[2] = 40;
    screen[5] = 10;
    const pos = fakePos([{ dests: [2, 5] }]); // font pixel 0 → offsets 2 and 5
    const font = new Uint8Array(POS_ENTRIES);
    font[0] = 100;
    stampPhase(screen, font, pos);
    expect(screen[2]).toBe(140);
    expect(screen[5]).toBe(110);
  });

  it('skips font pixels with value 0 (no contribution)', () => {
    const screen = new Uint8Array(4);
    screen[1] = 50;
    const pos = fakePos([{ dests: [1] }]);
    const font = new Uint8Array(POS_ENTRIES); // font[0] = 0
    stampPhase(screen, font, pos);
    expect(screen[1]).toBe(50);
  });

  it('skips hidden font pixels (count 0) even when lit', () => {
    const screen = new Uint8Array(4);
    screen[0] = 7;
    const pos = fakePos([{ dests: [] }]);
    const font = new Uint8Array(POS_ENTRIES);
    font[0] = 200;
    stampPhase(screen, font, pos);
    expect(screen[0]).toBe(7);
  });

  it('wraps the additive sum mod 256 (ROUTINES.ASM unsaturated byte add)', () => {
    const screen = new Uint8Array(2);
    screen[0] = 200;
    const pos = fakePos([{ dests: [0] }]);
    const font = new Uint8Array(POS_ENTRIES);
    font[0] = 200; // 200 + 200 = 400 → (400 & 0xff) = 144
    stampPhase(screen, font, pos);
    expect(screen[0]).toBe(144);
  });

  it('matches an 8-bit wrap where a bright background overlaps lit text', () => {
    // Lake-edge highlight (≈126) + biased text (≈134) = 260 → wraps to 4 (dark band), the speckled
    // shimmer the original shows on the rippling water.
    const screen = new Uint8Array(2);
    screen[0] = 126;
    const pos = fakePos([{ dests: [0] }]);
    const font = new Uint8Array(POS_ENTRIES);
    font[0] = 134;
    stampPhase(screen, font, pos);
    expect(screen[0]).toBe(4);
  });
});

describe('composeFrame (HILLBACK background + initial font + POS1)', () => {
  it('reproduces the byte-exact composited screen for the first frame', () => {
    const bg = decodeLbm(hillback()).indices;
    const pos = parsePos(pos1());
    const scroller = new Scroller(parseScrolltext(sci()));
    const screen = new Uint8Array(SCREEN_PIXELS);
    composeFrame(screen, bg, scroller.font, pos);

    // 210 pixels differ from the background on this first composite.
    let changed = 0;
    for (let k = 0; k < SCREEN_PIXELS; k++) if (screen[k] !== bg[k]) changed++;
    expect(changed).toBe(210);

    // Spot-checks computed from the original data (bg + font value, clamped):
    expect(screen[8881]).toBe(158); // first changed offset
    expect(screen[13311]).toBe(175);
    // font idx 133 (value 134) stamps offset 11713 over background 40 → 174
    expect(bg[11713]).toBe(40);
    expect(screen[11713]).toBe(174);
  });
});
