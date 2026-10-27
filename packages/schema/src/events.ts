import { z } from 'zod';
import { LocalizedText } from './countries.js';
import { LinkType } from './graph.js';

export const Channel = z.enum(['econ', 'safety', 'health', 'info']);
export type Channel = z.infer<typeof Channel>;
export const CHANNELS: readonly Channel[] = ['econ', 'safety', 'health', 'info'];

export const EventGroup = z.enum(['economy', 'politics', 'conflict', 'nature', 'society']);
export type EventGroup = z.infer<typeof EventGroup>;

export const EventTypeDef = z.object({
  id: z.string(),
  group: EventGroup,
  impact: z.record(Channel, z.number()).default({}), // points at magnitude 3; + good, − harm
  leadMonths: z.number().int().min(0).default(0), // months from the signal to the shock; 0 = no signal (ADR 0006)
  shockMonths: z.number().int().min(1).default(1),
  persistMonths: z.number().int().min(0).default(0),
  persistRatio: z.number().min(0).default(0), // persist total = ratio × shock total
  spreadBias: z.record(LinkType, z.number()).default({}),
  playerAllowed: z.boolean().default(false),
  headlines: z.object({ ru: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }),
  signalHeadlines: z.object({ ru: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }).optional(), // required when leadMonths > 0 (content test)
});
export type EventTypeDef = z.infer<typeof EventTypeDef>;

export const Predicate = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('indicator'),
    indicator: z.string(),
    country: z.string().optional(), // default: primary country of the event
    op: z.enum(['<', '>']),
    rhs: z.union([z.number(), z.object({ baselinePlus: z.number() })]),
  }),
  z.object({ kind: z.literal('eventFired'), event: z.string(), fired: z.boolean().default(true) }),
]);
export type Predicate = z.infer<typeof Predicate>;

export const FollowUp = z.object({
  type: z.string(),
  target: z.union([z.literal('self'), z.literal('neighbors'), z.array(z.string())]),
  delayMonths: z.number().int().min(0),
  magnitude: z.number().int().min(1).max(5),
  probability: z.number().min(0).max(1).default(1),
  persistMonths: z.number().int().min(0).optional(),
});
export type FollowUp = z.infer<typeof FollowUp>;

export const EventOrigin = z.enum(['real-A', 'real-B', 'real-C', 'hook', 'player', 'generated']);
export type EventOrigin = z.infer<typeof EventOrigin>;

export const ScheduledEvent = z.object({
  id: z.string(),
  type: z.string(),
  origin: EventOrigin,
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  countries: z.array(z.string()).min(1), // first is primary
  scope: z.enum(['list', 'global']).default('list'),
  magnitude: z.number().int().min(1).max(5),
  shockMonths: z.number().int().min(1).optional(),
  persistMonths: z.number().int().min(0).optional(),
  leadMonths: z.number().int().min(0).optional(), // overrides the type's lead for this one event
  preconditions: z.array(Predicate).default([]),
  delayMaxYears: z.number().int().min(0).default(5),
  hooks: z.array(FollowUp).default([]),
  transition: z.string().optional(),
  text: LocalizedText.optional(),
  source: z.string().optional(),
});
export type ScheduledEvent = z.infer<typeof ScheduledEvent>;

export const PlayerEvent = z.object({
  type: z.string(),
  country: z.string(),
  magnitude: z.number().int().min(1).max(5),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});
export type PlayerEvent = z.infer<typeof PlayerEvent>;
