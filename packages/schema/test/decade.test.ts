import { describe, expect, it } from 'vitest';
import { absMonth, decadesOf, decodeDecadeInto, encodeDecade, type IndicatorsMeta } from '@ripple/schema';

function meta(): IndicatorsMeta {
  return {
    dataVersion: 't',
    countries: ['A', 'B'],
    indicators: [
      { code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0, realUntil: 0, prior: false, estimated: [], source: 'f' },
      { code: 'population', kind: 'log10count', min: 0, max: 13, stickiness: 0.5, offsetHalflifeYears: 30, noiseAmp: 0, realUntil: 0, prior: false, estimated: [], source: 'f' },
    ],
    firstAbs: absMonth(1985, 1),
    lastAbs: absMonth(1994, 12),
    todayAbs: absMonth(1994, 12),
  };
}

describe('decade files', () => {
  it('lists decades overlapping the range', () => {
    expect(decadesOf(meta())).toEqual([1980, 1990]);
  });
  it('round-trips values through decade blocks', () => {
    const m = meta();
    const nM = m.lastAbs - m.firstAbs + 1;
    const values = new Float32Array(2 * 2 * nM);
    for (let k = 0; k < values.length; k++) values[k] = (k % 97) / 10;
    const out = new Float32Array(values.length).fill(NaN);
    for (const d of decadesOf(m)) decodeDecadeInto(m, encodeDecade(m, values, d), d, out);
    for (let k = 0; k < values.length; k++) expect(out[k]).toBeCloseTo(values[k]!, 2);
  });
});
