/**
 * The baked runtime model: city geometry + camera flythrough track in a compact, JSON-serialisable
 * shape the Effect loads at startup. Produced by `bake.ts` from CITY.ASC + U2E.0AB + U2E.00M + U2E.MAT,
 * and consumed by the renderer. Geometry is in engine integer world space; the camera track is the
 * decoded U2E.0AB matrices.
 */

export interface BakedTri {
  a: number;
  b: number;
  c: number;
  nx: number;
  ny: number;
  nz: number;
  baseColor: number;
  shadeBits: number;
  twoSided: boolean;
}

export interface BakedMesh {
  name: string;
  /** Flat [x,y,z, ...] engine-space integer vertices. */
  verts: number[];
  tris: BakedTri[];
}

export interface BakedFrame {
  /** Camera rmatrix m[0..8] + position. */
  m: number[];
  x: number;
  y: number;
  z: number;
  /** Indices into `meshes` that are visible this frame (already mapped from co[] object indices). */
  vis: number[];
}

export interface BakedModel {
  /** Field-of-view angle held for the flythrough (U2E: 0x1C00). */
  fov: number;
  /** vid_window clip rect [x1,x2,y1,y2,z1,z2]. */
  window: [number, number, number, number, number, number];
  meshes: BakedMesh[];
  frames: BakedFrame[];
}
