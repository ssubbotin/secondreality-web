/**
 * Parser for the VISU compiled-object format — the numbered binary chunks `U2E.003..042` (plus .001/.002)
 * that the original loaded with `vis_loadobject` (VISU/VISU.C). The toolchain's converter (OPT.C + SAVE.C)
 * baked each 3D-Studio mesh into a sequence of `TAG`(4 ASCII bytes) + `len`(int32 LE) chunk headers, each
 * followed by `len` bytes of body (padded to a multiple of 4 by SAVE.C's `endblock`). Chunks: VERS, NAME,
 * VERT, NORM, POLY, ORD0, ORDE(×8), END.
 *
 * CRITICAL (Turbo-C `#pragma pack(1)`, CD.H): every `int` is 16-bit, every `long` 32-bit. `vlist` is 16
 * bytes (long x,y,z; int normal; int reserved); `nlist` is 8 (int x,y,z; int reserved). The polydata record
 * (CD.H, written by OPT.C `facedata[]=pvnum|flags; =color; =nrm; =vertex…`) is: byte sides, byte flags
 * (upper byte of the material flags — F_FLIP / F_2SIDE / F_SHADE / F_GOURAUD), byte color, byte reserved,
 * word normal index, then `sides` word vertex indices.
 *
 * This is the SAME geometry the readable `CITY.ASC` export was compiled from, but it includes the dense
 * final-scene objects the ASC export lacks (the FC `logo`, `fcirto*`, `talot03..05`, cars, signs). We keep
 * what the CPU rasteriser needs: object-local integer vertices, the stored face normals (already the
 * negated, UNIT-length Newell normals OPT.C computed), faces with their base colour + shade/2-sided flags,
 * and the ORD0 centre vertex used as the painter-sort key. The per-direction sort-lists ORDE are skipped.
 */

import { shadeBitsForLen } from './material.js';

/** Visu object face/material flag bits (CD.H, stored as the upper byte → here the low bits of the byte). */
export const F_FLIP = 0x01; // F_FLIP   (0x0100 >> 8)
export const F_2SIDE = 0x02; // F_2SIDE  (0x0200 >> 8)
export const F_SHADE8 = 0x04; // F_SHADE8 (0x0400 >> 8)
export const F_SHADE16 = 0x08; // F_SHADE16(0x0800 >> 8)
export const F_SHADE32 = 0x0c; // F_SHADE32(0x0C00 >> 8)
export const F_GOURAUD = 0x10; // F_GOURAUD(0x1000 >> 8)
export const F_SHADE_MASK = 0x0c;

/** A model vertex: object-local integer position + its per-vertex (gouraud) normal index. */
export interface ChunkVertex {
  x: number;
  y: number;
  z: number;
  normal: number;
}

/** A flat polygon face: vertex ring, stored face-normal index, base palette colour and flag byte. */
export interface ChunkFace {
  /** Vertex indices into `vertices` (CCW as authored). */
  v: number[];
  /** Index into `normals` (the stored face normal, used for culling + flat shade). */
  normal: number;
  /** Base palette colour (first colour of the material's fade ramp). */
  color: number;
  /** Face flag byte: F_FLIP / F_2SIDE / F_SHADE / F_GOURAUD. */
  flags: number;
}

export interface ChunkObject {
  /** NAME chunk, verbatim (includes the surrounding quotes the toolchain wrote). */
  name: string;
  vertices: ChunkVertex[];
  /** Stored normals (16-bit, length UNIT). normals[0..nnum1) are face normals, the rest gouraud. */
  normals: { x: number; y: number; z: number }[];
  /** Count of basic (face) normals. */
  nnum1: number;
  faces: ChunkFace[];
  /** ORD0[1] — the centre vertex index, the object's distance-sort key (U2E.C `o->pl[0][1]`). */
  centerVertex: number;
}

function readI16(d: Uint8Array, o: number): number {
  const v = (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function readU16(d: Uint8Array, o: number): number {
  return (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8);
}

function readI32(d: Uint8Array, o: number): number {
  // Reconstruct a signed 32-bit value (vertex coords reach +/- a hundred thousand, e.g. the logo).
  const v =
    (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8) | ((d[o + 2] ?? 0) << 16) | ((d[o + 3] ?? 0) << 24);
  return v | 0;
}

function tag(d: Uint8Array, o: number): string {
  return String.fromCharCode(d[o] ?? 0, d[o + 1] ?? 0, d[o + 2] ?? 0, d[o + 3] ?? 0);
}

/**
 * Parse a VISU compiled object from its raw bytes. Mirrors vis_loadobject's chunk walk (TAG + int32
 * length), reading `int` as 16-bit. Throws on an unknown chunk so the fixture tests catch format drift.
 */
export function parseChunkObject(data: Uint8Array | ArrayBuffer): ChunkObject {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  let name = '';
  let vertices: ChunkVertex[] = [];
  const normals: { x: number; y: number; z: number }[] = [];
  let nnum1 = 0;
  let polyBody = -1;
  let pl0Body = -1;

  let pos = 0;
  while (pos + 8 <= d.length) {
    const t = tag(d, pos);
    const len = readI32(d, pos + 4);
    const body = pos + 8;
    if (t === 'END ') break;
    if (t === 'NAME') {
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = d[body + i] ?? 0;
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      name = s;
    } else if (t === 'VERT') {
      const vnum = readI16(d, body);
      let vp = body + 4; // GINT vnum, GINT reserved
      vertices = new Array<ChunkVertex>(vnum);
      for (let i = 0; i < vnum; i++) {
        vertices[i] = {
          x: readI32(d, vp),
          y: readI32(d, vp + 4),
          z: readI32(d, vp + 8),
          normal: readU16(d, vp + 12),
        };
        vp += 16;
      }
    } else if (t === 'NORM') {
      const nnum = readI16(d, body);
      nnum1 = readI16(d, body + 2);
      let np = body + 4;
      for (let i = 0; i < nnum; i++) {
        normals.push({ x: readI16(d, np), y: readI16(d, np + 2), z: readI16(d, np + 4) });
        np += 8;
      }
    } else if (t === 'POLY') {
      polyBody = body;
    } else if (t.startsWith('ORD')) {
      // ORD0 = unsorted list (the only one we use); ORDE = precomputed direction lists (skipped).
      if (t[3] === '0') pl0Body = body;
    } else if (t === 'VERS') {
      // version word — ignored
    } else {
      throw new Error(`parseChunkObject: unknown chunk '${t}' at ${pos}`);
    }
    pos = body + len;
  }

  if (polyBody < 0 || pl0Body < 0) {
    throw new Error('parseChunkObject: missing POLY or ORD0 chunk');
  }

  // Walk ORD0: word count, centre vertex, then a 0-terminated list of polygon byte-offsets into polydata.
  const centerVertex = readU16(d, pl0Body + 2);
  const faces: ChunkFace[] = [];
  let off = pl0Body + 4;
  for (;;) {
    const p = readU16(d, off);
    if (p === 0) break;
    off += 2;
    const rec = polyBody + p;
    const sides = d[rec] ?? 0;
    const flags = d[rec + 1] ?? 0;
    const color = d[rec + 2] ?? 0;
    const normal = readU16(d, rec + 4);
    const v: number[] = new Array<number>(sides);
    for (let k = 0; k < sides; k++) v[k] = readU16(d, rec + 6 + 2 * k);
    faces.push({ v, normal, color, flags });
  }

  return { name, vertices, normals, nnum1, faces, centerVertex };
}

/** Map a face flag byte to the ADRAW `calclight` shift (3/4/5) or 0 when the material is unshaded. */
export function shadeBitsFromFlags(flags: number): number {
  switch (flags & F_SHADE_MASK) {
    case F_SHADE32:
      return shadeBitsForLen(32); // 3
    case F_SHADE16:
      return shadeBitsForLen(16); // 4
    case F_SHADE8:
      return shadeBitsForLen(8); // 5
    default:
      return 0; // L1 / unshaded → flat base colour
  }
}
