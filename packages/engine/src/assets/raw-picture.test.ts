import { describe, expect, it } from 'vitest';
import { decodeRawPicture, RAW_320x200 } from './raw-picture.js';

describe('decodeRawPicture (un-headered raw 8-bit page)', () => {
  it('RAW_320x200 is a 64000-byte mode-13h page', () => {
    expect(RAW_320x200).toBe(64000);
  });

  it('returns the first `size` bytes byte-for-byte in a fresh buffer', () => {
    const src = new Uint8Array(RAW_320x200 + 100);
    for (let i = 0; i < src.length; i++) src[i] = (i * 7) & 0xff;
    const out = decodeRawPicture(src);
    expect(out).toHaveLength(RAW_320x200);
    for (let i = 0; i < RAW_320x200; i++) expect(out[i]).toBe(src[i]);
    // a copy, not a view
    out[0] = (out[0] ?? 0) ^ 0xff;
    expect(out[0]).not.toBe(src[0]);
  });

  it('honours an explicit size', () => {
    const src = Uint8Array.from([1, 2, 3, 4, 5]);
    expect(Array.from(decodeRawPicture(src, 3))).toEqual([1, 2, 3]);
  });

  it('throws on a short buffer', () => {
    expect(() => decodeRawPicture(new Uint8Array(100))).toThrow();
    expect(() => decodeRawPicture(new Uint8Array(2), 3)).toThrow();
  });
});
