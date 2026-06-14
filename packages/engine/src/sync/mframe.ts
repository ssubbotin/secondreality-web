/**
 * np_zframe (dis_getmframe/dis_setmframe, DIS service BX=9): a free-running counter STMIK
 * increments once per *song tick* (DISINT.ASM:412-425; STMIK `incw _np_zframe` at 0x4357). It is
 * tempo-driven, NOT the 70 Hz VGA retrace — ScreamTracker-3 runs ticks at `BPM * 2/5` Hz (50 Hz at
 * the default 125 BPM). Parts reset it at a sync point (`dis_setmframe(0)`) then busy-wait
 * `dis_getmframe() < N` to time a fixed-length animation in ticks (GLENZ 300/333, TECHNO 2520).
 */

/** ScreamTracker-3 tick rate: ticks per second = BPM * 2/5. */
export function songTicksAt(songSeconds: number, bpm: number): number {
  return Math.floor((songSeconds * bpm * 2) / 5);
}

/** A part-resettable view over the monotonic song-tick counter (deterministic, frame-rate independent). */
export class MframeTrack {
  /** Tick count that get() should report as 0. */
  private base = 0;

  /** dis_setmframe(value): make get() read `value` at the current tick count. */
  set(currentTicks: number, value = 0): void {
    this.base = currentTicks - value;
  }

  /** dis_getmframe(): ticks elapsed since the (re)set. */
  get(currentTicks: number): number {
    return currentTicks - this.base;
  }
}
