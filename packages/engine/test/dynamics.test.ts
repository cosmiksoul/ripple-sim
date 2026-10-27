import { describe, expect, it } from 'vitest';
import { absMonth, type IndicatorsMeta } from '@ripple/schema';
import { IndicatorStore, WorldState, applyShock, dynParamsFromMeta, initState, stepIndicators } from '@ripple/engine';

function tiny(opts: { noiseAmp?: number; real?: (c: number, abs: number) => number } = {}) {
  const first = absMonth(1980, 1), last = absMonth(1999, 12);
  const meta: IndicatorsMeta = {
    dataVersion: 't', countries: ['A', 'B'], firstAbs: first, lastAbs: last, todayAbs: last,
    indicators: [{ code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.15, offsetHalflifeYears: 5, noiseAmp: opts.noiseAmp ?? 0, realUntil: last, prior: false, estimated: [], source: 'f' }],
  };
  const nM = last - first + 1;
  const values = new Float32Array(2 * nM);
  for (let c = 0; c < 2; c++) for (let m = 0; m < nM; m++) values[c * nM + m] = opts.real ? opts.real(c, first + m) : 50;
  const store = new IndicatorStore(meta, values);
  const countries = ['A', 'B'].map((id) => ({ id, name: { ru: id, en: id }, region: '', subregion: '', from: null, to: null, successors: [], predecessors: [], historical: false }));
  return { meta, store, countries, first, params: dynParamsFromMeta(meta) };
}

describe('dynamics', () => {
  it('initialises from real data at start month', () => {
    const { store, countries, first } = tiny({ real: (c) => (c === 0 ? 10 : 20) });
    const s = initState(store, countries, first);
    expect(s.x[0]).toBeCloseTo(10, 5);
    expect(s.x[1]).toBeCloseTo(20, 5);
    expect(Array.from(s.active)).toEqual([1, 1]);
  });

  it('converges to the real trend', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    s.x[0] = 10;
    for (let t = first; t < first + 60; t++) stepIndicators(s, store, params, t, 1);
    expect(Math.abs(s.x[0]! - 50)).toBeLessThan(0.1);
  });

  it('decays a shock with the configured half-life', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    applyShock(s, 0, 0, 10, params[0]!);
    expect(s.x[0]).toBeCloseTo(60, 5);
    for (let t = first; t < first + 120; t++) stepIndicators(s, store, params, t, 1);
    expect(s.offset[0]).toBeCloseTo(2.5, 1); // 10 · 2^(-120/60)
    expect(s.x[0]).toBeCloseTo(52.5, 0);
  });

  it('holds position when there is no real data', () => {
    const { store, countries, first, params } = tiny({ real: (_c, abs) => (abs < absMonth(1985, 1) ? 50 : NaN) });
    const s = initState(store, countries, first);
    for (let t = first; t < absMonth(1990, 1); t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(50, 3);
  });

  it('follows a moving real trend without lag and keeps a shock on top of it', () => {
    const { store, countries, first, params } = tiny({ real: (_c, abs) => 20 + (abs - absMonth(1980, 1)) });
    const s = initState(store, countries, first);
    for (let t = first; t < first + 24; t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(44, 3);
    applyShock(s, 0, 0, 10, params[0]!);
    for (let t = first + 24; t < first + 36; t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(56 + 10 * Math.pow(2, -12 / 60), 0);
  });

  it('clamps index indicators to bounds', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    applyShock(s, 0, 0, 80, params[0]!);
    expect(s.x[0]).toBe(100);
  });

  it('skips inactive countries and is seed-deterministic', () => {
    const { store, countries, first, params } = tiny({ noiseAmp: 0.5 });
    const a = initState(store, countries, first);
    a.active[1] = 0;
    const b = a.clone();
    for (let t = first; t < first + 24; t++) {
      stepIndicators(a, store, params, t, 7);
      stepIndicators(b, store, params, t, 7);
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.x[1]).toBeCloseTo(50, 5);
    const c = initState(store, countries, first);
    for (let t = first; t < first + 24; t++) stepIndicators(c, store, params, t, 8);
    expect(c.x[0]).not.toBe(a.x[0]);
  });
});
