/**
 * Minimal surface of the libopenmpt Emscripten module we call from the worklet.
 *
 * NOTE — chiptune3@0.8.7 layout findings:
 *
 *  • The package ships NO separate `.wasm` file.  The wasm binary is embedded
 *    verbatim (UTF-8 encoded) inside `libopenmpt.worklet.js` via a custom
 *    `binaryDecode(str)` helper that returns `Uint8Array(code-points)`.
 *    A separately extracted `apps/lab/public/vendor/libopenmpt.wasm` (1 231 KB)
 *    is provided for Task 4's worklet bundle.
 *
 *  • `libopenmpt.worklet.js` is an **ES module** (`export default libopenmpt;`)
 *    containing an **async factory** named `libopenmpt`:
 *      async function libopenmpt(moduleArg = {}): Promise<Module>
 *    The factory accepts `moduleArg.wasmBinary` (standard Emscripten hook) but
 *    ignores it in practice because the wasm is already embedded.
 *
 *  • The chiptune3 AudioWorklet processor (`chiptune3.worklet.js`) uses
 *    `_openmpt_module_read_float_stereo` (separate left / right Float32 pointers),
 *    NOT `_openmpt_module_read_interleaved_float_stereo`.
 *    Both symbols are present in the binary.  Our worklet (Task 3) will use
 *    the interleaved variant listed in this interface, which is also exported.
 *
 *  • `_openmpt_module_get_current_tempo2` IS present in this build.
 */

export interface LibOpenMPT {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  _openmpt_module_create_from_memory(
    data: number,
    size: number,
    logfunc: number,
    loguser: number,
    ctls: number,
  ): number;
  _openmpt_module_destroy(mod: number): void;
  _openmpt_module_set_repeat_count(mod: number, count: number): void;
  _openmpt_module_read_interleaved_float_stereo(
    mod: number,
    samplerate: number,
    count: number,
    interleavedFloatStereo: number,
  ): number;
  _openmpt_module_get_position_seconds(mod: number): number;
  _openmpt_module_get_current_order(mod: number): number;
  _openmpt_module_get_current_row(mod: number): number;
  _openmpt_module_get_current_pattern(mod: number): number;
  _openmpt_module_get_current_tempo2?(mod: number): number;
}

// The vendored glue embeds its own wasm, so wasmBinary is optional (and currently unused).
export type LibOpenMPTFactory = (opts?: { wasmBinary?: ArrayBuffer }) => Promise<LibOpenMPT>;
