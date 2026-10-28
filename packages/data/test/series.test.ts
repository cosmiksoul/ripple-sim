import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { aggregateYearly, fillMonthly, type Series } from '../pipeline/series.js';
import { transformValue } from '../pipeline/indicators.js';

describe('fillMonthly', () => {
  const first = absMonth(1980, 1), last = absMonth(1989, 12);
  it('anchors years at July, interpolates between, holds flat outside', () => {
    const target = new Float32Array(last - first + 1);
    const r = fillMonthly(new Map([[1982, 10], [1984, 30]]), first, last, target);
    expect(r).toEqual({ firstYear: 1982, lastYear: 1984 });
    expect(target[absMonth(1980, 1) - first]).toBe(10);
    expect(target[absMonth(1982, 7) - first]).toBe(10);
    expect(target[absMonth(1983, 7) - first]).toBeCloseTo(20, 5);
    expect(target[absMonth(1984, 7) - first]).toBe(30);
    expect(target[absMonth(1989, 12) - first]).toBe(30);
  });
  it('fillMonthly reports its first and last observed year', () => {
    const r = fillMonthly(new Map([[1991, 1], [1987, 2], [1995, 3]]), first, last, new Float32Array(last - first + 1));
    expect(r).toEqual({ firstYear: 1987, lastYear: 1995 });
  });
  it('returns null and leaves the target untouched without points', () => {
    const target = new Float32Array(3).fill(NaN);
    expect(fillMonthly(new Map(), first, first + 2, target)).toBeNull();
    expect(Number.isNaN(target[0])).toBe(true);
  });
});

describe('aggregateYearly', () => {
  const series: Series = new Map([
    ['A', new Map([[1990, 10], [2000, 20]])],
    ['B', new Map([[1990, 30]])],
  ]);
  const weights: Series = new Map([
    ['A', new Map([[1990, 1_000_000], [2000, 1_000_000]])],
    ['B', new Map([[1990, 3_000_000]])],
  ]);
  it('sums counts and weights indices by population', () => {
    expect(aggregateYearly(['A', 'B'], series, weights, 'sum').get(1990)).toBe(40);
    expect(aggregateYearly(['A', 'B'], series, weights, 'weightedMean').get(1990)).toBeCloseTo(25, 5);
  });
  it('needs at least half of the members', () => {
    expect(aggregateYearly(['A', 'B'], series, weights, 'sum').get(2000)).toBe(20);
    expect(aggregateYearly(['A', 'B', 'C'], series, weights, 'sum').has(2000)).toBe(false);
  });
});

describe('transformValue', () => {
  it('applies each rule kind and clamps indices to 0..100', () => {
    expect(transformValue({ kind: 'identity', source: 's' }, 42)).toBe(42);
    expect(transformValue({ kind: 'linear', lo: 30, hi: 90, source: 's' }, 60)).toBe(50);
    expect(transformValue({ kind: 'linear', lo: 30, hi: 90, source: 's' }, 100)).toBe(100);
    expect(transformValue({ kind: 'linear', lo: 1, hi: 0, source: 's' }, 0.25)).toBe(75);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 300)).toBe(0);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 150000)).toBe(100);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, Math.sqrt(300 * 150000))).toBeCloseTo(50, 5);
    expect(Number.isNaN(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 0))).toBe(true);
    expect(transformValue({ kind: 'log10', source: 's' }, 1e6)).toBe(6);
    expect(Number.isNaN(transformValue({ kind: 'prior' }, 1))).toBe(true);
  });
});
