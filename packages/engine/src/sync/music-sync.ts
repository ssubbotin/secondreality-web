import type { ClockSample } from '../audio/clock.js';
import type { MusicClock } from '../types.js';
import { MframeTrack, songTicksAt } from './mframe.js';
import { reconstructSync } from './reconstruct.js';

/** Turns the base audio clock (live order/row/bpm from libopenmpt) into the full four-channel MusicClock. */
export class MusicSync {
  private readonly mframe = new MframeTrack();
  /** Song-tick count from the most recent resolve(), so dis_setmframe can anchor to "now". */
  private lastTicks = 0;
  /** Per-order np_zplus from the module's +++ markers; null until the audio engine supplies it. */
  private zplusTable: Int8Array | null = null;

  /** Inject the per-order zplus table (from the audio engine, once the module is decoded). */
  setZplusTable(table: Int8Array | null): void {
    this.zplusTable = table;
  }

  /** dis_setmframe: reset/seed the music-frame counter to `value` at the current song position. */
  setMframe(value = 0): void {
    this.mframe.set(this.lastTicks, value);
  }

  /** Turn the base audio clock into the full MusicClock the demo reads. */
  resolve(base: ClockSample): MusicClock {
    // Phase musplus by the live order's zplus; before the table loads, fall back to reconstructSync's
    // bracketed-section default (no behaviour change during the brief pre-load window).
    const zplus = this.zplusTable ? (this.zplusTable[base.order] ?? 0) : undefined;
    const { muscode, musplus, musrow } = reconstructSync(base.row, zplus);
    this.lastTicks = songTicksAt(base.songSeconds, base.bpm);
    return {
      muscode,
      musplus,
      musrow,
      mframe: this.mframe.get(this.lastTicks),
      songSeconds: base.songSeconds,
      order: base.order,
      pattern: base.pattern,
      bpm: base.bpm,
    };
  }
}
