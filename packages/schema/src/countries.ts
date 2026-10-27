import { z } from 'zod';

export const LocalizedText = z.object({ ru: z.string(), en: z.string() });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Country = z.object({
  id: z.string().min(1).max(4), // synthetic fixtures use one-letter ids; real data carries ISO-style codes
  name: LocalizedText,
  region: z.string(),
  subregion: z.string(),
  from: z.number().int().nullable(), // first abs month of existence; null = since data horizon
  to: z.number().int().nullable(), // last abs month of existence; null = still exists
  successors: z.array(z.string()).default([]),
  predecessors: z.array(z.string()).default([]),
  historical: z.boolean().default(false),
});
export type Country = z.infer<typeof Country>;
export const Countries = z.array(Country);

export const Transition = z.object({
  id: z.string(),
  abs: z.number().int(), // month at whose start the transition applies (baseline)
  kind: z.enum(['split', 'merge', 'secede']),
  from: z.array(z.string()).min(1),
  to: z.array(z.string()).min(1),
  eventId: z.string().optional(),
});
export type Transition = z.infer<typeof Transition>;
export const Transitions = z.array(Transition);

export const HistoricalCountry = z.object({
  id: z.string().min(3).max(4),
  name: LocalizedText,
  region: z.string(),
  subregion: z.string(),
  members: z.array(z.string()).min(1), // modern ids whose data are aggregated into this country
  from: z.number().int().nullable(),
  to: z.number().int(),
});
export type HistoricalCountry = z.infer<typeof HistoricalCountry>;

/** Dependent land with its own geometry but no indicators; drawn in the parent's colour. */
export const Territory = z.object({
  id: z.string().min(3).max(4),
  name: LocalizedText,
  parent: z.string().min(3).max(4), // id of the country that holds it
});
export type Territory = z.infer<typeof Territory>;
export const Territories = z.array(Territory);

/** How a country that outlives its real end continues its trend: real[t] = real[end] + scale × (analog[t − shift] − analog[end − shift]). */
export const AnalogRule = z.object({
  analog: z.string(),
  shiftYears: z.number().int().default(0),
  scale: z.number().positive().default(1),
});
export type AnalogRule = z.infer<typeof AnalogRule>;
export const Analogs = z.record(z.string(), AnalogRule);
export type Analogs = z.infer<typeof Analogs>;

export function existsAt(c: Pick<Country, 'from' | 'to'>, abs: number): boolean {
  return (c.from === null || c.from <= abs) && (c.to === null || abs <= c.to);
}
