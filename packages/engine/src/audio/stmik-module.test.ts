import { describe, expect, it } from 'vitest';
import { deobfuscateS3M } from './stmik-module.js';

// STMIK's pattern obfuscation key, mirrored here to forge a Future-Crew-style module from a
// known-standard one (the inverse of what deobfuscateS3M reverses).
const key = (si: number) => ((si * 4) ^ si) & 0xff;

/**
 * Build a minimal but valid standard S3M: 1 order, 1 instrument slot, 1 pattern. The pattern
 * has real data on rows 0-1 (note+inst+vol+cmd, then note+inst) and 62 empty rows, so the
 * standard ST3 cell walker consumes exactly the declared block length.
 */
function buildStandardS3M(): Uint8Array {
  const patPara = 7; // pattern block at paragraph 7 => file offset 0x70
  const patOff = patPara << 4;

  const body = [
    // row 0: channel 0, note C-4 (0x40), instrument 1, volume 32, command A (1) info 0x06
    0x20 | 0x40 | 0x80 | 0,
    0x40,
    0x01,
    0x20,
    0x01,
    0x06,
    0x00,
    // row 1: channel 0, note C#4 (0x41), instrument 1
    0x20 | 0,
    0x41,
    0x01,
    0x00,
    // rows 2..63: empty (single end-of-row byte each)
    ...new Array(62).fill(0x00),
  ];
  const len = 2 + body.length;

  const size = patOff + len;
  const m = new Uint8Array(size);
  // header
  m[0x1c] = 0x1a; // EOF marker
  m[0x1d] = 0x10; // type = ST3 module
  m[0x20] = 1; // ordnum = 1
  m[0x22] = 1; // insnum = 1
  m[0x24] = 1; // patnum = 1
  m.set([0x53, 0x43, 0x52, 0x4d], 0x2c); // 'SCRM'
  // order list (1 byte) at 0x60
  m[0x60] = 0;
  // instrument parapointer (1 * u16) at 0x61 — empty instrument (0)
  m[0x61] = 0;
  m[0x62] = 0;
  // pattern parapointer (1 * u16) at 0x63
  m[0x63] = patPara & 0xff;
  m[0x64] = (patPara >> 8) & 0xff;
  // pattern block at patOff: [u16 len][body]
  m[patOff] = len & 0xff;
  m[patOff + 1] = (len >> 8) & 0xff;
  m.set(body, patOff + 2);
  return m;
}

/** Apply STMIK's XOR to every pattern body, turning a standard S3M into an FC-style module. */
function obfuscate(standard: Uint8Array): Uint8Array {
  const m = new Uint8Array(standard);
  const patPara = m[0x63] | (m[0x64] << 8);
  const off = patPara << 4;
  const len = m[off] | (m[off + 1] << 8);
  for (let si = 2; si < len; si++) m[off + si] ^= key(si);
  return m;
}

describe('deobfuscateS3M', () => {
  it('recovers the standard pattern bytes from an obfuscated module', () => {
    const standard = buildStandardS3M();
    const obfuscated = obfuscate(standard);
    // Sanity: obfuscation actually changed the pattern body.
    expect(Buffer.from(obfuscated)).not.toEqual(Buffer.from(standard));

    const recovered = deobfuscateS3M(obfuscated);
    expect(Buffer.from(recovered)).toEqual(Buffer.from(standard));
  });

  it('is idempotent: an already-standard module is returned unchanged', () => {
    const standard = buildStandardS3M();
    const once = deobfuscateS3M(standard);
    expect(Buffer.from(once)).toEqual(Buffer.from(standard));
    // Running it again on the (already standard) result must not corrupt it.
    const twice = deobfuscateS3M(once);
    expect(Buffer.from(twice)).toEqual(Buffer.from(standard));
  });

  it('does not mutate the caller-supplied buffer', () => {
    const obfuscated = obfuscate(buildStandardS3M());
    const before = Buffer.from(obfuscated);
    deobfuscateS3M(obfuscated);
    expect(Buffer.from(obfuscated)).toEqual(before);
  });

  it('accepts an ArrayBuffer as well as a Uint8Array', () => {
    const standard = buildStandardS3M();
    const obfuscated = obfuscate(standard);
    const ab = obfuscated.buffer.slice(0) as ArrayBuffer;
    const recovered = deobfuscateS3M(ab);
    expect(Buffer.from(recovered)).toEqual(Buffer.from(standard));
  });

  it('throws on a non-S3M buffer', () => {
    expect(() => deobfuscateS3M(new Uint8Array(0x80))).toThrow(/not an S3M/);
  });
});
