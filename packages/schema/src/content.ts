import { z } from 'zod';
import { Channel, EventGroup } from './events.js';
import { IndicatorKind } from './indicators.js';

export const IndicatorConfig = z.object({
  kind: IndicatorKind,
  min: z.number(),
  max: z.number(),
  stickiness: z.number().min(0).max(1),
  offsetHalflifeYears: z.number().positive(),
  noiseAmp: z.number().min(0),
});
export type IndicatorConfig = z.infer<typeof IndicatorConfig>;
export const IndicatorConfigs = z.record(z.string(), IndicatorConfig);

export const ChannelMap = z.record(Channel, z.record(z.string(), z.number()));
export type ChannelMap = z.infer<typeof ChannelMap>;

export const EngineConfig = z.object({
  journal: z.object({ maxTicks: z.number().int().positive(), topPerTick: z.number().int().positive(), minAbs: z.number().min(0) }),
  spill: z.object({ ringFactor: z.number().min(0).max(1), rings: z.record(Channel, z.number().int().min(0)) }),
  generation: z.object({ gamma: z.number().positive() }), // player world before «today»: hazard × max(liveHistory, divergence^gamma)
  handover: z.object({ retarget: z.array(EventGroup) }), // real events of these groups move to the territory holder; others are cancelled
  signal: z.object({ infoShare: z.number().min(0).max(1) }), // share of the info points the signal delivers; the shock delivers the rest (ADR 0006)
  horizon: z.object({ firstYear: z.number().int(), lastYear: z.number().int() }),
  divergenceSigma: z.number().positive(),
});
export type EngineConfig = z.infer<typeof EngineConfig>;

export const Priors = z.record(
  z.string(),
  z.object({ default: z.number(), bySubregion: z.record(z.string(), z.number()).default({}) }),
);
export type Priors = z.infer<typeof Priors>;

export const GeoConfig = z.object({
  principalTypes: z.array(z.string()).min(1), // Natural Earth TYPE values that mean "a state of its own"
  include: z.array(z.string()).default([]), // ADM0_A3 codes kept regardless of TYPE
  exclude: z.array(z.string()).default([]), // ADM0_A3 codes dropped regardless of TYPE
  idOverrides: z.record(z.string(), z.string()).default({}), // ADM0_A3 → our id
});
export type GeoConfig = z.infer<typeof GeoConfig>;

const Sourced = { source: z.string(), projection: z.boolean().optional() }; // projection: the source continues past «today» with a forecast
export const NormalizationRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('identity'), ...Sourced }),
  z.object({ kind: z.literal('linear'), lo: z.number(), hi: z.number(), ...Sourced }),
  z.object({ kind: z.literal('log'), lo: z.number().positive(), hi: z.number().positive(), ...Sourced }),
  z.object({ kind: z.literal('log10'), ...Sourced }),
  z.object({ kind: z.literal('prior') }),
  z.object({
    kind: z.literal('derived'),
    terms: z.array(z.object({ indicator: z.string(), weight: z.number(), invert: z.boolean().default(false) })).min(1),
  }),
]);
export type NormalizationRule = z.infer<typeof NormalizationRule>;
export const Normalization = z.record(z.string(), NormalizationRule);
export type Normalization = z.infer<typeof Normalization>;
