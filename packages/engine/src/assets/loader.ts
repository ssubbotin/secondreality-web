import { type DecodedPicture, decodePicture } from './picture.js';

/**
 * Fetch a `.U` picture from `url` and decode it. The network seam is kept separate from the pure
 * `decodePicture` so the decoder stays unit-testable offline; pass a custom `fetchImpl` (e.g. in a
 * test) to supply bytes without a real network. Parts call this from `load()`.
 */
export async function loadPicture(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DecodedPicture> {
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`loadPicture: failed to fetch ${url} (HTTP ${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return decodePicture(buf);
}
