import { CHANNELS, type Channel, type EventTypeDef, type ScheduledEvent } from '@ripple/schema';

export type ChannelPoints = Record<Channel, number>;

export interface ScoreContext {
  t: number;
  countries: number[]; // resolved indexes of the event's countries
}

/** Where an event's channel points come from. The catalog reads only type and magnitude; a model scorer (Jev, an LLM ensemble)
 *  may read the countries, the text and the context. Any scorer must be a pure function of its inputs for a fixed version:
 *  no network and no hidden state inside the tick (ADR 0002). Timing and spread stay catalog-driven via def(). */
export interface Scorer {
  def(typeId: string): EventTypeDef;
  score(ev: ScheduledEvent, ctx: ScoreContext): ChannelPoints;
}

export class CatalogScorer implements Scorer {
  private readonly types: Map<string, EventTypeDef>;
  constructor(defs: EventTypeDef[]) {
    this.types = new Map(defs.map((d) => [d.id, d]));
  }
  def(typeId: string): EventTypeDef {
    const d = this.types.get(typeId);
    if (!d) throw new Error(`unknown event type: ${typeId}`);
    return d;
  }
  points(typeId: string, magnitude: number): ChannelPoints {
    const d = this.def(typeId);
    const out = { econ: 0, safety: 0, health: 0, info: 0 } as ChannelPoints;
    for (const ch of CHANNELS) out[ch] = (d.impact[ch] ?? 0) * (magnitude / 3);
    return out;
  }
  score(ev: ScheduledEvent, _ctx: ScoreContext): ChannelPoints {
    return this.points(ev.type, ev.magnitude);
  }
}
