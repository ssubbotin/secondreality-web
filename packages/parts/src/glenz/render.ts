import type { Solid } from './geometry.js';
import type { GlenzPolygon } from './glenz-fill.js';
import { calcMatrixYXZ } from './matrix.js';
import { faceBrightness } from './palette.js';
import { faceCross, type Point3, PROJ_320, projectPoints, rotatePoints, scaleMatrix } from './vec.js';

// The per-solid MAIN.C draw pipeline (MAIN.C:595-637): rotate the model points by the rY*rX*rZ matrix
// (no translation), then apply the diagonal scale matrix with the world translation, project, then build
// the per-face polygon list with back-face culling + the demo_glz colour assignment. Pure CPU; the
// resulting GlenzPolygon list feeds the additive fill (glenz-fill.ts).

export interface WorldOffset {
  ox: number;
  oy: number;
  oz: number;
}

/** Flatten a solid's vertices into the int32 (count-less) triple buffer rotlist consumes. */
function vertexBuffer(solid: Solid): Int32Array {
  const n = solid.vertices.length;
  const buf = new Int32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = solid.vertices[i];
    if (!v) continue;
    buf[i * 3] = v[0];
    buf[i * 3 + 1] = v[1];
    buf[i * 3 + 2] = v[2];
  }
  return buf;
}

/**
 * Rotate -> scale+translate -> project one solid. `rx,ry,rz` are 0.1-degree rotation; `scale*` the
 * per-axis scale (the diagonal *64 matrix); `off` the world translation (oxp, ypos+1500+oyp, zpos+ozp).
 */
export function projectSolid(
  solid: Solid,
  rx: number,
  ry: number,
  rz: number,
  xscale: number,
  yscale: number,
  zscale: number,
  off: WorldOffset,
): Point3[] {
  const n = solid.vertices.length;
  const rot = calcMatrixYXZ(rx, ry, rz);
  const rotated = rotatePoints(rot, vertexBuffer(solid), n, 0, 0, 0); // translation 0
  const scale = scaleMatrix(xscale, yscale, zscale);
  const placed = rotatePoints(scale, rotated, n, off.ox, off.oy, off.oz);
  return projectPoints(placed, PROJ_320);
}

/**
 * Build the front-facing polygon list with per-face colour. Back faces (faceCross hidden) are dropped
 * (the original flips their flag and they contribute nothing visible). Each visible face is given a
 * single distinct colour bit (demo_glz's rolling-slot idea: faces cycle through bits so overlapping
 * faces OR more bits in the additive fill, which the glenz render palette brightens). The face brightness
 * (demo_glz, faceBrightness) additionally raises bit 3 (the lit/glenz bit) once the face is bright enough.
 */
export function buildSolidPolygons(
  solid: Solid,
  proj: readonly Point3[],
  lightshift: number,
): GlenzPolygon[] {
  const out: GlenzPolygon[] = [];
  for (let f = 0; f < solid.faces.length; f++) {
    const face = solid.faces[f];
    if (!face) continue;
    const i0 = face.v[0];
    const i1 = face.v[1];
    const i2 = face.v[2];
    const v0 = proj[i0];
    const v1 = proj[i1];
    const v2 = proj[i2];
    if (!v0 || !v1 || !v2) continue;
    const { cross, hidden } = faceCross(v0, v1, v2);
    if (hidden) continue;
    const bright = faceBrightness(cross, lightshift);
    // Coverage bit cycles per face (slots 0..6); bit 7 reserved. Lit bit (8) set for bright faces.
    let color = 1 << (f % 7);
    if (bright >= 24) color |= 0x08;
    out.push({ color, pts: [v0, v1, v2] });
  }
  return out;
}
