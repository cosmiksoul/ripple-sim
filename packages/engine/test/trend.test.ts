import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, Trend } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('Trend', () => {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const trend = new Trend(store, dataset.countries, content.analogs);
  const econ = store.indicatorIndex.get('economy')!;
  const id = (s: string) => store.countryIndex.get(s)!;

  it('serves the data as they are inside a country lifetime', () => {
    expect(trend.real(econ, id('U'), absMonth(1989, 12))).toBe(store.real(econ, id('U'), absMonth(1989, 12)));
    expect(trend.real(econ, id('A'), absMonth(2000, 1))).toBe(store.real(econ, id('A'), absMonth(2000, 1)));
    expect(trend.realUntil(econ)).toBe(store.realUntil(econ));
  });

  it('continues a dissolved country by its analog, scaled', () => {
    // U ends 1989-12 at 45; analog A climbs 1.25/year; scale 0.5 → +0.625 after 12 months
    expect(Number.isNaN(store.real(econ, id('U'), absMonth(1990, 12)))).toBe(true);
    expect(trend.real(econ, id('U'), absMonth(1990, 12))).toBeCloseTo(45 + 0.5 * 1.25, 3);
    expect(trend.real(econ, id('U'), absMonth(1990, 1))).toBeCloseTo(45 + (0.5 * 1.25) / 12, 3);
  });

  it('falls back to the median move of the subregion', () => {
    // G ends 1993-12 at 50; peer moves over the next year: A 1.25, C 1, U1/U2 0.5, B/D/E/F 0 (U is gone) → median 0.25
    expect(trend.real(econ, id('G'), absMonth(1994, 12))).toBeCloseTo(50.25, 3);
  });

  it('goes flat once the analog is flat and never serves NaN inside the grid', () => {
    expect(trend.real(econ, id('U'), absMonth(2004, 12))).toBeCloseTo(trend.real(econ, id('U'), absMonth(1995, 12)), 3);
    expect(Number.isNaN(trend.real(econ, id('U'), absMonth(2004, 12)))).toBe(false);
    expect(Number.isNaN(trend.real(econ, id('U'), absMonth(2005, 1)))).toBe(true); // outside the dataset range
  });
});
