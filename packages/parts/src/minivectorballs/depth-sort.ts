/**
 * Painter back-to-front ordering for the vector balls.
 *
 * The original ASM.ASM `_drawdots` does NOT sort: it draws the 512 balls in their scrambled `dot[]`
 * order and relies on the depth-shade brightness plus raw overdraw (later balls overwrite earlier ones)
 * for the depth cue. For the modern renderer we expose this explicit far→near sort by the perspective
 * divisor `bp` (larger bp = farther from the camera, drawn first; smaller bp = nearer, drawn last) so
 * near balls win any front-most compositing. Additive blending is order-independent, so it is optional
 * there — but it is the unit-tested back-to-front sort, and is required if the discs ever switch to
 * over/opaque blending. The sort is stable (ties keep input order), so it never disturbs the authentic
 * scrambled draw order among equal-depth balls.
 */

export interface DepthEntry {
  index: number;
  bp: number;
}

/** Return a new array of entries ordered far→near (descending `bp`), stable for equal `bp`. */
export function sortByDepth<T extends DepthEntry>(entries: readonly T[]): T[] {
  // Decorate with the original position to guarantee a stable sort across engines.
  return entries
    .map((entry, pos) => ({ entry, pos }))
    .sort((a, b) => b.entry.bp - a.entry.bp || a.pos - b.pos)
    .map((d) => d.entry);
}
