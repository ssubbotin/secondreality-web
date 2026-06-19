/**
 * Assembles the runtime city geometry from a parsed `.ASC` scene. Each mesh's vertices are scaled into
 * the VISU engine's integer world space (the binary objects are the ASC meshes ×10 with a small ground
 * shift on Z — verified against U2E.001/.002) and each triangle gets a face normal + a flat-shade base
 * colour.
 *
 * Face normals use OPT.C's exact method: the Newell sum over the polygon edges, NEGATED, normalised to
 * UNIT length. With that sign, the engine's `N·V >= 0` test (project.ts isBackFacing) culls back faces.
 */

import type { AscScene } from './asc.js';
import { UNIT } from './fixed.js';
import type { MaterialDef } from './material.js';

/** ASC→engine coordinate transform (matches U2E's binary objects: ×10, Z ground shift). */
export const WORLD_SCALE = 10;
export const Z_SHIFT = -169; // ≈ -168.86 fitted from U2E.001/.002 (integer-rounded)

export interface Tri {
  /** Vertex indices into the mesh's vertex array (CCW as exported). */
  a: number;
  b: number;
  c: number;
  /** Negated, UNIT-normalised face normal (engine convention). */
  nx: number;
  ny: number;
  nz: number;
  /** Flat-shade base palette index (material color). */
  baseColor: number;
  /** calclight shift (3/4/5) or 0 for an unshaded flat colour. */
  shadeBits: number;
  twoSided: boolean;
}

export interface CityMesh {
  name: string;
  /** Engine-space integer vertices, flat triple array [x0,y0,z0, x1,y1,z1, ...]. */
  verts: Int32Array;
  tris: Tri[];
}

/** Default material when a face declares none (READASC leaves index 0 = first MAT entry). */
const DEFAULT_MATERIAL: MaterialDef = {
  name: 'DEFAULT',
  color: 0,
  colorlen: 32,
  shadeBits: 3,
  gouraud: false,
  twoSided: false,
};

/** Newell-method face normal (OPT.C), NEGATED and scaled to UNIT length. Operates on engine-space verts. */
export function faceNormal(
  verts: Int32Array,
  a: number,
  b: number,
  c: number,
): [number, number, number] {
  const idx = [a, b, c];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < 3; i++) {
    const vi = idx[i] ?? 0;
    const wi = idx[i === 0 ? 2 : i - 1] ?? 0;
    const vx = verts[vi * 3] ?? 0;
    const vy = verts[vi * 3 + 1] ?? 0;
    const vz = verts[vi * 3 + 2] ?? 0;
    const wx = verts[wi * 3] ?? 0;
    const wy = verts[wi * 3 + 1] ?? 0;
    const wz = verts[wi * 3 + 2] ?? 0;
    x += (vy - wy) * (vz + wz);
    y += (vz - wz) * (vx + wx);
    z += (vx - wx) * (vy + wy);
  }
  const dl = Math.sqrt(x * x + y * y + z * z);
  if (dl > 1 || dl < -1) {
    // OPT.C negates the Newell normal before storing.
    return [
      -Math.trunc((x * UNIT) / dl),
      -Math.trunc((y * UNIT) / dl),
      -Math.trunc((z * UNIT) / dl),
    ];
  }
  return [0, 0, 0];
}

/** Build the runtime city from the parsed ASC scene + the material table. */
export function buildCity(scene: AscScene, materials: Map<string, MaterialDef>): CityMesh[] {
  const out: CityMesh[] = [];
  for (const mesh of scene.meshes) {
    const verts = new Int32Array(mesh.vertices.length * 3);
    for (let i = 0; i < mesh.vertices.length; i++) {
      const v = mesh.vertices[i];
      if (!v) continue;
      verts[i * 3] = Math.trunc(v.x * WORLD_SCALE);
      verts[i * 3 + 1] = Math.trunc(v.y * WORLD_SCALE);
      verts[i * 3 + 2] = Math.trunc(v.z * WORLD_SCALE) + Z_SHIFT;
    }
    const tris: Tri[] = [];
    for (const f of mesh.faces) {
      const mat = materials.get(f.material) ?? DEFAULT_MATERIAL;
      const [nx, ny, nz] = faceNormal(verts, f.a, f.b, f.c);
      tris.push({
        a: f.a,
        b: f.b,
        c: f.c,
        nx,
        ny,
        nz,
        baseColor: mat.color,
        shadeBits: mat.shadeBits,
        twoSided: mat.twoSided,
      });
    }
    out.push({ name: mesh.name, verts, tris });
  }
  return out;
}
