// Future Crew's STMIK music player stores ScreamTracker-3 modules with their pattern bodies
// lightly obfuscated: every byte of a packed pattern (after the 2-byte length word) is XORed
// with key(si) = ((si*4) ^ si) & 0xFF, where si is the byte's offset *within the pattern block*
// (counting the length word). STMIK de-obfuscates each pattern as it reads it; everything else
// in the file — header, order list, instrument headers, sample data — is plain standard S3M.
//
// A stock S3M player (libopenmpt included) reads the raw, still-obfuscated pattern bytes and
// decodes noise. `deobfuscateS3M` reverses the XOR so the result is a byte-for-byte standard
// S3M that any conformant player decodes correctly.

const SCRM = 0x4d524353; // 'SCRM' little-endian at offset 0x2C

function u16(b: Uint8Array, o: number): number {
  return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
}

/** STMIK's per-byte pattern key; `si` is the offset within the [u16 len][body] block. */
function key(si: number): number {
  return ((si * 4) ^ si) & 0xff;
}

interface S3mHeader {
  ordnum: number;
  insnum: number;
  patnum: number;
  /** File offset of the pattern parapointer table (one u16 paragraph pointer per pattern). */
  patParaOffset: number;
}

function readHeader(m: Uint8Array): S3mHeader {
  if ((u16(m, 0x2c) | (u16(m, 0x2e) << 16)) >>> 0 !== SCRM) {
    throw new Error('deobfuscateS3M: not an S3M module (missing SCRM signature)');
  }
  const ordnum = u16(m, 0x20);
  const insnum = u16(m, 0x22);
  const patnum = u16(m, 0x24);
  // Layout after the 96-byte header: order list (ordnum bytes), then insnum instrument
  // parapointers (2 bytes each), then patnum pattern parapointers (2 bytes each).
  return { ordnum, insnum, patnum, patParaOffset: 0x60 + ordnum + 2 * insnum };
}

/**
 * Walk every pattern with the standard ST3 cell decoder and report whether the module already
 * reads as valid standard S3M. STMIK-obfuscated patterns fail this (the cell walker runs past
 * the declared block length and produces impossible instrument/channel indices); a plain S3M
 * passes. Used both to detect obfuscation and to confirm de-obfuscation succeeded.
 */
function patternsAreValidS3M(m: Uint8Array, h: S3mHeader): boolean {
  for (let i = 0; i < h.patnum; i++) {
    const para = u16(m, h.patParaOffset + 2 * i);
    if (para === 0) continue; // empty pattern slot (all-empty 64 rows)
    const off = para << 4;
    if (off + 2 > m.length) return false;
    const len = u16(m, off);
    if (off + len > m.length) return false;
    let si = 2;
    for (let row = 0; row < 64; row++) {
      for (;;) {
        if (si >= len) return false; // ran out of bytes before the row terminator
        const cb = m[off + si++] ?? 0;
        if (cb === 0) break; // end of row
        if (cb & 0x20) {
          const inst = m[off + si + 1] ?? 0;
          si += 2;
          if (inst > h.insnum) return false; // instrument index out of range
        }
        if (cb & 0x40) si += 1;
        if (cb & 0x80) si += 2;
      }
    }
    if (si !== len) return false; // block length must match exactly
  }
  return true;
}

/** De-XOR the body of every pattern in place (the body is offsets [2, len) of each block). */
function dexorPatterns(m: Uint8Array, h: S3mHeader): void {
  for (let i = 0; i < h.patnum; i++) {
    const para = u16(m, h.patParaOffset + 2 * i);
    if (para === 0) continue;
    const off = para << 4;
    const len = u16(m, off);
    for (let si = 2; si < len; si++) m[off + si] = (m[off + si] ?? 0) ^ key(si);
  }
}

/**
 * Return a standard S3M for a Future Crew STMIK module. Pattern bodies are de-obfuscated; the
 * input is not mutated. Idempotent and safe on already-standard modules: if the patterns already
 * decode as valid S3M the bytes are returned unchanged. Throws only if the input is not an S3M,
 * or if de-obfuscation does not yield a valid module (a guard against shipping silent garbage).
 */
export function deobfuscateS3M(input: ArrayBuffer | Uint8Array): Uint8Array {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  const m = new Uint8Array(src); // fresh, exactly-sized copy (its .buffer is transferable)
  const h = readHeader(m);

  if (patternsAreValidS3M(m, h)) return m; // already standard (or already de-obfuscated)

  dexorPatterns(m, h);
  if (!patternsAreValidS3M(m, h)) {
    throw new Error('deobfuscateS3M: de-obfuscation did not produce a valid S3M');
  }
  return m;
}
