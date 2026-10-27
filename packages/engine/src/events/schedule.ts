import { absMonth, fromAbs, type Country, type EventGroup, type FollowUp, type Predicate, type ScheduledEvent, type Transition } from '@ripple/schema';
import type { LinkGraph } from '../graph.js';
import { chance } from '../rng.js';
import type { WorldState } from '../state.js';
import type { ApplyMode, Phase } from './impact.js';

/** Player world only: what to do with a real event whose country does not exist in this world (ADR 0005). */
export interface HandoverContext {
  countries: Country[]; // same order as countryIndex
  transitions: Map<string, Transition>; // an event that carries a transition is anchored on the transition's first `from` country
  groupOf: (type: string) => EventGroup;
  retarget: ReadonlySet<EventGroup>; // groups that move to the territory holder; all other groups diverge
}

export interface SchedulerContext {
  t: number;
  state: WorldState;
  baselineX?: Float32Array;
  countryIndex: Map<string, number>;
  indicatorIndex: Map<string, number>;
  graph: LinkGraph;
  mirror?: Map<string, Firing>; // what the baseline fired this tick, by phaseKey (player world only)
  handover?: HandoverContext;
}

/** Mirror and firedAt key: a signal and its shock are mirrored separately (ADR 0006). */
export const phaseKey = (id: string, phase: Phase): string => (phase === 'signal' ? `${id}#signal` : id);

export interface Firing {
  event: ScheduledEvent;
  mode: ApplyMode;
  phase: Phase;
  signalled: boolean; // shock only: its signal went out earlier, so the shock delivers the rest of the info points
}
export interface Retarget {
  id: string;
  from: string;
  to: string;
}
export interface TickResult {
  firings: Firing[];
  signalled: string[];
  delayed: string[];
  averted: string[]; // a signalled shock that failed its preconditions in its month; reported once, the event stays pending
  cancelled: string[];
  retargeted: Retarget[]; // «в реальности: …»
  diverged: string[]; // «история пошла иначе»
}

export interface SchedulerOptions {
  isBaseline: boolean;
  seed: number;
  startAbs?: number; // signals dated before the run start are skipped; default: nothing skipped
  leadOf?: (type: string) => number; // catalog leadMonths per type; default 0
}

export const eventAbs = (e: ScheduledEvent): number => absMonth(e.year, e.month);

interface Entry {
  event: ScheduledEvent;
  shockAbs: number;
  signalled: boolean;
  averted: boolean;
  dropped: boolean; // diverged at the signal: the shock never comes
}

function push(map: Map<number, Entry[]>, abs: number, entry: Entry): void {
  const list = map.get(abs);
  if (list) list.push(entry);
  else map.set(abs, [entry]);
}

export class Scheduler {
  private readonly signals = new Map<number, Entry[]>();
  private readonly shocks = new Map<number, Entry[]>();
  private pending: Entry[] = [];
  private live: Entry[] | null = null; // the work queue of the tick in progress: a hook due this very month joins it
  private readonly firedByTick = new Map<number, Map<string, Firing>>();
  private readonly divergedIds = new Set<string>();
  // `to` countries of transitions carried by shocks fired this tick, so same-tick hooks on a newborn country are not judged missing (player world)
  private readonly bornNow = new Set<string>();
  private now: number;
  readonly fired = new Set<string>(); // shocks only

  constructor(events: ScheduledEvent[], private readonly opts: SchedulerOptions) {
    this.now = opts.startAbs ?? Number.NEGATIVE_INFINITY;
    for (const e of events) this.add(e);
  }

  /** Dated events (real, hook) carry their shock month and are signalled leadMonths earlier; fresh ones (player, generated)
   *  carry the month they enter the world: the signal is that month, the shock leadMonths later. A signal month already
   *  behind the scheduler is skipped: the shock then goes out unsignalled, with all its points. */
  add(e: ScheduledEvent): void {
    const lead = e.leadMonths ?? this.opts.leadOf?.(e.type) ?? 0;
    const fresh = e.origin === 'player' || e.origin === 'generated';
    const date = eventAbs(e);
    const entry: Entry = { event: e, shockAbs: fresh ? date + lead : date, signalled: false, averted: false, dropped: false };
    if (this.live && entry.shockAbs < this.now) this.live.push(entry);
    else push(this.shocks, entry.shockAbs, entry);
    if (lead > 0 && entry.shockAbs - lead >= this.now) push(this.signals, entry.shockAbs - lead, entry);
  }

  firedAt(t: number): Map<string, Firing> {
    return this.firedByTick.get(t) ?? new Map();
  }

  tick(ctx: SchedulerContext): TickResult {
    const t = ctx.t;
    this.bornNow.clear();
    const firedNow = new Map<string, Firing>();
    this.firedByTick.set(t, firedNow);
    const result: TickResult = { firings: [], signalled: [], delayed: [], averted: [], cancelled: [], retargeted: [], diverged: [] };
    const signals = this.signals.get(t) ?? [];
    // New shocks first (in file order), then re-checked pending ones, then hooks of this month as their parents fire:
    // lets same-month dependencies resolve. The queue grows while it is walked.
    const queue = [...(this.shocks.get(t) ?? []), ...this.pending];
    this.live = queue;
    this.pending = [];
    this.now = t + 1;

    for (const entry of signals) {
      const e = entry.event;
      const moved = this.opts.isBaseline ? null : this.handover(e, ctx);
      if (moved === 'diverged') {
        entry.dropped = true;
        this.diverge(e.id, result);
        continue;
      }
      const ev = moved ?? e;
      entry.signalled = true;
      this.emit({ event: ev, mode: moved ? 'forward' : this.modeOf(e.id, 'signal', ctx), phase: 'signal', signalled: false }, firedNow, result);
      result.signalled.push(e.id);
      if (moved) result.retargeted.push({ id: e.id, from: e.countries[0]!, to: moved.countries[0]! });
    }

    for (let k = 0; k < queue.length; k++) {
      const entry = queue[k]!;
      if (entry.dropped) continue;
      const e = entry.event;
      const moved = this.opts.isBaseline ? null : this.handover(e, ctx);
      if (moved === 'diverged') {
        this.diverge(e.id, result);
        continue;
      }
      const ev = moved ?? e;
      if (this.opts.isBaseline || this.passes(ev, ctx)) {
        this.fire(ev, ctx, firedNow, result, entry.signalled, moved ? 'forward' : undefined);
        if (moved) result.retargeted.push({ id: e.id, from: e.countries[0]!, to: moved.countries[0]! });
      } else if (t - entry.shockAbs >= e.delayMaxYears * 12) {
        result.cancelled.push(e.id);
      } else {
        if (entry.signalled && !entry.averted) {
          entry.averted = true;
          result.averted.push(e.id);
        }
        this.pending.push(entry); // the original: handover is decided afresh on every tick
        result.delayed.push(e.id);
      }
    }

    this.live = null;

    if (!this.opts.isBaseline && ctx.mirror) {
      for (const [key, f] of ctx.mirror) {
        if (!firedNow.has(key) && !this.divergedIds.has(f.event.id)) result.firings.push({ ...f, mode: 'inverse' });
      }
    }
    return result;
  }

  private diverge(id: string, result: TickResult): void {
    this.divergedIds.add(id);
    result.diverged.push(id);
  }

  private modeOf(id: string, phase: Phase, ctx: SchedulerContext): ApplyMode {
    return this.opts.isBaseline || (ctx.mirror?.has(phaseKey(id, phase)) ?? false) ? 'embedded' : 'forward';
  }

  private emit(f: Firing, firedNow: Map<string, Firing>, result: TickResult): void {
    firedNow.set(phaseKey(f.event.id, f.phase), f);
    result.firings.push(f);
  }

  /** null = fire as is; 'diverged' = drop; otherwise the same event re-addressed to the territory holders. */
  private handover(e: ScheduledEvent, ctx: SchedulerContext): ScheduledEvent | 'diverged' | null {
    const h = ctx.handover;
    if (!h || e.scope === 'global') return null;
    // Independence events list the newborn first; what must exist is the country it leaves, i.e. the transition's `from`.
    const anchorId = (e.transition ? h.transitions.get(e.transition)?.from[0] : undefined) ?? e.countries[0]!;
    const anchor = ctx.countryIndex.get(anchorId);
    if (anchor === undefined || ctx.state.active[anchor] === 1 || this.bornNow.has(anchorId)) return null;
    if (!h.retarget.has(h.groupOf(e.type))) return 'diverged';
    const holders = [...new Set(e.countries.map((id) => this.holderOf(id, ctx, h)).filter((id): id is string => id !== null))];
    return holders.length === 0 ? 'diverged' : { ...e, countries: holders };
  }

  /** The active country that holds `id`'s territory in this world: itself, else the nearest active predecessor, else successor. */
  private holderOf(id: string, ctx: SchedulerContext, h: HandoverContext): string | null {
    const seen = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const c = ctx.countryIndex.get(cur);
      if (c === undefined) continue;
      if (ctx.state.active[c] === 1) return cur;
      const country = h.countries[c]!;
      queue.push(...country.predecessors, ...country.successors);
    }
    return null;
  }

  private fire(e: ScheduledEvent, ctx: SchedulerContext, firedNow: Map<string, Firing>, result: TickResult, signalled: boolean, forced?: ApplyMode): void {
    this.fired.add(e.id);
    if (e.transition && ctx.handover) for (const id of ctx.handover.transitions.get(e.transition)?.to ?? []) this.bornNow.add(id);
    this.emit({ event: e, mode: forced ?? this.modeOf(e.id, 'shock', ctx), phase: 'shock', signalled }, firedNow, result);
    e.hooks.forEach((h, idx) => {
      if (!chance(h.probability, this.opts.seed, 'hook', e.id, idx)) return;
      const countries = this.resolveTargets(h, e, ctx);
      if (countries.length === 0) return;
      const { year, month } = fromAbs(ctx.t + h.delayMonths);
      this.add({
        id: `${e.id}#h${idx}`, type: h.type, origin: 'hook', year, month, countries, scope: 'list',
        magnitude: h.magnitude, persistMonths: h.persistMonths, preconditions: [], delayMaxYears: 0, hooks: [],
      });
    });
  }

  private resolveTargets(h: FollowUp, e: ScheduledEvent, ctx: SchedulerContext): string[] {
    if (h.target === 'self') return e.countries;
    if (Array.isArray(h.target)) return h.target;
    const primary = ctx.countryIndex.get(e.countries[0]!);
    if (primary === undefined) return [];
    const ids = [...ctx.countryIndex.entries()];
    return ctx.graph.neighbors(primary, 'border', ctx.state.active).map((n) => ids.find(([, k]) => k === n.c)![0]);
  }

  private passes(e: ScheduledEvent, ctx: SchedulerContext): boolean {
    return e.preconditions.every((p) => this.evaluate(p, e, ctx));
  }

  private evaluate(p: Predicate, e: ScheduledEvent, ctx: SchedulerContext): boolean {
    if (p.kind === 'eventFired') return this.fired.has(p.event) === p.fired;
    const c = ctx.countryIndex.get(p.country ?? e.countries[0]!);
    const i = ctx.indicatorIndex.get(p.indicator);
    if (c === undefined || i === undefined || ctx.state.active[c] === 0) return false;
    const k = ctx.state.idx(i, c);
    const lhs = ctx.state.x[k]!;
    const rhs = typeof p.rhs === 'number' ? p.rhs : (ctx.baselineX?.[k] ?? lhs) + p.rhs.baselinePlus;
    return p.op === '<' ? lhs < rhs : lhs > rhs;
  }
}
