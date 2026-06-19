import { describe, expect, it } from 'vitest';
import { REVEAL_PICTURES } from './lbm.js';
import {
  CLOSE_FRAMES,
  flashAt,
  HOLD_FRAMES,
  PICTURE_SPAN,
  REVEAL_FRAMES,
  TIMELINE_FRAMES,
} from './reveal.js';

describe('flashAt (the picture-flash timeline)', () => {
  it('starts on the first picture mid-reveal at frame 0 (step 0, black)', () => {
    const s = flashAt(0);
    expect(s.pictureIndex).toBe(0);
    expect(s.picture).toBe(REVEAL_PICTURES[0]);
    expect(s.phase).toBe('reveal');
    expect(s.revealStep).toBe(0);
  });

  it('reaches full reveal (step 128) at the end of the reveal phase', () => {
    const s = flashAt(REVEAL_FRAMES - 1);
    expect(s.phase).toBe('reveal');
    expect(s.revealStep).toBe(128);
  });

  it('holds at full after the reveal', () => {
    const s = flashAt(REVEAL_FRAMES);
    expect(s.phase).toBe('hold');
    expect(s.revealStep).toBe(128);
    expect(s.closeStep).toBe(0);
  });

  it('enters the closing fade after the hold (closeStep ramps 0..63)', () => {
    const start = REVEAL_FRAMES + HOLD_FRAMES;
    expect(flashAt(start).phase).toBe('close');
    expect(flashAt(start).closeStep).toBe(0);
    expect(flashAt(start + 63).closeStep).toBe(63);
  });

  it('advances to the next picture after a full span', () => {
    const s = flashAt(PICTURE_SPAN);
    expect(s.pictureIndex).toBe(1);
    expect(s.picture).toBe(REVEAL_PICTURES[1]);
    expect(s.phase).toBe('reveal');
    expect(s.revealStep).toBe(0);
  });

  it('cycles through all four pictures', () => {
    for (let i = 0; i < REVEAL_PICTURES.length; i++) {
      expect(flashAt(i * PICTURE_SPAN).pictureIndex).toBe(i);
    }
  });

  it('loops the whole timeline and handles negative frames', () => {
    expect(flashAt(TIMELINE_FRAMES)).toEqual(flashAt(0));
    expect(flashAt(-PICTURE_SPAN)).toEqual(flashAt(TIMELINE_FRAMES - PICTURE_SPAN));
  });

  it('PICTURE_SPAN/TIMELINE_FRAMES are the sum of the phase lengths', () => {
    expect(PICTURE_SPAN).toBe(REVEAL_FRAMES + HOLD_FRAMES + CLOSE_FRAMES);
    expect(TIMELINE_FRAMES).toBe(REVEAL_PICTURES.length * PICTURE_SPAN);
  });
});
