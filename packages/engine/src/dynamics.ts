import type { IndicatorKind, IndicatorsMeta } from '@ripple/schema';
import { uniformInts } from './rng.js';
import type { WorldState } from './state.js';
import type { RealSource } from './store.js';

export interface DynParams {
  stickiness: number;
  decayPerMonth: number;
  noiseAmp: number;
  min: number;
  max: number;
  kind: IndicatorKind;
}

const NOISE_TAG = 0x4e4f4953;

export function dynParamsFromMeta(meta: IndicatorsMeta): DynParams[] {
  return meta.indicators.map((m) => ({
    stickiness: m.stickiness,
    decayPerMonth: Math.pow(2, -1 / (m.offsetHalflifeYears * 12)),
    noiseAmp: m.noiseAmp,
    min: m.min,
    max: m.max,
    kind: m.kind,
  }));
}

function clamp(v: number, p: DynParams): number {
  if (p.kind !== 'index') return v;
  return v < p.min ? p.min : v > p.max ? p.max : v;
}

/** Immediate displacement that then decays with the indicator's half-life. */
export function applyShock(state: WorldState, i: number, c: number, amount: number, p: DynParams): void {
  const k = state.idx(i, c);
  state.offset[k] = state.offset[k]! + amount;
  state.x[k] = clamp(state.x[k]! + amount, p);
}

/** Advance all active countries from month t to t+1.
 *  The real series' increment and the offset's decay are both applied to x in full
 *  (baseline == data when nothing was touched); stickiness only closes the residual gap
 *  x - (real + offset) left by noise, clamping or rebasing. */
export function stepIndicators(state: WorldState, real: RealSource, params: DynParams[], t: number, seed: number): void {
  const { nC, nI } = state;
  for (let i = 0; i < nI; i++) {
    const p = params[i]!;
    for (let c = 0; c < nC; c++) {
      if (state.active[c] === 0) continue;
      const k = i * nC + c;
      const prev = state.offset[k]!;
      const off = prev * p.decayPerMonth;
      state.offset[k] = off;
      const realNow = real.real(i, c, t);
      const realNext = real.real(i, c, t + 1);
      const shift = Number.isNaN(realNow) || Number.isNaN(realNext) ? 0 : realNext - realNow;
      const base = state.x[k]! + shift + (off - prev);
      const trend = Number.isNaN(realNext) ? base : realNext + off;
      const noise = p.noiseAmp === 0 ? 0 : p.noiseAmp * (uniformInts(seed, NOISE_TAG, i, c, t + 1) - 0.5);
      state.x[k] = clamp(base + p.stickiness * (trend - base) + noise, p);
    }
  }
}
