// Parser for the VISU engine object format (VISU/VISU.C vis_loadobject). The converter (c.exe) baked each
// 3D-Studio mesh into a chunked binary: a sequence of `TAG`(4 ASCII bytes) + `len`(int32 LE) headers,
// each followed by `len` bytes of body. Chunks seen in the U2A ships: VERS, NAME, VERT, NORM, POLY, ORD0,
// ORDE (x8). CRITICAL: all `int` fields are 16-bit (DOS Turbo-C `int`), all `long` 32-bit; vlist is 16
// bytes packed, nlist 8. We keep only what the renderer needs (vertices, face normals, faces with their
// base colour) — the precomputed direction sort-lists pl[1..8] are skipped (we Z-sort polygons directly).

/** A model vertex: integer engine-space position + its per-vertex normal index. */
export interface ModelVertex {
  x: number;
  y: number;
  z: number;
  normal: number;
}

/** A flat polygon face: its vertex indices, its face-normal index, base palette colour and flags. */
export interface ModelFace {
  /** Vertex indices into `vertices` (CCW as authored). */
  v: number[];
  /** Index into `normals` (the face normal, used for culling + flat shade). */
  normal: number;
  /** Base palette colour (first colour of the material's fade ramp). */
  color: number;
  /** Face flags (F_SHADE* / F_2SIDE etc, low byte = side number). */
  flags: number;
}

export interface Model {
  name: string;
  vertices: ModelVertex[];
  /** Normal vectors (fixed-point, /UNIT). Used for face culling and flat shading. */
  normals: { x: number; y: number; z: number }[];
  /** Count of basic (face) normals; normals[0..nnum1) are face normals, the rest gouraud. */
  nnum1: number;
  faces: ModelFace[];
  /** The centre vertex index (pl[0][1]) — the object's distance sort key vertex. */
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
  // Reconstruct a signed 32-bit value (vertex coords reach +/- a few hundred thousand).
  const v = (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8) | ((d[o + 2] ?? 0) << 16) | ((d[o + 3] ?? 0) << 24);
  return v | 0;
}

function tag(d: Uint8Array, o: number): string {
  return String.fromCharCode(d[o] ?? 0, d[o + 1] ?? 0, d[o + 2] ?? 0, d[o + 3] ?? 0);
}

/**
 * Parse a VISU engine object from its raw bytes. Mirrors vis_loadobject's chunk walk (TAG + int32 length),
 * but reads `int` as 16-bit. Throws on a malformed/unknown chunk so the fixture tests catch format drift.
 */
export function parseModel(data: Uint8Array | ArrayBuffer): Model {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  let name = '';
  let vertices: ModelVertex[] = [];
  const normals: { x: number; y: number; z: number }[] = [];
  let nnum1 = 0;
  let polyBody = 0;
  let pl0Body = 0;

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
      vertices = new Array<ModelVertex>(vnum);
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
      throw new Error(`vector1 parseModel: unknown chunk '${t}' at ${pos}`);
    }
    pos = body + len;
  }

  // Walk pl[0]: word count, centre vertex, then a 0-terminated list of polygon byte-offsets into polydata.
  const centerVertex = readU16(d, pl0Body + 2);
  const faces: ModelFace[] = [];
  let off = pl0Body + 4;
  for (;;) {
    const p = readU16(d, off);
    if (p === 0) break;
    off += 2;
    // polydata record: byte sides, byte flags, byte color, byte reserved, word normal, word v1..vn.
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
