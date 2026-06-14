/**
 * The original counted music frames at the VGA mode-X retrace (~70.086 Hz), the cadence the
 * parts' getmframe() thresholds (e.g. GLENZ 300/333) were tuned to.
 */
export const MFRAME_HZ = 70;

/** A part-resettable tick counter derived from song time (deterministic, frame-rate independent). */
export class MframeTrack {
  /** songSeconds at which the counter would read 0. */
  private zeroSong = 0;

  /** dis_setmframe(value): make get(songSeconds) return `value` now. */
  set(songSeconds: number, value = 0): void {
    this.zeroSong = songSeconds - value / MFRAME_HZ;
  }

  /** dis_getmframe(): elapsed ticks since the (re)set, at MFRAME_HZ. */
  get(songSeconds: number): number {
    return Math.round((songSeconds - this.zeroSong) * MFRAME_HZ);
  }
}
