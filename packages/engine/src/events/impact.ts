import { CHANNELS, type ChannelMap, type Country, type EngineConfig, type IndicatorsMeta, type LinkType, type ScheduledEvent } from '@ripple/schema';
import { applyShock, type DynParams } from '../dynamics.js';
import type { LinkGraph } from '../graph.js';
import type { Journal } from '../journal.js';
import type { WorldState } from '../state.js';
import type { ChannelPoints, Scorer } from './catalog.js';

export type ApplyMode = 'embedded' | 'forward' | 'inverse';
export type Phase = 'signal' | 'shock';

export interface ActiveEvent {
  id: string; // `${event.id}#signal` for a signal
  typeId: string;
  countries: number[];
  global: boolean;
  points: ChannelPoints;
  startAbs: number;
  shockMonths: number;
  persistMonths: number;
  persistRatio: number;
  mode: ApplyMode;
  phase: Phase;
  spreadBias: Partial<Record<LinkType, number>>;
}

export interface ActivePhase {
  phase: Phase;
  infoFactor: number; // share of the info points this phase delivers: the signal takes `signal.infoShare`, a signalled shock the rest, a bare shock all
}

export function makeActiveEvent(
  ev: ScheduledEvent, countries: number[], scorer: Scorer, mode: ApplyMode, startAbs: number,
  at: ActivePhase = { phase: 'shock', infoFactor: 1 },
): ActiveEvent {
  const def = scorer.def(ev.type);
  const pts = scorer.score(ev, { t: startAbs, countries });
  const signal = at.phase === 'signal';
  return {
    id: signal ? `${ev.id}#signal` : ev.id,
    typeId: ev.type,
    countries,
    global: ev.scope === 'global',
    points: signal ? { econ: 0, safety: 0, health: 0, info: pts.info * at.infoFactor } : { ...pts, info: pts.info * at.infoFactor },
    startAbs,
    shockMonths: signal ? 1 : ev.shockMonths ?? def.shockMonths,
    persistMonths: signal ? 0 : ev.persistMonths ?? def.persistMonths,
    persistRatio: def.persistRatio,
    mode,
    phase: at.phase,
    spreadBias: def.spreadBias,
  };
}

/** Share of the total points delivered in month t. Shock phase delivers 1 in total; persist phase delivers persistRatio in total. */
export function monthlyFactor(ev: ActiveEvent, t: number): number {
  const age = t - ev.startAbs;
  if (age < 0) return 0;
  if (age < ev.shockMonths) return 1 / ev.shockMonths;
  if (age < ev.shockMonths + ev.persistMonths) return ev.persistMonths === 0 ? 0 : ev.persistRatio / ev.persistMonths;
  return 0;
}

export function isExpired(ev: ActiveEvent, t: number): boolean {
  return t - ev.startAbs >= ev.shockMonths + ev.persistMonths;
}

export interface ImpactContext {
  state: WorldState;
  params: DynParams[];
  meta: IndicatorsMeta;
  countries: Country[];
  indicatorIndex: Map<string, number>;
  channels: ChannelMap;
  graph: LinkGraph;
  spill: EngineConfig['spill'];
  journal: Journal;
  todayAbs: number;
}

/** True while the series of country c still carries the real effect of events at t: the indicator is observed up to t,
 *  t is not past «today» (after today every series is a projection), and the country has not outlived its real end
 *  (after that its series is synthetic, see trend.ts). */
export function insideData(ctx: ImpactContext, i: number, c: number, t: number): boolean {
  const end = ctx.countries[c]!.to;
  return t <= Math.min(ctx.meta.indicators[i]!.realUntil, ctx.todayAbs) && (end === null || t <= end);
}

export function appliesTo(mode: ApplyMode, inside: boolean): boolean {
  if (mode === 'embedded') return !inside;
  if (mode === 'inverse') return inside;
  return true;
}

export function applyActiveEvents(active: ActiveEvent[], t: number, ctx: ImpactContext): void {
  const { state, journal } = ctx;
  for (const ev of active) {
    const f = monthlyFactor(ev, t);
    if (f === 0) continue;
    const sign = ev.mode === 'inverse' ? -1 : 1;
    const origins = ev.countries.filter((c) => state.active[c] === 1);
    if (origins.length === 0) continue;
    for (const ch of CHANNELS) {
      const pts = ev.points[ch] * f;
      if (pts === 0) continue;
      const targets = ev.global
        ? new Map<number, number>()
        : ctx.graph.spillTargets(origins, ctx.spill.rings[ch] ?? 0, ctx.spill.ringFactor, ev.spreadBias, state.active);
      for (const [code, weight] of Object.entries(ctx.channels[ch] ?? {})) {
        const i = ctx.indicatorIndex.get(code);
        if (i === undefined) continue;
        const delta = pts * weight * sign;
        const p = ctx.params[i]!;
        for (const c of origins) {
          if (!appliesTo(ev.mode, insideData(ctx, i, c, t))) continue;
          applyShock(state, i, c, delta, p);
          journal.record({ t, i, c, amount: delta, cause: ev.id, channel: ch });
        }
        for (const [c, factor] of targets) {
          if (!appliesTo(ev.mode, insideData(ctx, i, c, t))) continue;
          applyShock(state, i, c, delta * factor, p);
          journal.record({ t, i, c, amount: delta * factor, cause: ev.id, from: origins[0], channel: ch });
        }
      }
    }
  }
}
