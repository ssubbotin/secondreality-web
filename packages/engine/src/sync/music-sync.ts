import type { ClockSample } from '../audio/clock.js';
import type { MusicClock } from '../types.js';
import type { MarkerTable } from './marker-table.js';
import { MframeTrack } from './mframe.js';
import { reconstructSync } from './reconstruct.js';

/** Wraps a marker table + mframe state and produces the full four-channel MusicClock. */
export class MusicSync {
  private readonly mframe = new MframeTrack();

  constructor(private readonly table: MarkerTable) {}

  /** dis_setmframe: reset/seed the music-frame counter (called by effects, e.g. GLENZ). */
  setMframe(songSeconds: number, value = 0): void {
    this.mframe.set(songSeconds, value);
  }

  /** Turn the base audio clock into the full MusicClock the demo reads. */
  resolve(base: ClockSample): MusicClock {
    const { muscode, musplus, musrow } = reconstructSync(this.table, base.order, base.row);
    return {
      muscode,
      musplus,
      musrow,
      mframe: this.mframe.get(base.songSeconds),
      songSeconds: base.songSeconds,
      order: base.order,
      pattern: base.pattern,
      bpm: base.bpm,
    };
  }
}
