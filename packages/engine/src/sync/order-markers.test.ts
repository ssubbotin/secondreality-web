import { describe, expect, it } from 'vitest';
import { computeZplusTable } from './order-markers.js';

const PLUS = 0xfe; // '+++'
const STOP = 0xff; // '---'

/** Minimal byte buffer computeZplusTable can read: order count at 0x20, order list at 0x60. */
function moduleWithOrders(orders: number[]): Uint8Array {
  const bytes = new Uint8Array(0x60 + orders.length);
  bytes[0x20] = orders.length & 0xff;
  bytes[0x21] = (orders.length >> 8) & 0xff;
  bytes.set(orders, 0x60);
  return bytes;
}

const zplusOf = (orders: number[]) => computeZplusTable(moduleWithOrders(orders));

describe('computeZplusTable — per-order np_zplus from +++ order markers', () => {
  it('zplus 1 when a +++ marker is immediately ahead', () => {
    expect(zplusOf([10, PLUS, 11])[0]).toBe(1);
  });

  it('zplus 2 when a +++ marker is immediately behind', () => {
    expect(zplusOf([PLUS, 11, 12])[1]).toBe(2);
  });

  it('zplus 3 when +++ markers bracket the order on both sides', () => {
    expect(zplusOf([PLUS, 11, PLUS])[1]).toBe(3);
  });

  it('zplus 0 for an order with no adjacent marker', () => {
    expect(zplusOf([10, 11, 12])[1]).toBe(0);
  });

  it('marker and stop slots themselves are 0 (never a live order)', () => {
    const t = zplusOf([10, PLUS, STOP, 12]);
    expect(t[1]).toBe(0); // the +++ slot
    expect(t[2]).toBe(0); // the --- slot
  });

  it('does not read out of range at the first or last order', () => {
    const t = zplusOf([PLUS, 11]);
    expect(t[1]).toBe(2); // prev (index 0) is +++
    expect(t.length).toBe(2);
  });

  it('matches MUSIC1 marker neighborhoods', () => {
    const m1 = [
      73, 39, 50, 254, 26, 28, 0, 27, 29, 27, 29, 1, 65, 5, 254, 2, 2, 34, 3, 254, 9, 17, 4, 7, 8,
      254, 13, 254, 10, 10, 11, 10, 12, 14, 47, 46, 15, 16, 254, 18, 41, 254, 30, 31, 32, 33, 254,
      51, 52, 254, 19, 24, 21, 20, 25, 22, 38, 6, 23, 54, 55, 254, 43, 44, 48, 49, 66, 254, 56, 67,
      40, 40, 53, 64, 58, 62, 254, 57, 42, 61, 61, 59, 45, 61, 61, 60, 60, 254, 35, 36, 37, 37, 254,
      68, 69, 70, 71, 254, 72, 255,
    ];
    const t = computeZplusTable(moduleWithOrders(m1));
    expect(t[2]).toBe(1); // +++ at 3 ahead
    expect(t[4]).toBe(2); // +++ at 3 behind
    expect(t[26]).toBe(3); // +++ at 25 behind and 27 ahead
    expect(t[6]).toBe(0); // no adjacent marker
  });

  it('matches MUSIC0 single-marker neighborhood (+++ at 27)', () => {
    const m0 = [
      0, 1, 9, 10, 19, 2, 3, 4, 5, 6, 7, 8, 11, 13, 31, 31, 255, 255, 50, 51, 49, 48, 52, 72, 47,
      70, 71, 254, 14, 15, 16, 17, 28, 21, 24, 30, 23, 20, 20, 35, 35, 29, 36, 39, 40, 41, 42, 43,
      44, 55, 56, 57, 58, 59, 60, 45, 61, 68, 20, 20, 33, 33, 24, 69, 255, 25, 26, 53, 54, 255, 63,
      64, 65, 66, 67, 45, 61, 62, 255, 255,
    ];
    const t = computeZplusTable(moduleWithOrders(m0));
    expect(t[26]).toBe(1); // +++ at 27 ahead
    expect(t[28]).toBe(2); // +++ at 27 behind
  });
});
