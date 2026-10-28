import { z } from 'zod';
import { MONTHS_PER_DECADE, decadeOf, decadeStartAbs } from './time.js';

export const IndicatorKind = z.enum(['index', 'rate', 'log10count']);
export type IndicatorKind = z.infer<typeof IndicatorKind>;

export const IndicatorMeta = z.object({
  code: z.string(),
  kind: IndicatorKind,
  min: z.number(),
  max: z.number(),
  stickiness: z.number().min(0).max(1),
  offsetHalflifeYears: z.number().positive(),
  noiseAmp: z.number().min(0),
  realFrom: z.number().int().optional(), // first abs month with observed data; absent = firstAbs (fixtures)
  realUntil: z.number().int(), // last abs month with observed data
  prior: z.boolean().default(false),
  estimated: z.array(z.string()).default([]),
  source: z.string(),
});
export type IndicatorMeta = z.infer<typeof IndicatorMeta>;

export const IndicatorsMeta = z.object({
  dataVersion: z.string(),
  countries: z.array(z.string()),
  indicators: z.array(IndicatorMeta),
  firstAbs: z.number().int(),
  lastAbs: z.number().int(),
  todayAbs: z.number().int(), // «сегодня»: last month covered by observed (non-projection) series; same for every run on this dataset
});
export type IndicatorsMeta = z.infer<typeof IndicatorsMeta>;

export const MISSING = -32768;
const Q = 32767;

export function encodeGrid(values: ArrayLike<number>, min: number, max: number): Int16Array {
  const out = new Int16Array(values.length);
  const span = max - min;
  for (let k = 0; k < values.length; k++) {
    const v = values[k] as number;
    if (Number.isNaN(v)) {
      out[k] = MISSING;
      continue;
    }
    const q = Math.round(((v - min) / span) * Q);
    out[k] = q < 0 ? 0 : q > Q ? Q : q;
  }
  return out;
}

export function decodeGrid(raw: Int16Array, min: number, max: number): Float32Array {
  const out = new Float32Array(raw.length);
  const span = max - min;
  for (let k = 0; k < raw.length; k++) {
    const q = raw[k] as number;
    out[k] = q === MISSING ? NaN : min + (q / Q) * span;
  }
  return out;
}

export function decadesOf(meta: Pick<IndicatorsMeta, 'firstAbs' | 'lastAbs'>): number[] {
  const out: number[] = [];
  for (let d = decadeOf(meta.firstAbs); d <= decadeOf(meta.lastAbs); d += 10) out.push(d);
  return out;
}

/** values: full grid [i][c][m], m = abs − firstAbs. Returns [i][c][120] block for the decade. */
export function encodeDecade(meta: IndicatorsMeta, values: Float32Array, decade: number): Int16Array {
  const nC = meta.countries.length;
  const nI = meta.indicators.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const start = decadeStartAbs(decade);
  const out = new Int16Array(nI * nC * MONTHS_PER_DECADE);
  const block = new Float32Array(nC * MONTHS_PER_DECADE);
  for (let i = 0; i < nI; i++) {
    const ind = meta.indicators[i]!;
    for (let c = 0; c < nC; c++) {
      for (let m = 0; m < MONTHS_PER_DECADE; m++) {
        const abs = start + m;
        const inRange = abs >= meta.firstAbs && abs <= meta.lastAbs;
        block[c * MONTHS_PER_DECADE + m] = inRange ? values[(i * nC + c) * nM + (abs - meta.firstAbs)]! : NaN;
      }
    }
    out.set(encodeGrid(block, ind.min, ind.max), i * nC * MONTHS_PER_DECADE);
  }
  return out;
}

export function decodeDecadeInto(meta: IndicatorsMeta, raw: Int16Array, decade: number, values: Float32Array): void {
  const nC = meta.countries.length;
  const nI = meta.indicators.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const start = decadeStartAbs(decade);
  for (let i = 0; i < nI; i++) {
    const ind = meta.indicators[i]!;
    const block = decodeGrid(raw.subarray(i * nC * MONTHS_PER_DECADE, (i + 1) * nC * MONTHS_PER_DECADE), ind.min, ind.max);
    for (let c = 0; c < nC; c++) {
      for (let m = 0; m < MONTHS_PER_DECADE; m++) {
        const abs = start + m;
        if (abs < meta.firstAbs || abs > meta.lastAbs) continue;
        values[(i * nC + c) * nM + (abs - meta.firstAbs)] = block[c * MONTHS_PER_DECADE + m]!;
      }
    }
  }
}
