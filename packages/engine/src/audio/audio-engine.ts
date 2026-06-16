import { AudioClock, type ClockSample, type PositionReport } from './clock.js';
import { deobfuscateS3M } from './stmik-module.js';

export interface AudioEngineOptions {
  workletUrl: string; // e.g. '/worklets/player-worklet.js'
  moduleUrl: string; // e.g. '/music/MUSIC0.S3M'
  /** Where in the track this part starts (seconds). Each part has its own position in the song. */
  startSeconds?: number;
}

export class AudioEngine {
  readonly clock = new AudioClock();
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private started = false;

  constructor(private readonly opts: AudioEngineOptions) {}

  /** Must be called from a user-gesture handler (autoplay policy). Idempotent. */
  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    this.started = true;

    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(this.opts.workletUrl);

    // libopenmpt's wasm is embedded in the worklet bundle; we only fetch the module.
    // The shipped MUSIC*.S3M are Future Crew's original STMIK files, whose pattern bodies are
    // obfuscated — de-obfuscate them into a standard S3M before libopenmpt parses (see stmik-module).
    const raw = await fetch(this.opts.moduleUrl).then((r) => r.arrayBuffer());
    const moduleData = deobfuscateS3M(raw).buffer;

    const node = new AudioWorkletNode(ctx, 'sr-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { moduleData, startSeconds: this.opts.startSeconds ?? 0 },
    });
    this.node = node;

    node.port.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string } & Partial<PositionReport>;
      if (m.type === 'pos') {
        this.clock.update(m as PositionReport);
      }
    };

    node.connect(ctx.destination);
    await ctx.resume();

    // Re-anchor hard when returning from a backgrounded tab.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void ctx.resume();
    });
  }

  /** Sample the clock for the current audio time. Call once per frame. */
  sample(): ClockSample {
    if (!this.ctx) return { songSeconds: 0, order: 0, row: 0, pattern: 0, bpm: 0 };
    this.clock.outputLatency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.clock.sampleAt(this.ctx.currentTime);
  }

  setAvOffset(seconds: number): void {
    this.clock.avOffset = seconds;
  }

  /** Jump the track to `seconds` (the clock re-anchors on the next worklet position report). */
  seek(seconds: number): void {
    this.node?.port.postMessage({ type: 'seek', seconds });
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }
}
