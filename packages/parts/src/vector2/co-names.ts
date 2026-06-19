/**
 * The co[] object table for the U2E scene, in order, as resolved by U2E.C from U2E.00M's index list and
 * the numbered binary object files' NAME chunks. Index 0 is the camera. Names map (after stripping the
 * leading `_`, an engine flag marking "always-far" sort objects) to CITY.ASC mesh names where the
 * geometry exists in the readable ASC export. Duplicate entries (Tree copies, extra cars/signs) reuse an
 * earlier object's geometry at an animation-driven offset.
 *
 * Derived from VISU/C/SCENE/U2E.00M + U2E.001..U2E.042. Names not present in CITY.ASC (logo, talojota,
 * s01, tunneli2, minitalo, fcirto*, talokoe, pysty01, Car02, katdetai*, KDETAIL*, plushouse, talot03..05,
 * b4's siblings) are scene additions from the final U2CITY11 project and are documented as absent here.
 */

/** co[index] → object name (index 0 = camera). 58 entries for U2E (conum = 58). */
export const CO_NAMES: readonly string[] = [
  'CAMERA', // 0
  '_platform', // 1
  'BuildingH', // 2
  '_platform0', // 3
  'Building08', // 4
  'Building14', // 5
  'BuildingC', // 6
  'Building20', // 7
  'Building21', // 8
  'Tree01g', // 9
  'puistotie', // 10
  '_L_pohja', // 11
  'tunneli', // 12
  'sivutalo', // 13
  '_laatta2', // 14
  '_laatta01', // 15
  '_laatta02', // 16
  '_levyt', // 17
  'talot', // 18
  'talot2', // 19
  '_levyt3', // 20
  'kulmatalot', // 21
  '_laatta', // 22
  'logo', // 23
  'b4', // 24
  'talojota', // 25
  'talot01', // 26
  'talot02', // 27
  's01', // 28
  'tunneli2', // 29
  'minitalo', // 30
  'fcirto', // 31
  'fcirto01', // 32
  'talokoe', // 33
  'pysty01', // 34
  'Car02', // 35
  'katdetai03', // 36
  'KDETAIL04', // 37
  'KDETAIL12', // 38
  'plushouse', // 39
  'talot04', // 40
  'talot03', // 41
  'talot05', // 42
  'Tree01g', // 43 (copy)
  'Tree01g', // 44 (copy)
  'Tree01g', // 45 (copy)
  'Tree01g', // 46 (copy)
  'BuildingC', // 47 (copy)
  'talojota', // 48 (copy)
  'fcirto01', // 49 (copy)
  'fcirto01', // 50 (copy)
  'Car02', // 51 (copy)
  'Car02', // 52 (copy)
  'fcirto01', // 53 (copy)
  'fcirto01', // 54 (copy)
  'fcirto01', // 55 (copy)
  'Building08', // 56 (copy)
  'fcirto01', // 57 (copy)
];

/** Strip the engine's leading `_` sort-flag from a co name to get the base mesh name. */
export function baseName(name: string): string {
  return name.startsWith('_') ? name.slice(1) : name;
}
