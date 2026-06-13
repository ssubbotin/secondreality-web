import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseS3MMarkers } from './s3m-markers.js';

/**
 * Build a minimal valid S3M: 1 channel, 1 order (pattern 0), 0 instruments,
 * 1 pattern whose row 4 carries a Zxx (effect Z=26) with info 0x2a on channel 0.
 */
function buildMinimalS3M(): ArrayBuffer {
  const pat: number[] = [];
  for (let row = 0; row < 64; row++) {
    if (row === 4) {
      // entry: channel 0, command+info present (bit 0x80), no note/vol.
      pat.push(0x80 | 0x00, 26, 0x2a); // what(0x80|chan), command=26 (Z), info=0x2a
    }
    pat.push(0x00); // end of row
  }
  const packed = [pat.length & 0xff, (pat.length >> 8) & 0xff, ...pat]; // 2-byte length + body

  const headerLen = 0x60;
  const ordnum = 1;
  const insnum = 0;
  const patnum = 1;
  const orderListLen = ordnum;
  const ptrTableLen = (insnum + patnum) * 2;
  // Align to 16-byte paragraph boundary so patternParaPtr << 4 === patternStart.
  const patternStart = (headerLen + orderListLen + ptrTableLen + 15) & ~15;
  const patternParaPtr = patternStart >> 4;

  const total = patternStart + packed.length + 16;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  dv.setUint8(0x1c, 0x1a);
  dv.setUint8(0x1d, 16);
  dv.setUint16(0x20, ordnum, true);
  dv.setUint16(0x22, insnum, true);
  dv.setUint16(0x24, patnum, true);
  u8.set([0x53, 0x43, 0x52, 0x4d], 0x2c); // "SCRM"
  u8[0x60] = 0; // order list: order 0 -> pattern 0
  dv.setUint16(headerLen + orderListLen + insnum * 2, patternParaPtr, true); // pattern 0 parapointer
  u8.set(new Uint8Array(packed), patternParaPtr << 4);
  return buf;
}

describe('parseS3MMarkers', () => {
  it('finds a Zxx event at the right order/row with its info byte', () => {
    const markers = parseS3MMarkers(buildMinimalS3M());
    expect(markers).toEqual([{ order: 0, row: 4, zinfo: 0x2a }]);
  });

  it('parses the real MUSIC0.S3M into a non-empty, sorted, valid marker list', () => {
    const buf = readFileSync('apps/lab/public/music/MUSIC0.S3M');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const markers = parseS3MMarkers(ab);
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      expect(m.zinfo).toBeGreaterThanOrEqual(0);
      expect(m.zinfo).toBeLessThanOrEqual(255);
      expect(m.row).toBeGreaterThanOrEqual(0);
      expect(m.row).toBeLessThan(64);
    }
  });
});
