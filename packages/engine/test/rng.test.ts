import { describe, expect, it } from 'vitest';
import { chance, hashBytes, hashKeys, uniform, uniformInts } from '@ripple/engine';

describe('hash rng', () => {
  it('is deterministic and key-sensitive', () => {
    expect(hashKeys(7, 'event', 'ARM', 1988)).toBe(hashKeys(7, 'event', 'ARM', 1988));
    expect(hashKeys(7, 'event', 'ARM', 1988)).not.toBe(hashKeys(8, 'event', 'ARM', 1988));
    expect(hashKeys(7, 'a', 'b')).not.toBe(hashKeys(7, 'ab'));
    expect(uniformInts(1, 2, 3, 4, 5)).toBe(uniformInts(1, 2, 3, 4, 5));
    expect(uniformInts(1, 2, 3, 4, 5)).not.toBe(uniformInts(1, 2, 3, 4, 6));
  });
  it('is roughly uniform', () => {
    const buckets = new Array(10).fill(0);
    let sum = 0;
    const n = 20000;
    for (let k = 0; k < n; k++) {
      const u = uniform(42, 'u', k);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
      buckets[Math.floor(u * 10)]++;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const b of buckets) expect(b / n).toBeGreaterThan(0.08);
    const fast = new Array(10).fill(0);
    for (let k = 0; k < n; k++) fast[Math.floor(uniformInts(42, 1, k, 0, 0) * 10)]++;
    for (const b of fast) expect(b / n).toBeGreaterThan(0.08);
  });
  it('chance respects probability', () => {
    let hits = 0;
    for (let k = 0; k < 10000; k++) if (chance(0.3, 1, 'c', k)) hits++;
    expect(hits / 10000).toBeCloseTo(0.3, 1);
  });
  it('hashes bytes', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]));
    expect(a).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });
});
