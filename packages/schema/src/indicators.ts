import { z } from 'zod';

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
