import { fromAbs, type Country, type ScheduledEvent } from '@ripple/schema';
import { chance } from './rng.js';
import type { WorldState } from './state.js';

export interface HazardContext {
  t: number;
  state: WorldState;
  countries: Country[];
  indicatorIndex: Map<string, number>;
}

/** Turns one country's state into a monthly probability of one event type. Stage 0 ships none; stage 1 adds the first 6–8. */
export interface Hazard {
  id: string;
  type: string;
  magnitude: number;
  rate(ctx: HazardContext, c: number): number; // 0..1, before gating
}

export interface GenerationGate {
  isBaseline: boolean;
  todayAbs: number;
  liveHistory: number; // 0..1, «живая история»
  gamma: number;
  divergence?: Float32Array; // by country, as of the start of the tick (player world)
}

/** Before «today» the baseline generates nothing and the player world plays hazards at hazard × max(liveHistory, divergence^gamma);
 *  after «today» both worlds play them in full on shared random numbers, so without interventions they draw the same future (ADR 0004). */
export function gateFactor(gate: GenerationGate, c: number, t: number): number {
  if (t > gate.todayAbs) return 1;
  if (gate.isBaseline) return 0;
  return Math.max(gate.liveHistory, Math.pow(gate.divergence?.[c] ?? 0, gate.gamma));
}

export function generateEvents(hazards: Hazard[], ctx: HazardContext, gate: GenerationGate, seed: number): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  if (hazards.length === 0) return out;
  const { year, month } = fromAbs(ctx.t);
  for (const h of hazards) {
    for (let c = 0; c < ctx.countries.length; c++) {
      if (ctx.state.active[c] === 0) continue;
      const g = gateFactor(gate, c, ctx.t);
      if (g === 0) continue;
      const p = h.rate(ctx, c) * g;
      if (p <= 0) continue;
      const id = ctx.countries[c]!.id;
      if (!chance(p, seed, 'gen', h.id, id, ctx.t)) continue;
      out.push({
        id: `gen-${h.id}-${id}-${ctx.t}`, type: h.type, origin: 'generated', year, month, countries: [id], scope: 'list',
        magnitude: h.magnitude, preconditions: [], delayMaxYears: 0, hooks: [],
      });
    }
  }
  return out;
}
