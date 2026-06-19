/**
 * Self-contained decoder for Deluxe Paint IFF image files (`.LBM`) — the chunky `PBM ` variant (256-colour
 * VGA, used by the ALKU reveal pictures `PIC001/HOIKKA/RYPPIS/U2-MOVIE.LBM`) and classic planar `ILBM`.
 *
 * This is a LOCAL copy in the part dir: the branch is based on a commit where `@sr/engine` does not yet
 * export an ILBM decoder. When the engine `decodeLbm` lands (same `DecodedPicture` shape), alku3 can switch
 * to it with no change to the surface/Effect code (see STATUS — deferred).
 *
 * An IFF file is a `FORM` container of typed chunks (big-endian sizes):
 *   "FORM" <len:u32be> <formType:4>   formType = "ILBM" (planar) or "PBM " (chunky)
 *   then chunks: <id:4> <len:u32be> <len bytes, padded to even>
 *
 * Chunks consumed:
 *   BMHD: w,h (u16be), x,y (i16be), nPlanes (u8), masking (u8), compression (u8), …
 *   CMAP: n × RGB bytes (8-bit components as stored by DPaint).
 *   BODY: compression 0 = uncompressed, 1 = ByteRun1 (PackBits) RLE.
 * Other chunks are skipped. For `PBM ` the decompressed BODY is already chunky 8-bit row-major; for `ILBM`
 * each row is `nPlanes` bitplane scanlines deinterleaved into 8-bit indices.
 */

export interface DecodedPicture {
  /** Picture width in pixels. */
  width: number;
  /** Picture height in pixels. */
  height: number;
  /** Palette entry count (256 for these assets). */
  colors: number;
  /** `width * height` 8-bit palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** `256 * 3` 6-bit (0..63) VGA RGB triples — `palette >> 2`. */
  palette6: Uint8Array;
  /** `256 * 3` 8-bit VGA RGB triples — the CMAP verbatim (padded/truncated to 256 entries). */
  palette: Uint8Array;
}

function readUint32BE(d: Uint8Array, off: number): number {
  return (
    ((d[off] ?? 0) * 0x1000000 +
      ((d[off + 1] ?? 0) << 16) +
      ((d[off + 2] ?? 0) << 8) +
      (d[off + 3] ?? 0)) >>>
    0
  );
}

function readUint16BE(d: Uint8Array, off: number): number {
  return ((d[off] ?? 0) << 8) | (d[off + 1] ?? 0);
}

function readId(d: Uint8Array, off: number): string {
  return String.fromCharCode(d[off] ?? 0, d[off + 1] ?? 0, d[off + 2] ?? 0, d[off + 3] ?? 0);
}

export interface Bmhd {
  width: number;
  height: number;
  nPlanes: number;
  masking: number;
  compression: number;
}

/** Parse the leading fields of a BMHD chunk body. */
export function parseBmhd(d: Uint8Array, off: number): Bmhd {
  return {
    width: readUint16BE(d, off),
    height: readUint16BE(d, off + 2),
    nPlanes: d[off + 8] ?? 0,
    masking: d[off + 9] ?? 0,
    compression: d[off + 10] ?? 0,
  };
}

/**
 * Decode an IFF ByteRun1 (Amiga PackBits) stream into exactly `expectedLen` bytes. For each control byte
 * `n`: 0..127 → copy the next `n+1` bytes literally; 129..255 → repeat the next byte `257-n` times;
 * 128 → no-op. Stops once `expectedLen` bytes are produced.
 */
export function byteRun1Decode(src: Uint8Array, expectedLen: number): Uint8Array {
  const out = new Uint8Array(expectedLen);
  let si = 0;
  let di = 0;
  while (di < expectedLen && si < src.length) {
    const n = src[si] ?? 0;
    si++;
    if (n <= 127) {
      const count = n + 1;
      for (let k = 0; k < count && di < expectedLen; k++) {
        out[di] = src[si] ?? 0;
        di++;
        si++;
      }
    } else if (n >= 129) {
      const count = 257 - n;
      const value = src[si] ?? 0;
      si++;
      for (let k = 0; k < count && di < expectedLen; k++) {
        out[di] = value;
        di++;
      }
    }
    // n === 128: no-op
  }
  return out;
}

/**
 * Deinterleave a planar ILBM BODY into chunky 8-bit indices. Each of `height` rows holds `nPlanes`
 * bitplane scanlines (bit `p` of a pixel comes from plane `p`), each `ceil(width/8)` bytes, optionally
 * followed by a 1-bit mask plane (`hasMask`) that is skipped. Bit 7 of the first byte is the leftmost
 * pixel.
 */
export function deinterleavePlanes(
  body: Uint8Array,
  width: number,
  height: number,
  nPlanes: number,
  hasMask: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height);
  const rowBytes = (width + 7) >> 3;
  const planesPerRow = nPlanes + (hasMask ? 1 : 0);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    for (let p = 0; p < planesPerRow; p++) {
      const planeOff = src + p * rowBytes;
      if (p >= nPlanes) continue; // mask plane: consume the bytes, ignore the bits
      const bit = 1 << p;
      for (let byte = 0; byte < rowBytes; byte++) {
        const value = body[planeOff + byte] ?? 0;
        const x0 = byte << 3;
        for (let b = 0; b < 8; b++) {
          const x = x0 + b;
          if (x >= width) break;
          if (value & (0x80 >> b)) {
            const idx = rowBase + x;
            out[idx] = (out[idx] ?? 0) | bit;
          }
        }
      }
    }
    src += planesPerRow * rowBytes;
  }
  return out;
}

/**
 * Decode a `.LBM` (IFF `ILBM`/`PBM `) buffer into a `DecodedPicture`. Parses FORM/BMHD/CMAP/BODY; PBM keeps
 * the decompressed BODY as chunky indices (stripping the odd-width pad byte), ILBM deinterleaves bitplanes.
 * `palette` is the CMAP verbatim (256 entries) and `palette6 = palette >> 2`.
 */
export function decodeLbm(buffer: ArrayBuffer | Uint8Array): DecodedPicture {
  const d = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (readId(d, 0) !== 'FORM') throw new Error('decodeLbm: not an IFF FORM file');
  const formType = readId(d, 8);
  if (formType !== 'ILBM' && formType !== 'PBM ') {
    throw new Error(`decodeLbm: unsupported FORM type "${formType}"`);
  }
  const planar = formType === 'ILBM';

  let bmhd: Bmhd | null = null;
  let cmap: Uint8Array | null = null;
  let bodyChunk: Uint8Array | null = null;

  // Walk chunks after the 12-byte "FORM <len> <type>" preamble.
  let off = 12;
  while (off + 8 <= d.length) {
    const id = readId(d, off);
    const len = readUint32BE(d, off + 4);
    const body = off + 8;
    if (id === 'BMHD') bmhd = parseBmhd(d, body);
    else if (id === 'CMAP') cmap = d.slice(body, body + len);
    else if (id === 'BODY') bodyChunk = d.slice(body, body + len);
    off = body + len + (len & 1); // chunks are padded to an even length
  }

  if (!bmhd) throw new Error('decodeLbm: missing BMHD chunk');
  if (!bodyChunk) throw new Error('decodeLbm: missing BODY chunk');

  const { width, height, nPlanes, masking, compression } = bmhd;
  const hasMask = masking === 1;

  const rowBytes = (width + 7) >> 3;
  const planesPerRow = nPlanes + (hasMask ? 1 : 0);
  const pbmRowBytes = width + (width & 1);
  const rawLen = planar ? height * planesPerRow * rowBytes : height * pbmRowBytes;
  const raw = compression === 1 ? byteRun1Decode(bodyChunk, rawLen) : bodyChunk.subarray(0, rawLen);

  let indices: Uint8Array;
  if (planar) {
    indices = deinterleavePlanes(raw, width, height, nPlanes, hasMask);
  } else if (pbmRowBytes === width) {
    indices = raw.length === width * height ? Uint8Array.from(raw) : raw.slice(0, width * height);
  } else {
    // PBM with an odd width: each row is padded by one byte — strip it.
    indices = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      indices.set(raw.subarray(y * pbmRowBytes, y * pbmRowBytes + width), y * width);
    }
  }

  const colors = cmap ? Math.min(256, Math.floor(cmap.length / 3)) : 0;
  const palette = new Uint8Array(256 * 3);
  if (cmap) palette.set(cmap.subarray(0, colors * 3));
  const palette6 = new Uint8Array(256 * 3);
  for (let i = 0; i < palette6.length; i++) palette6[i] = (palette[i] ?? 0) >> 2;

  return { width, height, colors: colors || 256, indices, palette6, palette };
}
