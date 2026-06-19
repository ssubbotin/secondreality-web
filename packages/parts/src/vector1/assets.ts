// Parse the U2A.00M scene-material file (VISU/C/U2A.C main): a small header, the 256-entry 6-bit VGA
// palette (the material fade ramps the flat-shade picks within), and the object index list that maps each
// scene slot co[1..] to one of the loaded ship meshes (with instancing — the pixel ship appears x3).

function readI16(d: Uint8Array, o: number): number {
  const v = (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function readI32(d: Uint8Array, o: number): number {
  return (
    (d[o] ?? 0) | ((d[o + 1] ?? 0) << 8) | ((d[o + 2] ?? 0) << 16) | ((d[o + 3] ?? 0) << 24) | 0
  );
}

export interface SceneMaterials {
  /** 256-entry VGA palette, 6-bit components (0..63), packed r,g,b. */
  palette: Uint8Array;
  /** conum (number of co[] slots including the camera at index 0). */
  conum: number;
  /** For co[1..conum-1], the mesh object index (1,2,3 = U2A.001/002/003). */
  objectIndex: number[];
}

/** Parse U2A.00M. Header: 'FC' magic; long at offset 4 = byte offset of the object index list. */
export function parseSceneMaterials(data: Uint8Array | ArrayBuffer): SceneMaterials {
  const d = data instanceof Uint8Array ? data : new Uint8Array(data);
  const palette = d.slice(16, 16 + 768);
  const listOff = readI32(d, 4);
  const conum = readI16(d, listOff);
  const objectIndex: number[] = [];
  for (let k = 0; k < conum - 1; k++) objectIndex.push(readI16(d, listOff + 2 + 2 * k));
  return { palette, conum, objectIndex };
}
