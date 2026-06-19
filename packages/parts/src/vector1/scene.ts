// The per-frame VISU draw pipeline (VISU/C/U2A.C main loop + VISU.C vis_drawobject), producing the list of
// flat-shaded screen polygons for one animation frame. Steps, exactly as the original:
//   1. apply the (static) camera matrix to each enabled slot's accumulated r0  -> world matrix o.r
//   2. compute each object's distance (calc_singlez of its centre vertex) and Z-sort objects back-to-front
//   3. per object: rotate vertices (calc_rotate) + face normals (calc_nrotate), project (calc_project)
//   4. per face: back-face cull (checkculling), flat-shade (calclight) -> base color + shade, emit polygon
// The result is a painter-ordered polygon list the raster fills. Pure integer math; no GPU.

import {
  applyMatrix,
  cloneMatrix,
  projectVertex,
  PROJ_MODEX,
  type RMatrix,
  rotateVertex,
  singleZ,
} from './fixed.js';
import { calcLight, effectiveFaceFlags, F_2SIDE } from './light.js';
import type { Model } from './model.js';

export const SCREEN_W = 320;
export const SCREEN_H = 200;

/** A ready-to-fill screen polygon: palette colour index + its projected vertex ring. */
export interface ScreenPoly {
  color: number;
  pts: { x: number; y: number }[];
}

/** One scene object instance: the mesh plus the per-frame accumulated relative matrix and on flag. */
export interface SceneObject {
  model: Model;
  r0: RMatrix;
  on: boolean;
}

/** Sign-extend low 16 bits (calc_nrotate uses 16-bit signed products). */
function s16(v: number): number {
  const w = v & 0xffff;
  return w >= 0x8000 ? w - 0x10000 : w;
}

/** calc_nrotate (ACALC.ASM) for one normal: 16-bit signed matrix * 16-bit signed normal, >>14. */
function rotateNormal(m: readonly number[], nx: number, ny: number, nz: number): [number, number, number] {
  const m0 = s16(m[0] ?? 0);
  const m1 = s16(m[1] ?? 0);
  const m2 = s16(m[2] ?? 0);
  const m3 = s16(m[3] ?? 0);
  const m4 = s16(m[4] ?? 0);
  const m5 = s16(m[5] ?? 0);
  const m6 = s16(m[6] ?? 0);
  const m7 = s16(m[7] ?? 0);
  const m8 = s16(m[8] ?? 0);
  const x = s16(nx);
  const y = s16(ny);
  const z = s16(nz);
  // The dot of three 16-bit products can exceed 2^31, so floor-shift via Math.floor (not 32-bit `>>`).
  return [
    Math.floor((m0 * x + m1 * y + m2 * z) / 16384),
    Math.floor((m3 * x + m4 * y + m5 * z) / 16384),
    Math.floor((m6 * x + m7 * y + m8 * z) / 16384),
  ];
}

interface RenderObject {
  obj: SceneObject;
  r: RMatrix;
  dist: number;
}

/**
 * Build the painter-ordered screen-polygon list for one frame. `cam` is the (static) camera matrix; each
 * enabled object's r0 is composited through it. Objects are Z-sorted back-to-front by their centre vertex
 * distance (the original `dist` insertion sort), then each visible, front-facing face is shaded and emitted.
 */
export function buildFramePolys(objects: readonly SceneObject[], cam: RMatrix): ScreenPoly[] {
  // Apply camera + compute distance for enabled objects.
  const ro: RenderObject[] = [];
  for (const obj of objects) {
    if (!obj.on) continue;
    const r = applyMatrix(cloneMatrix(obj.r0), cam);
    const cv = obj.model.vertices[obj.model.centerVertex];
    const dist = cv ? singleZ(r.m, r.z, cv.x, cv.y, cv.z) : 0;
    ro.push({ obj, r, dist });
  }
  // Z-sort: farthest first (original sorts by descending dist, draws in that order = painter's).
  ro.sort((a, b) => b.dist - a.dist);

  const out: ScreenPoly[] = [];
  for (const { obj, r } of ro) {
    const model = obj.model;
    const vn = model.vertices.length;
    // Rotate + project all vertices once.
    const rotZ = new Array<number>(vn);
    const proj = new Array<{ sx: number; sy: number; vf: number }>(vn);
    let allVf = 0xffff;
    for (let i = 0; i < vn; i++) {
      const v = model.vertices[i];
      if (!v) {
        rotZ[i] = 0;
        proj[i] = { sx: 0, sy: 0, vf: 0 };
        continue;
      }
      const rv = rotateVertex(r.m, r.x, r.y, r.z, v.x, v.y, v.z);
      rotZ[i] = rv[2];
      const p = projectVertex(rv[0], rv[1], rv[2], PROJ_MODEX, SCREEN_W - 1, SCREEN_H - 1);
      proj[i] = p;
      allVf &= p.vf;
    }
    if (allVf !== 0) continue; // whole object off one screen edge (calc_project AND == nonzero)

    for (const face of model.faces) {
      const flags = effectiveFaceFlags(face.flags);
      const nrm = model.normals[face.normal];
      const i0 = face.v[0] ?? 0;
      // Back-face cull: rotate the face normal, dot with the first (rotated) vertex; hidden if >= 0.
      if (!(flags & F_2SIDE) && nrm) {
        const rn = rotateNormal(r.m, nrm.x, nrm.y, nrm.z);
        const v0 = model.vertices[i0];
        if (v0) {
          const rv0 = rotateVertex(r.m, r.x, r.y, r.z, v0.x, v0.y, v0.z);
          const dot = rn[0] * rv0[0] + rn[1] * rv0[1] + rn[2] * rv0[2];
          if (dot >= 0) continue; // hidden (checkculling: carry=1 when n.v >= 0)
        }
      }
      // Flat shade: colour = base + calclight(face normal).
      let color = face.color;
      if (nrm) {
        const rn = rotateNormal(r.m, nrm.x, nrm.y, nrm.z);
        color = (face.color + calcLight(rn[0], rn[1], rn[2], flags)) & 0xff;
      }
      const pts: { x: number; y: number }[] = [];
      for (const idx of face.v) {
        const p = proj[idx];
        if (p) pts.push({ x: p.sx, y: p.sy });
      }
      if (pts.length >= 3) out.push({ color, pts });
    }
  }
  return out;
}
