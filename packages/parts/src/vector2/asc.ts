/**
 * Minimal parser for the 3D Studio R4 ASCII export (`.ASC`) used by Future Crew's VISU toolchain.
 * The format is line-oriented and readable: a sequence of `Named object:` blocks, each carrying a
 * `Tri-mesh, Vertices: N  Faces: M` header, a `Vertex list` of `Vertex i: X: .. Y: .. Z: ..` lines,
 * and a `Face list` of `Face i: A:.. B:.. C:.. AB:.. BC:.. CA:..` lines, each optionally followed by a
 * `Material:"NAME"` line. Camera objects carry `Camera (..mm)` / `Position:` / `Target:` instead.
 *
 * Material assignment is verbatim from the VISU toolchain's READASC.C: every face starts at the default
 * material (`material: ''` here, the 3DS default), and a `Material:` line overrides the *single
 * immediately preceding* face (`fc[fcnum-1].material`). It is NOT sticky — faces with no following
 * Material line stay at the default (e.g. the whole `tunneli` mesh, which declares none).
 *
 * This is the geometry truth for the KewlComplex city (3DS/CITY.ASC); the VISU engine's binary objects
 * are the same meshes scaled ×10 (see baked track). We keep coordinates in the ASC's native float
 * world space and let the bake step apply the ×10 scale + ground shift.
 */

export interface AscVertex {
  x: number;
  y: number;
  z: number;
}

export interface AscFace {
  a: number;
  b: number;
  c: number;
  material: string;
}

export interface AscMesh {
  name: string;
  vertices: AscVertex[];
  faces: AscFace[];
}

export interface AscCamera {
  name: string;
  position: AscVertex;
  target: AscVertex;
}

export interface AscScene {
  meshes: AscMesh[];
  cameras: AscCamera[];
}

const NAMED = /^Named object:\s*"(.*?)"/;
const VERTEX = /^Vertex\s+\d+:\s*X:\s*([-\d.]+)\s+Y:\s*([-\d.]+)\s+Z:\s*([-\d.]+)/;
const FACE = /^Face\s+\d+:\s*A:\s*(\d+)\s+B:\s*(\d+)\s+C:\s*(\d+)/;
const MATERIAL = /^Material:\s*"(.*?)"/;
const CAMERA = /^Camera\s*\(/;
const POSITION = /^Position:\s*X:\s*([-\d.]+)\s+Y:\s*([-\d.]+)\s+Z:\s*([-\d.]+)/;
const TARGET = /^Target:\s*X:\s*([-\d.]+)\s+Y:\s*([-\d.]+)\s+Z:\s*([-\d.]+)/;

/** Parse a full `.ASC` text into meshes + cameras. Lines outside object blocks are ignored. */
export function parseAsc(text: string): AscScene {
  const meshes: AscMesh[] = [];
  const cameras: AscCamera[] = [];
  const lines = text.split(/\r?\n/);

  let mesh: AscMesh | null = null;
  let camName: string | null = null;
  let camPos: AscVertex | null = null;
  let camTgt: AscVertex | null = null;
  let inCamera = false;

  const flushCamera = (): void => {
    if (camName !== null && camPos && camTgt) {
      cameras.push({ name: camName, position: camPos, target: camTgt });
    }
    camName = null;
    camPos = null;
    camTgt = null;
    inCamera = false;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const named = NAMED.exec(line);
    if (named) {
      flushCamera();
      mesh = null;
      // The block kind (mesh vs camera) is decided by the following descriptor line.
      camName = named[1] ?? '';
      continue;
    }

    if (CAMERA.test(line)) {
      inCamera = true;
      continue;
    }
    if (inCamera) {
      const p = POSITION.exec(line);
      if (p) {
        camPos = { x: Number(p[1]), y: Number(p[2]), z: Number(p[3]) };
        continue;
      }
      const t = TARGET.exec(line);
      if (t) {
        camTgt = { x: Number(t[1]), y: Number(t[2]), z: Number(t[3]) };
        continue;
      }
      continue;
    }

    if (line.startsWith('Tri-mesh')) {
      mesh = { name: camName ?? '', vertices: [], faces: [] };
      meshes.push(mesh);
      camName = null;
      continue;
    }

    if (!mesh) continue;

    const v = VERTEX.exec(line);
    if (v) {
      mesh.vertices.push({ x: Number(v[1]), y: Number(v[2]), z: Number(v[3]) });
      continue;
    }
    const f = FACE.exec(line);
    if (f) {
      // READASC.C: each face starts at the default material (''); a following Material line patches it.
      mesh.faces.push({ a: Number(f[1]), b: Number(f[2]), c: Number(f[3]), material: '' });
      continue;
    }
    const m = MATERIAL.exec(line);
    if (m) {
      // Overrides the single immediately preceding face (fc[fcnum-1]).
      const last = mesh.faces[mesh.faces.length - 1];
      if (last) last.material = m[1] ?? '';
    }
  }
  flushCamera();

  return { meshes, cameras };
}
