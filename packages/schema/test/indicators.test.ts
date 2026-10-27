import { describe, expect, it } from 'vitest';
import { decodeGrid, encodeGrid, IndicatorsMeta, MISSING } from '@ripple/schema';

describe('int16 grid codec', () => {
  it('round-trips within quantization error and keeps NaN', () => {
    const src = Float32Array.from([0, 50, 100, NaN, 33.3]);
    const raw = encodeGrid(src, 0, 100);
    expect(raw[3]).toBe(MISSING);
    const back = decodeGrid(raw, 0, 100);
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[2]).toBeCloseTo(100, 2);
    expect(back[4]).toBeCloseTo(33.3, 2);
    expect(Number.isNaN(back[3])).toBe(true);
  });
  it('clips out-of-range values', () => {
    const back = decodeGrid(encodeGrid(Float32Array.from([-5, 105]), 0, 100), 0, 100);
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[1]).toBeCloseTo(100, 2);
  });
  it('parses meta', () => {
    const meta = IndicatorsMeta.parse({
      dataVersion: 'test',
      countries: ['A'],
      indicators: [
        { code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0, realUntil: 0, source: 'fixture' },
      ],
      firstAbs: 0,
      lastAbs: 11,
      todayAbs: 11,
    });
    expect(meta.indicators[0]?.prior).toBe(false);
  });
});
