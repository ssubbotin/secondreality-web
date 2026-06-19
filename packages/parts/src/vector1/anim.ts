// Decoder for the baked U2A animation stream (VISU/C/U2A.C main loop). The converter wrote a compact byte
// stream of per-frame, per-object matrix/position *deltas* plus FOV and on/off toggles; the player walks
// one frame's worth of opcodes each tick, accumulating the deltas into each object's r0 matrix. We port
// the decoder verbatim so the choreography is exact to the integer, then expose the full per-frame state
// of all object slots for both the CPU and three.js renderers.

import { type RMatrix, zeroMatrix } from './fixed.js';

/** One animated object slot (co[] in U2A.C). co[0] is the camera; co[1..] are meshes. */
export interface AnimSlot {
  /** The accumulating relative matrix (r0): rotation deltas in m[], translation in x/y/z. */
  r0: RMatrix;
  /** Whether the slot is currently switched on (drawn). */
  on: boolean;
}

/** A decoded single frame: a deep snapshot of every slot plus the frame's FOV. */
export interface AnimFrame {
  fov: number;
  slots: { m: number[]; x: number; y: number; z: number; on: boolean }[];
}

/** lsget (U2A.C): read a variable-width signed delta selected by the low 2 bits of `f`. */
class StreamReader {
  i = 0;
  constructor(readonly d: Uint8Array) {}
  private u8(): number {
    const v = this.d[this.i] ?? 0;
    this.i++;
    return v;
  }
  private s8v(v: number): number {
    return v >= 0x80 ? v - 0x100 : v;
  }
  lsget(f: number): number {
    switch (f & 3) {
      case 0:
        return 0;
      case 1:
        return this.s8v(this.u8());
      case 2: {
        const lo = this.u8();
        const hi = this.u8();
        return lo | (this.s8v(hi) << 8);
      }
      default: {
        const b0 = this.u8();
        const b1 = this.u8();
        const b2 = this.u8();
        const b3 = this.u8();
        return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
      }
    }
  }
  byte(): number {
    return this.u8();
  }
  get done(): boolean {
    return this.i >= this.d.length;
  }
}

export interface DecodeResult {
  frames: AnimFrame[];
  /** The frame index at which the stream issued resetscene (FF FF) — the loop point. */
  resetFrame: number;
}

const SLOT_COUNT = 16;

function snapshot(slots: AnimSlot[], fov: number): AnimFrame {
  return {
    fov,
    slots: slots.map((s) => ({ m: [...s.r0.m], x: s.r0.x, y: s.r0.y, z: s.r0.z, on: s.on })),
  };
}

/**
 * Decode the whole stream into a per-frame list of slot snapshots. Reproduces U2A.C's per-frame parse loop
 * exactly: each frame reads opcodes until an FOV byte (0x00..0x7f after 0xff) terminates the frame, or
 * FF FF triggers resetscene (loop). Opcode `a`:
 *   - 0xff then b<=0x7f: fov = b<<8, end frame.
 *   - 0xff then 0xff: resetscene (stop; loop point).
 *   - (a&0xc0)==0xc0: high object-number nibble; the next byte is the real opcode.
 *   - onum = (onum & 0xff0) | (a & 0xf).
 *   - a&0xc0: 0x80 = switch on, 0x40 = switch off.
 *   - a&0x30 selects how many pflag bytes follow (0/1/2/3).
 *   - pflag low 6 bits drive 3 lsget translation deltas (2 bits each); bit 6 = word matrix; bits 7..15
 *     each enable one of 9 matrix-element deltas (byte or word per bit 6).
 */
export function decodeAnimation(data: Uint8Array | ArrayBuffer): DecodeResult {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  const r = new StreamReader(d);
  const slots: AnimSlot[] = Array.from({ length: SLOT_COUNT }, () => ({ r0: zeroMatrix(), on: false }));
  const frames: AnimFrame[] = [];
  let fov = 0;
  let resetFrame = -1;

  while (!r.done) {
    let onum = 0;
    let endFrame = false;
    let reset = false;
    for (;;) {
      if (r.done) {
        endFrame = true;
        break;
      }
      let a = r.byte();
      if (a === 0xff) {
        a = r.byte();
        if (a <= 0x7f) {
          fov = a << 8;
          break;
        }
        if (a === 0xff) {
          reset = true;
          break;
        }
      }
      if ((a & 0xc0) === 0xc0) {
        onum = (a & 0x3f) << 4;
        a = r.byte();
      }
      onum = (onum & 0xff0) | (a & 0xf);
      const slot = slots[onum & (SLOT_COUNT - 1)];
      if (!slot) continue;
      if ((a & 0xc0) === 0x80) slot.on = true;
      else if ((a & 0xc0) === 0x40) slot.on = false;

      let pflag = 0;
      switch (a & 0x30) {
        case 0x10:
          pflag = r.byte();
          break;
        case 0x20:
          pflag = r.byte() | (r.byte() << 8);
          break;
        case 0x30:
          pflag = r.byte() | (r.byte() << 8) | (r.byte() << 16);
          break;
        default:
          pflag = 0;
      }

      const rr = slot.r0;
      rr.x += r.lsget(pflag);
      rr.y += r.lsget(pflag >> 2);
      rr.z += r.lsget(pflag >> 4);
      const wordMatrix = (pflag & 0x40) !== 0;
      for (let b = 0; b < 9; b++) {
        if (pflag & (0x80 << b)) {
          const prev = rr.m[b] ?? 0;
          rr.m[b] = prev + r.lsget(wordMatrix ? 2 : 1);
        }
      }
    }

    if (reset) {
      resetFrame = frames.length;
      break;
    }
    frames.push(snapshot(slots, fov));
    if (endFrame && r.done) break;
  }

  return { frames, resetFrame };
}
