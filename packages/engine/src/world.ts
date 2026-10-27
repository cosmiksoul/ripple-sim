import type { ChannelMap, Country, EngineConfig, ScheduledEvent, Transition } from '@ripple/schema';
import { stepIndicators, type DynParams } from './dynamics.js';
import type { Scorer } from './events/catalog.js';
import { applyActiveEvents, isExpired, makeActiveEvent, type ActiveEvent, type ApplyMode, type Phase } from './events/impact.js';
import { Scheduler, type Firing, type HandoverContext } from './events/schedule.js';
import type { LinkGraph } from './graph.js';
import { generateEvents, type Hazard } from './hazards.js';
import { Journal } from './journal.js';
import type { WorldState } from './state.js';
import type { IndicatorStore } from './store.js';
import { applyTransition } from './transitions.js';
import type { Trend } from './trend.js';

export interface WorldShared {
  store: IndicatorStore;
  trend: Trend;
  countries: Country[];
  params: DynParams[];
  graph: LinkGraph;
  scorer: Scorer;
  channels: ChannelMap;
  engine: EngineConfig;
  transitions: Map<string, Transition>;
  countryIndex: Map<string, number>;
  indicatorIndex: Map<string, number>;
  hazards: Hazard[];
  liveHistory: number;
  todayAbs: number;
  startAbs: number;
  seed: number;
}

export interface LogEntry {
  t: number;
  kind: 'signalled' | 'fired' | 'inverse' | 'delayed' | 'averted' | 'cancelled' | 'transition' | 'retargeted' | 'diverged';
  id: string;
  mode?: ApplyMode;
  phase?: Phase; // 'signal' on a signal firing (signalled, or the inverse of a signal); absent on shocks
  from?: string; // retargeted: where the event stood in reality («в реальности: …»)
  to?: string; // retargeted: the holder it moved to
}

export interface Mirror {
  x: Float32Array;
  fired: Map<string, Firing>; // by phaseKey: signals and shocks are mirrored separately
  divergence: Float32Array;
}

export class SimWorld {
  readonly scheduler: Scheduler;
  readonly journal: Journal;
  private readonly handover: HandoverContext | undefined;
  active: ActiveEvent[] = [];
  readonly log: LogEntry[] = [];

  constructor(readonly shared: WorldShared, readonly state: WorldState, events: ScheduledEvent[], readonly isBaseline: boolean) {
    this.scheduler = new Scheduler(events, {
      isBaseline, seed: shared.seed, startAbs: shared.startAbs, leadOf: (type) => shared.scorer.def(type).leadMonths,
    });
    this.journal = new Journal(shared.engine.journal);
    this.handover = isBaseline
      ? undefined
      : { countries: shared.countries, transitions: shared.transitions, groupOf: (type) => shared.scorer.def(type).group, retarget: new Set(shared.engine.handover.retarget) };
  }

  step(t: number, mirror?: Mirror): void {
    const sh = this.shared;
    this.journal.begin(t);
    const generated = generateEvents(
      sh.hazards,
      { t, state: this.state, countries: sh.countries, indicatorIndex: sh.indicatorIndex },
      { isBaseline: this.isBaseline, todayAbs: sh.todayAbs, liveHistory: sh.liveHistory, gamma: sh.engine.generation.gamma, divergence: mirror?.divergence },
      sh.seed,
    );
    for (const e of generated) this.scheduler.add(e);
    const res = this.scheduler.tick({
      t, state: this.state, baselineX: mirror?.x, countryIndex: sh.countryIndex, indicatorIndex: sh.indicatorIndex,
      graph: sh.graph, mirror: mirror?.fired, handover: this.handover,
    });
    for (const id of res.delayed) this.log.push({ t, kind: 'delayed', id });
    for (const id of res.averted) this.log.push({ t, kind: 'averted', id });
    for (const id of res.cancelled) this.log.push({ t, kind: 'cancelled', id });
    for (const id of res.diverged) this.log.push({ t, kind: 'diverged', id });
    for (const r of res.retargeted) this.log.push({ t, kind: 'retargeted', id: r.id, from: r.from, to: r.to });
    const share = sh.engine.signal.infoShare;
    for (const { event, mode, phase, signalled } of res.firings) {
      if (phase === 'shock' && mode !== 'inverse' && event.transition) {
        const tr = sh.transitions.get(event.transition);
        if (!tr) throw new Error(`event ${event.id}: unknown transition ${event.transition}`);
        applyTransition(tr, this.state, sh.trend, sh.countryIndex, t);
        this.log.push({ t, kind: 'transition', id: tr.id });
      }
      const countries = event.scope === 'global'
        ? Array.from(this.state.active, (a, c) => (a === 1 ? c : -1)).filter((c) => c >= 0)
        : event.countries.map((id) => sh.countryIndex.get(id)).filter((c): c is number => c !== undefined);
      // The signal carries `infoShare` of the info points; a shock that follows a signal carries the rest; a bare shock carries all.
      const infoFactor = phase === 'signal' ? share : signalled ? 1 - share : 1;
      this.active.push(makeActiveEvent(event, countries, sh.scorer, mode, t, { phase, infoFactor }));
      const kind = mode === 'inverse' ? 'inverse' : phase === 'signal' ? 'signalled' : 'fired';
      this.log.push(phase === 'signal' ? { t, kind, id: event.id, mode, phase } : { t, kind, id: event.id, mode });
    }
    applyActiveEvents(this.active, t, {
      state: this.state, params: sh.params, meta: sh.store.meta, countries: sh.countries, indicatorIndex: sh.indicatorIndex,
      channels: sh.channels, graph: sh.graph, spill: sh.engine.spill, journal: this.journal, todayAbs: sh.todayAbs,
    });
    this.active = this.active.filter((ev) => !isExpired(ev, t + 1));
    stepIndicators(this.state, sh.trend, sh.params, t, sh.seed);
    this.journal.commit();
  }
}
