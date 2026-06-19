/**
 * Animation byte-stream decoder, ported verbatim from U2E.C's playback loop (VISU/C/U2E.C, the inner
 * `while(repeat--)` / `while(!xit)` parser). The compiled `.0AB` stream applies per-object delta-encoded
 * rmatrix updates and on/off toggles, one screen-frame per `0xff <fov>` marker. Object 0 is the camera.
 *
 * Stream grammar (per byte `a`, U2E.C lines 449-538):
 *   0xff 0x00..0x7f  → set fov = a<<8 and END this frame.
 *   0xff 0xff        → end of stream (resetscene + xit).
 *   0xff (other)     → ignored (continue).
 *   (a&0xc0)==0xc0   → high object bits: onum = (a&0x3f)<<4, then read next byte as `a`.
 *   onum = (onum & 0xff0) | (a & 0xf)
 *   (a&0xc0): 0x80 → object on ; 0x40 → object off.
 *   (a&0x30): 0x10/0x20/0x30 → read 1/2/3 pflag bytes (else pflag=0).
 *   x += lsget(pflag); y += lsget(pflag>>2); z += lsget(pflag>>4)   (each &3 selects 0/1/2/4 bytes)
 *   if(pflag&0x40) word matrix else byte matrix: for b in 0..8, if pflag&(0x80<<b): m[b] += lsget(2 or 1).
 */

export const CAMERA_INDEX = 0;

/** A decoded per-frame snapshot: the camera matrix (rmatrix) plus the visible object index list. */
export interface TrackFrame {
  /** Camera rmatrix: m[0..8] (16.14 fixed) + position x,y,z. */
  cam: { m: number[]; x: number; y: number; z: number };
  /** Indices (1-based into the co[] table) of objects enabled this frame. */
  on: number[];
  /** Field-of-view angle in effect this frame (0..65535; U2E holds 0x1C00 throughout). */
  fov: number;
}

export interface DecodedTrack {
  frames: TrackFrame[];
  /** Final accumulated rmatrix per object index (for objects that move; most stay identity). */
  objectMatrices: { m: number[]; x: number; y: number; z: number }[];
  conum: number;
}

class Reader {
  pos = 0;
  constructor(readonly data: Uint8Array) {}
  u8(): number {
    const v = this.data[this.pos] ?? 0;
    this.pos++;
    return v;
  }
  /** lsget(f) (U2E.C): f&3 selects byte count 0/1/2/4, sign-extending the top byte. */
  lsget(f: number): number {
    switch (f & 3) {
      case 0:
        return 0;
      case 1: {
        const b = this.u8();
        return b >= 0x80 ? b - 0x100 : b;
      }
      case 2: {
        const lo = this.u8();
        const hi = this.u8();
        const v = lo | (hi << 8);
        return hi >= 0x80 ? v - 0x10000 : v;
      }
      default: {
        // case 3: four bytes, signed 32-bit.
        const b0 = this.u8();
        const b1 = this.u8();
        const b2 = this.u8();
        const b3 = this.u8();
        const v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
        return v >= 0x80000000 ? v - 0x100000000 : v;
      }
    }
  }
}

/**
 * Decode the full `.0AB` stream into per-frame camera + visibility. `conum` is the object count from the
 * `.00M` index table (58 for U2E); the matrices accumulate as the stream replays, exactly as U2E.C does.
 * `maxFrames` guards against a runaway stream.
 */
export function decodeTrack(data: Uint8Array, conum: number, maxFrames = 8000): DecodedTrack {
  const r = new Reader(data);
  const matrices = Array.from({ length: conum }, () => ({
    m: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    x: 0,
    y: 0,
    z: 0,
  }));
  const on = new Array<boolean>(conum).fill(false);
  const frames: TrackFrame[] = [];
  let fov = 40 << 8;
  let frame = 0;
  let xit = false;

  while (!xit && frame < maxFrames && r.pos < data.length) {
    let onum = 0;
    // Parse one frame's worth of updates until a fov marker or stream end.
    for (;;) {
      let a = r.u8();
      if (a === 0xff) {
        a = r.u8();
        if (a <= 0x7f) {
          fov = a << 8;
          break;
        }
        if (a === 0xff) {
          xit = true;
          break;
        }
        continue;
      }
      if ((a & 0xc0) === 0xc0) {
        onum = (a & 0x3f) << 4;
        a = r.u8();
      }
      onum = (onum & 0xff0) | (a & 0xf);
      if ((a & 0xc0) === 0x80) on[onum] = true;
      else if ((a & 0xc0) === 0x40) on[onum] = false;

      const mat = matrices[onum];
      if (!mat) {
        // out-of-range object index — abort like U2E.C's `return(3)`.
        xit = true;
        break;
      }
      let pflag = 0;
      switch (a & 0x30) {
        case 0x10:
          pflag |= r.u8();
          break;
        case 0x20:
          pflag |= r.u8();
          pflag |= r.u8() << 8;
          break;
        case 0x30:
          pflag |= r.u8();
          pflag |= r.u8() << 8;
          pflag |= r.u8() << 16;
          break;
        default:
          break;
      }
      mat.x += r.lsget(pflag);
      mat.y += r.lsget(pflag >> 2);
      mat.z += r.lsget(pflag >> 4);
      if (pflag & 0x40) {
        for (let b = 0; b < 9; b++)
          if (pflag & (0x80 << b)) mat.m[b] = (mat.m[b] ?? 0) + r.lsget(2);
      } else {
        for (let b = 0; b < 9; b++)
          if (pflag & (0x80 << b)) mat.m[b] = (mat.m[b] ?? 0) + r.lsget(1);
      }
    }
    if (xit) break;
    const cam = matrices[CAMERA_INDEX] ?? { m: [], x: 0, y: 0, z: 0 };
    frames.push({
      cam: { m: cam.m.slice(), x: cam.x, y: cam.y, z: cam.z },
      on: collectOn(on),
      fov,
    });
    frame++;
  }

  return {
    frames,
    objectMatrices: matrices.map((mm) => ({ m: mm.m.slice(), x: mm.x, y: mm.y, z: mm.z })),
    conum,
  };
}

function collectOn(on: boolean[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < on.length; i++) if (on[i]) out.push(i);
  return out;
}

/** Read the `.00M` object index table: returns `conum` and the per-co numbered-file index (co[0]=camera). */
export function readSceneIndex(data: Uint8Array): { conum: number; indices: number[] } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const off = dv.getInt32(4, true);
  const conum = dv.getUint16(off, true);
  const indices: number[] = [0]; // co[0] = camera
  for (let c = 1; c < conum; c++) indices.push(dv.getInt16(off + 2 + (c - 1) * 2, true));
  return { conum, indices };
}
