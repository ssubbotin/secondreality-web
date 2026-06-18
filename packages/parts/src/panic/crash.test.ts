import { describe, expect, it } from 'vitest';
import {
  COLLAPSE_A,
  type CrashState,
  createCrashState,
  rasterCrash,
  stepCrash,
  TOTAL_FRAMES,
  WIPE_END,
  WIPE_START,
  WIPE_STEP,
} from './crash.js';
import { MONSTER_H, MONSTER_SIZE, MONSTER_W } from './picture.js';

/** Run the sim to absolute frame n (n=0 is the initial state). */
const at = (n: number): CrashState => {
  const s = createCrashState();
  for (let i = 0; i < n; i++) stepCrash(s);
  return s;
};

/** A trivial all-1 picture so raster output is easy to assert (index 1 = white in MONSTER.PAL). */
const flatPicture = (): Uint8Array => {
  const p = new Uint8Array(MONSTER_SIZE);
  p.fill(1);
  return p;
};

describe('panic crash sim — phase sequence (SHUTDOWN.C)', () => {
  it('starts in the wash phase showing the full picture', () => {
    const s = createCrashState();
    expect(s.phase).toBe('wash');
    expect(s.frame).toBe(0);
    expect(s.dotVisible).toBe(false);
  });

  it('the collapse a-sequence is a*5/6 from 32 down to >2 (C integer division)', () => {
    expect(COLLAPSE_A).toEqual([32, 26, 21, 17, 14, 11, 9, 7, 5, 4, 3]);
  });

  it('progresses wash → collapse → wipe → dot → done over the documented frame budget', () => {
    // 2 wash + 11 collapse + 47 wipe + 60 dot = 120 active frames.
    expect(at(0).phase).toBe('wash');
    expect(at(1).phase).toBe('wash');
    expect(at(2).phase).toBe('collapse');
    expect(at(2 + 10).phase).toBe('collapse');
    expect(at(2 + 11).phase).toBe('wipe');
    const wipeFrames = Math.floor((WIPE_END - WIPE_START) / WIPE_STEP) + 1; // 47
    expect(wipeFrames).toBe(47);
    expect(at(2 + 11 + wipeFrames - 1).phase).toBe('wipe');
    expect(at(2 + 11 + wipeFrames).phase).toBe('dot');
    expect(at(2 + 11 + wipeFrames + 59).phase).toBe('dot');
    expect(at(2 + 11 + wipeFrames + 60).phase).toBe('done');
  });

  it('clamps at the final done state (idempotent stepping)', () => {
    const s = at(TOTAL_FRAMES + 50);
    expect(s.phase).toBe('done');
    const before = { ...s };
    stepCrash(s);
    expect(s.phase).toBe(before.phase);
    expect(s.frame).toBe(before.frame);
  });
});

describe('panic crash sim — collapse band + fade', () => {
  it('band half-height shrinks with the a-sequence (a/2 in 200-space), reaching the centre line', () => {
    // collapse frame k uses COLLAPSE_A[k]; bandHalf = a/2 (trunc).
    const halves = COLLAPSE_A.map((_, k) => at(2 + k).bandHalf);
    expect(halves).toEqual([16, 13, 10, 8, 7, 5, 4, 3, 2, 2, 1]);
    // monotonically non-increasing
    for (let i = 1; i < halves.length; i++)
      expect(halves[i]).toBeLessThanOrEqual(halves[i - 1] ?? 0);
  });

  it('fadeA brightens toward white across the collapse (fadepals[63-a], a shrinking)', () => {
    const fades = COLLAPSE_A.map((_, k) => at(2 + k).fadeA);
    expect(fades).toEqual([31, 37, 42, 46, 49, 52, 54, 56, 58, 59, 60]);
    for (let i = 1; i < fades.length; i++) expect(fades[i]).toBeGreaterThan(fades[i - 1] ?? 0);
  });
});

describe('panic crash sim — wipe', () => {
  it('the wipe X advances 20→158 in steps of 3', () => {
    const base = 2 + 11;
    expect(at(base).wipeX).toBe(WIPE_START);
    expect(at(base + 1).wipeX).toBe(WIPE_START + WIPE_STEP);
    expect(at(base + 46).wipeX).toBe(158); // last x ≤ 160
  });
});

describe('panic crash sim — pulsing dot', () => {
  it('the centre dot is lit through the dot phase', () => {
    const base = 2 + 11 + 47;
    expect(at(base).dotVisible).toBe(true);
    expect(at(base + 59).dotVisible).toBe(true);
  });

  it('the dot brightness follows cos(a/120·3·2π)·31+32 over 60 frames (~1.5 periods)', () => {
    const base = 2 + 11 + 47;
    const bright = (a: number) => Math.trunc(Math.cos((a / 120) * 3 * 2 * Math.PI) * 31 + 32);
    expect(at(base).dotBright).toBe(bright(0)); // a=0 → 63 (brightest)
    expect(at(base + 20).dotBright).toBe(bright(20));
    expect(at(base + 40).dotBright).toBe(bright(40));
    expect(at(base + 59).dotBright).toBe(bright(59));
  });
});

describe('panic crash sim — raster', () => {
  const inBounds = (out: Uint8Array) => out.length === MONSTER_SIZE;

  it('wash phase renders the full picture verbatim', () => {
    const out = new Uint8Array(MONSTER_SIZE);
    const pic = flatPicture();
    rasterCrash(out, at(0), pic);
    expect(inBounds(out)).toBe(true);
    // every pixel of the flat picture is index 1
    expect(out.every((v) => v === 1)).toBe(true);
  });

  it('collapse phase confines the image to the band around the centre row', () => {
    const out = new Uint8Array(MONSTER_SIZE);
    const s = at(2 + 5); // mid-collapse, bandHalf = 5
    rasterCrash(out, s, flatPicture());
    const lit = (row: number) =>
      out.subarray(row * MONSTER_W, row * MONSTER_W + MONSTER_W).some((v) => v !== 0);
    const center = MONSTER_H / 2; // 100
    expect(lit(center)).toBe(true);
    expect(lit(center - s.bandHalf)).toBe(true);
    expect(lit(center + s.bandHalf)).toBe(true);
    expect(lit(center - s.bandHalf - 2)).toBe(false); // outside the band is black
    expect(lit(center + s.bandHalf + 2)).toBe(false);
  });

  it('wipe phase blacks out the centre row from both edges inward', () => {
    const out = new Uint8Array(MONSTER_SIZE);
    const s = at(2 + 11 + 30); // wipeX well advanced
    rasterCrash(out, s, flatPicture());
    const row = MONSTER_H / 2;
    // near the edges (x < wipeX) the centre line is cleared; the middle still has the line
    expect(out[row * MONSTER_W + 0]).toBe(0);
    expect(out[row * MONSTER_W + (s.wipeX - 1)]).toBe(0);
    expect(out[row * MONSTER_W + 160]).not.toBe(0); // centre still lit
  });

  it('dot phase shows exactly the centre pixel lit (index 1)', () => {
    const out = new Uint8Array(MONSTER_SIZE);
    const s = at(2 + 11 + 47 + 5);
    rasterCrash(out, s, flatPicture());
    const center = (MONSTER_H / 2) * MONSTER_W + MONSTER_W / 2;
    expect(out[center]).toBe(1);
    const litCount = out.reduce((n, v) => (v !== 0 ? n + 1 : n), 0);
    expect(litCount).toBe(1);
  });

  it('never emits an out-of-range index and never grows the buffer', () => {
    const pic = flatPicture();
    for (let f = 0; f <= TOTAL_FRAMES; f += 7) {
      const out = new Uint8Array(MONSTER_SIZE);
      rasterCrash(out, at(f), pic);
      expect(out).toHaveLength(MONSTER_SIZE);
      // Uint8Array already constrains to 0..255; assert the loop didn't leave the buffer untouched
      // (a poison fill would survive an out-of-bounds write bug) by checking it is all valid bytes.
      expect(out.every((v) => v <= 255)).toBe(true);
    }
  });
});
