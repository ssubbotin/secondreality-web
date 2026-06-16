import { computeZplusTable } from '../sync/order-markers.js';
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
  private _zplusTable: Int8Array | null = null;
  private _currentModuleUrl: string | null = null;
  private setupPromise: Promise<void> | null = null;

  constructor(private readonly opts: AudioEngineOptions) {}

  /**
   * Must be called from a user-gesture handler (autoplay policy). Idempotent: the heavy setup runs
   * once and is memoized, so concurrent callers (e.g. a part switch during init) await the same
   * promise and never observe a half-built node. Re-anchors the context on every call.
   */
  async start(): Promise<void> {
    this.setupPromise ??= this.setup();
    await this.setupPromise;
    await this.ctx?.resume();
  }

  private async setup(): Promise<void> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this._currentModuleUrl = this.opts.moduleUrl;
    await ctx.audioWorklet.addModule(this.opts.workletUrl);

    // libopenmpt's wasm is embedded in the worklet bundle; we only fetch the module.
    // The shipped MUSIC*.S3M are Future Crew's original STMIK files, whose pattern bodies are
    // obfuscated — de-obfuscate them into a standard S3M before libopenmpt parses (see stmik-module).
    const raw = await fetch(this.opts.moduleUrl).then((r) => r.arrayBuffer());
    const deob = deobfuscateS3M(raw);
    this._zplusTable = computeZplusTable(deob); // build before the buffer is handed to the worklet
    const moduleData = deob.buffer;

    const node = new AudioWorkletNode(ctx, 'sr-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { moduleData, startSeconds: this.opts.startSeconds ?? 0 },
    });
    this.node = node;

    // One handler for position reports + the worklet's one-shot `ready`. Set inside the Promise
    // executor (runs synchronously) so `resolve` is captured without a non-null assertion.
    const ready = new Promise<void>((resolve) => {
      node.port.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string } & Partial<PositionReport>;
        if (m.type === 'pos') this.clock.update(m as PositionReport);
        else if (m.type === 'ready') resolve();
      };
    });

    node.connect(ctx.destination);
    await ctx.resume();
    // Wait until libopenmpt has initialised in the worklet, so a loadModule/seek right after start()
    // can't no-op against a not-yet-ready player. (The MessagePort queues `ready` until onmessage is set.)
    await ready;

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

  /** Where in the track playback currently is, by module URL (null until started). */
  get currentModuleUrl(): string | null {
    return this._currentModuleUrl;
  }

  /**
   * Swap the playing module without tearing down the AudioContext (so no new user gesture is
   * needed). Fetches + de-obfuscates the new module, recomputes the zplus table, and hands the bytes
   * to the live worklet. No-op until {@link start} has created the worklet node.
   */
  async loadModule(moduleUrl: string, startSeconds: number): Promise<void> {
    if (!this.node) return;
    const raw = await fetch(moduleUrl).then((r) => r.arrayBuffer());
    const deob = deobfuscateS3M(raw);
    this._zplusTable = computeZplusTable(deob);
    this._currentModuleUrl = moduleUrl;
    this.node.port.postMessage({ type: 'loadModule', moduleData: deob.buffer, startSeconds });
  }

  /** Per-order np_zplus from the loaded module's +++ markers; null until start() decodes the module. */
  get zplusTable(): Int8Array | null {
    return this._zplusTable;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }
}
