/** A position report from the audio worklet (one per few quanta). */
export interface PositionReport {
  /** libopenmpt playback position in seconds at this report. */
  songSeconds: number;
  /** AudioContext time the reported audio is scheduled at (the worklet's `currentTime`). */
  contextTime: number;
  order: number;
  row: number;
  pattern: number;
  bpm: number;
}

/** The linear-extrapolation anchor: songSeconds known at a given context time. */
export interface Anchor {
  songSeconds: number;
  contextTime: number;
}

/** What the demo reads each frame (the four-channel Zxx fields are added in Plan 03). */
export interface ClockSample {
  songSeconds: number;
  order: number;
  row: number;
  pattern: number;
  bpm: number;
}

/** Pure extrapolation: the context plays in real time, so slope is 1. */
export function songSecondsAt(
  anchor: Anchor,
  now: number,
  outputLatency: number,
  avOffset: number,
): number {
  return anchor.songSeconds + (now - anchor.contextTime) - outputLatency + avOffset;
}

/**
 * Holds the latest worklet report and extrapolates between reports. Re-anchoring every
 * report keeps extrapolation windows tiny (a few ms), so drift and loop-wrap self-correct.
 */
export class AudioClock {
  private report: PositionReport | null = null;
  private lastValue = 0;
  /** Output latency in seconds; set from the AudioContext by the engine. */
  outputLatency = 0;
  /**
   * User-tunable A/V offset in seconds (Safari reports outputLatency 0 — let users nudge).
   * Positive values advance the demo relative to the audio.
   */
  avOffset = 0;

  update(report: PositionReport): void {
    this.report = report;
    // A fresh report is authoritative — reset the monotonic guard so loop wraps are allowed.
    this.lastValue = report.songSeconds;
  }

  sampleAt(now: number): ClockSample {
    if (!this.report) {
      return { songSeconds: 0, order: 0, row: 0, pattern: 0, bpm: 0 };
    }
    // PositionReport is structurally an Anchor (songSeconds + contextTime) — pass it
    // directly to avoid allocating an Anchor literal on every rAF frame.
    const raw = songSecondsAt(this.report, now, this.outputLatency, this.avOffset);
    // Monotonic within an anchor (don't let frame-time jitter rewind the demo).
    this.lastValue = Math.max(this.lastValue, raw);
    return {
      songSeconds: this.lastValue,
      order: this.report.order,
      row: this.report.row,
      pattern: this.report.pattern,
      bpm: this.report.bpm,
    };
  }
}
