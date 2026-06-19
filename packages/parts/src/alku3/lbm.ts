import { type DecodedPicture, decodeLbm } from './decode-lbm.js';

/**
 * The four ALKU reveal pictures (the "picture flash" assets shipped in the original ALKU directory).
 * All are IFF `PBM ` (chunky 256-colour) LBMs with ByteRun1 compression; they are the pictures the
 * `sync 4` palette reveal fades in (`ALKU/MAIN.C:79-86`). Decoded with the local `decodeLbm` (the engine
 * does not yet export one on this branch — see STATUS).
 */
export const REVEAL_PICTURES = ['PIC001', 'HOIKKA', 'RYPPIS', 'U2-MOVIE'] as const;

export type RevealPictureName = (typeof REVEAL_PICTURES)[number];

/** Runtime URL of a reveal picture (served from `apps/lab/public/pics/`). */
export function revealPictureUrl(name: RevealPictureName): string {
  return `/pics/${name}.LBM`;
}

/** Fetch + decode one reveal LBM. `fetchImpl` is injectable for tests. */
export async function loadRevealPicture(
  name: RevealPictureName,
  fetchImpl: typeof fetch = fetch,
): Promise<DecodedPicture> {
  const url = revealPictureUrl(name);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`alku3: failed to fetch ${url} (HTTP ${res.status})`);
  return decodeLbm(await res.arrayBuffer());
}

// Re-export the local decode so tests and the Effect import from one place.
export { type DecodedPicture, decodeLbm };
