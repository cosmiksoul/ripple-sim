import { describe, expect, it } from 'vitest';
import { absMonth, type Country, type HistoricalCountry, type Normalization } from '@ripple/schema';
import { buildGrid, type GridInputs } from '../pipeline/indicators.js';
import type { Series } from '../pipeline/series.js';

const FIRST = absMonth(1980, 1), LAST = absMonth(2009, 12);
const country = (id: string, subregion: string, extra: Partial<Country> = {}): Country => ({
  id, name: { ru: id, en: id }, region: 'R', subregion, from: null, to: null, successors: [], predecessors: [], historical: false, ...extra,
});
const historical: HistoricalCountry[] = [{ id: 'UUU', name: { ru: 'U', en: 'U' }, region: 'R', subregion: 'S1', members: ['AAA', 'BBB'], from: null, to: absMonth(1991, 12) - 1 }];
const countries: Country[] = [
  country('AAA', 'S1'), country('BBB', 'S1'), country('CCC', 'S2'),
  country('UUU', 'S1', { historical: true, to: absMonth(1991, 12) - 1, successors: ['AAA', 'BBB'] }),
];
const normalization: Normalization = {
  economy: { kind: 'log', lo: 300, hi: 150000, source: 'wdi:X' },
  stability: { kind: 'prior' },
  happiness: { kind: 'derived', terms: [{ indicator: 'economy', weight: 0.8, invert: false }, { indicator: 'economy', weight: 0.2, invert: true }] },
  population: { kind: 'log10', source: 'wpp:PopTotal', projection: true },
};
const cfg = {
  economy: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0 },
  stability: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.3, offsetHalflifeYears: 5, noiseAmp: 0 },
  happiness: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.2, offsetHalflifeYears: 8, noiseAmp: 0 },
  population: { kind: 'log10count' as const, min: 0, max: 13, stickiness: 0.5, offsetHalflifeYears: 30, noiseAmp: 0 },
};
const population: Series = new Map([
  ['AAA', new Map([[1990, 1_000_000], [2000, 2_000_000], [2005, 2_200_000]])], // 2005 is a projection point
  ['BBB', new Map([[1990, 1_000_000]])],
  ['CCC', new Map([[1985, 500_000]])],
]);
const economy: Series = new Map([
  ['AAA', new Map([[1990, 3000], [2000, 30000]])],
  ['CCC', new Map([[1985, 100]])],
]);
const inputs: GridInputs = {
  countries, historical, config: cfg, normalization, priors: { stability: { default: 50, bySubregion: { S1: 70 } } },
  raw: { economy, population }, population, firstAbs: FIRST, lastAbs: LAST,
};
const econ = (v: number) => (100 * Math.log(v / 300)) / Math.log(150000 / 300);

describe('buildGrid', () => {
  const { meta, values } = buildGrid(inputs);
  const nC = countries.length, nM = LAST - FIRST + 1;
  const at = (code: string, id: string, year: number, month: number) => {
    const i = meta.indicators.findIndex((m) => m.code === code), c = countries.findIndex((k) => k.id === id);
    return values[(i * nC + c) * nM + (absMonth(year, month) - FIRST)]!;
  };
  it('keeps indicator order from the config and country order from the input', () => {
    expect(meta.indicators.map((m) => m.code)).toEqual(['economy', 'stability', 'happiness', 'population']);
    expect(meta.countries).toEqual(['AAA', 'BBB', 'CCC', 'UUU']);
    expect(meta.firstAbs).toBe(FIRST);
    expect(meta.lastAbs).toBe(LAST);
  });
  it('transforms then interpolates, holds flat outside observations', () => {
    expect(at('economy', 'AAA', 1990, 7)).toBeCloseTo(econ(3000), 3);
    expect(at('economy', 'AAA', 1995, 7)).toBeCloseTo((econ(3000) + econ(30000)) / 2, 3);
    expect(at('economy', 'AAA', 1980, 1)).toBeCloseTo(econ(3000), 3);
    expect(at('economy', 'AAA', 2009, 12)).toBeCloseTo(econ(30000), 3);
    expect(at('population', 'AAA', 1995, 7)).toBeCloseTo((6 + Math.log10(2e6)) / 2, 4);
  });
  it('clamps to the config range and sets realUntil to the last observed December', () => {
    expect(at('economy', 'CCC', 1985, 7)).toBe(0);
    expect(meta.indicators[0]!.realUntil).toBe(absMonth(2000, 12));
    expect(meta.indicators[3]!.realUntil).toBe(absMonth(2005, 12));
  });
  it('sets «today» from observed sources only, ignoring projections', () => {
    expect(meta.todayAbs).toBe(absMonth(2000, 12)); // economy ends 2000; population runs to 2005 but is a projection
  });
  it('estimates missing countries from subregion peers and records them', () => {
    expect(meta.indicators[0]!.estimated).toEqual(['BBB']);
    expect(at('economy', 'BBB', 1995, 7)).toBeCloseTo(at('economy', 'AAA', 1995, 7), 5);
    expect(meta.indicators[3]!.estimated).toEqual([]);
  });
  it('aggregates historical historical from members: sums counts, weights indices', () => {
    expect(at('population', 'UUU', 1990, 7)).toBeCloseTo(Math.log10(2e6), 5);
    expect(at('economy', 'UUU', 1990, 7)).toBeCloseTo(econ(3000), 3);
  });
  it('fills priors by subregion and derives happiness', () => {
    expect(at('stability', 'AAA', 1985, 1)).toBe(70);
    expect(at('stability', 'CCC', 1985, 1)).toBe(50);
    expect(meta.indicators[1]).toMatchObject({ prior: true, realUntil: FIRST - 1, source: 'prior' });
    const e = at('economy', 'AAA', 1995, 7);
    expect(at('happiness', 'AAA', 1995, 7)).toBeCloseTo(0.8 * e + 0.2 * (100 - e), 3);
    expect(meta.indicators[2]).toMatchObject({ source: 'derived', realUntil: absMonth(2000, 12) });
  });
  it('leaves no NaN inside a lifetime and nothing but NaN after a historical country ends', () => {
    const u = countries.findIndex((k) => k.id === 'UUU');
    let nan = 0;
    meta.indicators.forEach((_, i) => {
      for (let c = 0; c < nC; c++) {
        for (let m = 0; m < nM; m++) {
          const v = values[(i * nC + c) * nM + m]!;
          const alive = c !== u || FIRST + m <= absMonth(1991, 12) - 1;
          if (alive && Number.isNaN(v)) nan++;
          if (!alive && !Number.isNaN(v)) nan++;
        }
      }
    });
    expect(nan).toBe(0);
    expect(Number.isNaN(at('economy', 'UUU', 1991, 12))).toBe(true);
    expect(Number.isNaN(at('economy', 'UUU', 1991, 11))).toBe(false);
  });
  it("cuts a successor's series before its from", () => {
    const from = absMonth(1995, 1);
    const cs = [...countries, country('SSS', 'S2', { from, predecessors: ['CCC'] })];
    const g = buildGrid({ ...inputs, countries: cs });
    const s = cs.length - 1, e = g.meta.indicators.findIndex((m) => m.code === 'economy');
    const cell = (abs: number) => g.values[(e * cs.length + s) * nM + (abs - FIRST)]!;
    expect(Number.isNaN(cell(from - 1))).toBe(true);
    expect(Number.isNaN(cell(FIRST))).toBe(true);
    expect(Number.isNaN(cell(from))).toBe(false);
  });
});
