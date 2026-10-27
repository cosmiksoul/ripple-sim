import { describe, expect, it } from 'vitest';
import { absMonth, decadesOf, encodeDecade } from '@ripple/schema';
import { IndicatorStore } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('IndicatorStore', () => {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  it('reads real values by indicator/country/month', () => {
    const e = store.indicatorIndex.get('economy')!;
    const a = store.countryIndex.get('A')!;
    expect(store.real(e, a, absMonth(1980, 1))).toBeCloseTo(50, 3);
    expect(store.real(e, a, absMonth(1995, 12))).toBeGreaterThan(69);
    expect(Number.isNaN(store.real(e, a, absMonth(1979, 12)))).toBe(true);
    expect(Number.isNaN(store.real(e, a, absMonth(2005, 1)))).toBe(true);
  });
  it('has no data for a dissolved country after its end', () => {
    const e = store.indicatorIndex.get('economy')!;
    const u = store.countryIndex.get('U')!;
    expect(store.real(e, u, absMonth(1989, 12))).toBeCloseTo(45, 3);
    expect(Number.isNaN(store.real(e, u, absMonth(1990, 1)))).toBe(true);
  });
  it('assembles from decade files', () => {
    const decades = new Map<number, Int16Array>();
    for (const d of decadesOf(dataset.meta)) decades.set(d, encodeDecade(dataset.meta, dataset.values, d));
    const assembled = IndicatorStore.assemble(dataset.meta, decades);
    expect(assembled.length).toBe(dataset.values.length);
    for (let k = 0; k < assembled.length; k += 97) {
      const a = assembled[k]!, v = dataset.values[k]!;
      if (Number.isNaN(v)) expect(Number.isNaN(a)).toBe(true);
      else expect(a).toBeCloseTo(v, 2);
    }
  });
});
