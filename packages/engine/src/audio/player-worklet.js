// Prepended at build time (Task 4) with the libopenmpt Emscripten glue, which defines the
// global factory `libopenmpt`. No imports allowed in an AudioWorklet module.

const QUANTUM = 128; // Web Audio render quantum
const REPORT_EVERY = 4; // post position ~every 4 quanta (~11.6ms @ 44.1k)

class SRPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { moduleData, startSeconds } = options.processorOptions;
    this.ready = false;
    this.mod = 0;
    this.lib = null;
    this.bufPtr = 0;
    this.quantaSinceReport = 0;

    // Runtime seek: `{ type: 'seek', seconds }` jumps the playback position (each part starts the
    // track at its own offset; the host can also re-seek live).
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'seek') this.seek(e.data.seconds);
    };

    // libopenmpt's wasm is embedded in the prepended glue — no wasmBinary needed.
    // eslint-disable-next-line no-undef
    libopenmpt({}).then((lib) => {
      this.lib = lib;
      const bytes = new Uint8Array(moduleData);
      const dataPtr = lib._malloc(bytes.length);
      lib.HEAPU8.set(bytes, dataPtr);
      this.mod = lib._openmpt_module_create_from_memory(dataPtr, bytes.length, 0, 0, 0);
      lib._free(dataPtr);
      lib._openmpt_module_set_repeat_count(this.mod, -1); // loop forever
      if (startSeconds) this.seek(startSeconds); // start this part at its position in the track
      this.bufPtr = lib._malloc(QUANTUM * 2 * 4); // interleaved stereo float32
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    });
  }

  /** Jump to `seconds` in the module (libopenmpt clamps to the song length). */
  seek(seconds) {
    if (this.mod && this.lib?._openmpt_module_set_position_seconds) {
      this.lib._openmpt_module_set_position_seconds(this.mod, seconds);
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] ?? out[0];
    if (!this.ready) {
      left.fill(0);
      if (right !== left) right.fill(0);
      return true;
    }

    const lib = this.lib;
    const frames = lib._openmpt_module_read_interleaved_float_stereo(
      this.mod,
      sampleRate, // global in AudioWorkletGlobalScope
      QUANTUM,
      this.bufPtr,
    );

    const heap = lib.HEAPF32;
    const base = this.bufPtr >> 2;
    for (let i = 0; i < QUANTUM; i++) {
      if (i < frames) {
        left[i] = heap[base + i * 2];
        right[i] = heap[base + i * 2 + 1];
      } else {
        left[i] = 0;
        right[i] = 0;
      }
    }

    if (++this.quantaSinceReport >= REPORT_EVERY) {
      this.quantaSinceReport = 0;
      this.port.postMessage({
        type: 'pos',
        songSeconds: lib._openmpt_module_get_position_seconds(this.mod),
        contextTime: currentTime, // global: scheduled time of this quantum
        order: lib._openmpt_module_get_current_order(this.mod),
        row: lib._openmpt_module_get_current_row(this.mod),
        pattern: lib._openmpt_module_get_current_pattern(this.mod),
        bpm: lib._openmpt_module_get_current_tempo2
          ? lib._openmpt_module_get_current_tempo2(this.mod)
          : 0,
      });
    }
    return true;
  }
}

registerProcessor('sr-player', SRPlayer);
