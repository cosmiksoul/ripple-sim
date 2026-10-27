import { describe, expect, it } from 'vitest';
import { absMonth, type ScheduledEvent } from '@ripple/schema';
import { CatalogScorer, IndicatorStore, LinkGraph, Scheduler, initState, type HandoverContext, type SchedulerContext } from '@ripple/engine';
import { buildFixture, FIXTURE_EVENTS } from './fixtures/world.js';

function setup(isBaseline: boolean) {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const graph = new LinkGraph(dataset.graph, store.countryIndex);
  const scorer = new CatalogScorer(content.eventTypes);
  const scheduler = new Scheduler(FIXTURE_EVENTS, { isBaseline, seed: 1, leadOf: (type) => scorer.def(type).leadMonths });
  const handover: HandoverContext = {
    countries: dataset.countries, transitions: new Map(content.transitions.map((tr) => [tr.id, tr])),
    groupOf: (type) => scorer.def(type).group, retarget: new Set(content.engine.handover.retarget),
  };
  const ctx = (t: number, extra: Partial<SchedulerContext> = {}): SchedulerContext => ({
    t, state, countryIndex: store.countryIndex, indicatorIndex: store.indicatorIndex, graph, ...extra,
  });
  return { store, state, scheduler, ctx, handover };
}
const T_SPLIT = absMonth(1990, 1);

describe('Scheduler', () => {
  it('baseline fires on schedule as embedded and spawns hooks', () => {
    const { scheduler, ctx } = setup(true);
    const r = scheduler.tick(ctx(T_SPLIT));
    expect(r.firings.map((f) => f.event.id)).toEqual(['fx-u-split-1990']);
    expect(r.firings[0]!.mode).toBe('embedded');
    const next = scheduler.tick(ctx(T_SPLIT + 1));
    expect(next.firings.map((f) => f.event.id)).toEqual(['fx-u-split-1990#h0']);
    expect(next.firings[0]!.event.countries).toEqual(['U1', 'U2']);
    expect(scheduler.firedAt(T_SPLIT).has('fx-u-split-1990')).toBe(true);
  });

  it('player world: passing preconditions → embedded when mirrored, forward when not', () => {
    const base = setup(true);
    const player = setup(false);
    base.scheduler.tick(base.ctx(T_SPLIT));
    const r = player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990', 'embedded']]);
    const extra: ScheduledEvent = { id: 'player-1', type: 'investment', origin: 'player', year: 1990, month: 2, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 0, hooks: [] };
    player.scheduler.add(extra);
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r2.firings.map((f) => [f.event.id, f.mode]).sort()).toEqual([['fx-u-split-1990#h0', 'embedded'], ['player-1', 'forward']]);
  });

  it('player world: failing precondition → inverse now, delayed, then cancelled after the window', () => {
    const base = setup(true);
    const player = setup(false);
    const u = player.store.countryIndex.get('U')!, stab = player.store.indicatorIndex.get('stability')!;
    player.state.x[player.state.idx(stab, u)] = 90; // propped up: 90 ≥ baseline 60 + 15
    base.scheduler.tick(base.ctx(T_SPLIT));
    const r = player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990', 'inverse']]);
    expect(r.delayed).toEqual(['fx-u-split-1990']);
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r2.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990#h0', 'inverse']]); // baseline's hook, player never spawned it
    let cancelled: string[] = [];
    for (let t = T_SPLIT + 2; t <= T_SPLIT + 61; t++) {
      base.scheduler.tick(base.ctx(t));
      cancelled = cancelled.concat(player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t) })).cancelled);
    }
    expect(cancelled).toEqual(['fx-u-split-1990']);
    expect(player.scheduler.fired.has('fx-u-split-1990')).toBe(false);
  });

  it('player world: delayed event fires forward once the precondition clears', () => {
    const base = setup(true);
    const player = setup(false);
    const u = player.store.countryIndex.get('U')!, stab = player.store.indicatorIndex.get('stability')!;
    player.state.x[player.state.idx(stab, u)] = 90;
    base.scheduler.tick(base.ctx(T_SPLIT));
    player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    player.state.x[player.state.idx(stab, u)] = 60;
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r.firings.map((f) => [f.event.id, f.mode]).sort()).toEqual([['fx-u-split-1990#h0', 'inverse'], ['fx-u-split-1990', 'forward']]);
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 2, { baselineX: base.state.x, mirror: new Map() }));
    expect(r2.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990#h0', 'forward']]);
  });

  it('player world: real events on a country that exists only in the baseline move to the holder (nature) or diverge (the rest)', () => {
    const base = setup(true);
    const player = setup(false); // state as of 1980: U active, U1 not born
    const quake: ScheduledEvent = { id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] };
    const crash: ScheduledEvent = { ...quake, id: 'crash-u1', type: 'banking_crisis' };
    for (const s of [base.scheduler, player.scheduler]) { s.add(quake); s.add(crash); }
    const t = absMonth(1990, 6);
    base.scheduler.tick(base.ctx(t));
    const r = player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t), handover: player.handover }));
    expect(r.firings.map((f) => [f.event.id, f.event.countries.join(), f.mode])).toEqual([['quake-u1', 'U', 'forward']]);
    expect(r.retargeted).toEqual([{ id: 'quake-u1', from: 'U1', to: 'U' }]);
    expect(r.diverged).toEqual(['crash-u1']);
    expect(r.firings.some((f) => f.mode === 'inverse')).toBe(false); // nothing to subtract: U1 has no state in this world
    expect(player.scheduler.fired.has('quake-u1')).toBe(true);
    const again = player.scheduler.tick(player.ctx(t + 1, { baselineX: base.state.x, mirror: new Map(), handover: player.handover }));
    expect(again.diverged).toEqual([]); // a diverged event is gone, not pending
  });

  it('player world: an independence event is anchored on the parent, not on the newborn', () => {
    const base = setup(true);
    const player = setup(false); // E is not born yet, D is active
    const t = absMonth(1992, 1);
    base.scheduler.tick(base.ctx(t));
    const r = player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t), handover: player.handover }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-e-secede-1992', 'embedded']]);
    expect(r.diverged).toEqual([]);
  });

  it('signals a dated event leadMonths before its date and strikes on the date with the rest of the info', () => {
    const { scheduler, ctx } = setup(true);
    scheduler.add({ id: 'crash-a', type: 'banking_crisis', origin: 'real-A', year: 1983, month: 4, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] }); // banking_crisis: leadMonths 3
    const t0 = absMonth(1983, 1);
    const r = scheduler.tick(ctx(t0));
    expect(r.signalled).toEqual(['crash-a']);
    expect(r.firings.map((f) => [f.event.id, f.phase, f.mode])).toEqual([['crash-a', 'signal', 'embedded']]);
    expect(scheduler.fired.has('crash-a')).toBe(false);
    expect(scheduler.firedAt(t0).has('crash-a#signal')).toBe(true);
    expect(scheduler.tick(ctx(t0 + 1)).firings).toEqual([]);
    const r3 = scheduler.tick(ctx(t0 + 3));
    expect(r3.firings.map((f) => [f.event.id, f.phase, f.signalled])).toEqual([['crash-a', 'shock', true]]);
    expect(scheduler.fired.has('crash-a')).toBe(true);
  });

  it('player world: a fresh event is signalled the month it enters and strikes leadMonths later; lead 0 strikes at once', () => {
    const { scheduler, ctx, state } = setup(false);
    const t = absMonth(1983, 1);
    scheduler.add({ id: 'player-1', type: 'investment', origin: 'player', year: 1983, month: 1, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 0, hooks: [] }); // leadMonths 2
    scheduler.add({ id: 'player-2', type: 'earthquake', origin: 'player', year: 1983, month: 1, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 0, hooks: [] }); // leadMonths 0
    const r = scheduler.tick(ctx(t, { baselineX: state.x, mirror: new Map() }));
    expect(r.firings.map((f) => [f.event.id, f.phase, f.mode, f.signalled]).sort()).toEqual([['player-1', 'signal', 'forward', false], ['player-2', 'shock', 'forward', false]]);
    expect(r.signalled).toEqual(['player-1']);
    expect(scheduler.tick(ctx(t + 1, { baselineX: state.x, mirror: new Map() })).firings).toEqual([]);
    const r2 = scheduler.tick(ctx(t + 2, { baselineX: state.x, mirror: new Map() }));
    expect(r2.firings.map((f) => [f.event.id, f.phase, f.signalled])).toEqual([['player-1', 'shock', true]]);
  });

  it('player world: a signalled shock that fails its preconditions is averted once, stays pending and is mirrored inversely', () => {
    const base = setup(true);
    const player = setup(false);
    const u = player.store.countryIndex.get('U')!, stab = player.store.indicatorIndex.get('stability')!;
    const mirrored = (t: number) => player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t) });
    base.scheduler.tick(base.ctx(T_SPLIT - 6)); // dissolution: leadMonths 6
    const r = player.scheduler.tick(mirrored(T_SPLIT - 6));
    expect(r.firings.map((f) => [f.event.id, f.phase, f.mode])).toEqual([['fx-u-split-1990', 'signal', 'embedded']]);
    player.state.x[player.state.idx(stab, u)] = 90; // propped up after the warning
    base.scheduler.tick(base.ctx(T_SPLIT));
    const r2 = player.scheduler.tick(mirrored(T_SPLIT));
    expect(r2.averted).toEqual(['fx-u-split-1990']);
    expect(r2.delayed).toEqual(['fx-u-split-1990']);
    expect(r2.firings.map((f) => [f.event.id, f.phase, f.mode])).toEqual([['fx-u-split-1990', 'shock', 'inverse']]);
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r3 = player.scheduler.tick(mirrored(T_SPLIT + 1));
    expect(r3.averted).toEqual([]); // reported once
    expect(r3.delayed).toEqual(['fx-u-split-1990']);
  });

  it('skips the signal of an event added after its signal month and strikes it unsignalled', () => {
    const { scheduler, ctx, state } = setup(false);
    const t = absMonth(1983, 1);
    scheduler.tick(ctx(t, { baselineX: state.x, mirror: new Map() }));
    scheduler.add({ id: 'late', type: 'banking_crisis', origin: 'real-A', year: 1983, month: 3, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] }); // its signal month, 1982-12, is behind
    expect(scheduler.tick(ctx(t + 1, { baselineX: state.x, mirror: new Map() })).firings).toEqual([]);
    const r = scheduler.tick(ctx(t + 2, { baselineX: state.x, mirror: new Map() }));
    expect(r.firings.map((f) => [f.event.id, f.phase, f.signalled])).toEqual([['late', 'shock', false]]);
  });

  it('player world: an event diverged at its signal never strikes and is never subtracted', () => {
    const base = setup(true);
    const player = setup(false); // U active, U1 not born
    const crash: ScheduledEvent = { id: 'crash-u1', type: 'banking_crisis', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] };
    base.scheduler.add(crash);
    player.scheduler.add(crash);
    for (const t of [absMonth(1990, 3), absMonth(1990, 6)]) {
      base.scheduler.tick(base.ctx(t));
      const r = player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t), handover: player.handover }));
      expect(r.diverged).toEqual(t === absMonth(1990, 3) ? ['crash-u1'] : []);
      expect(r.firings.filter((f) => f.event.id === 'crash-u1')).toEqual([]);
    }
  });

  it('evaluates eventFired predicates', () => {
    const { scheduler, ctx, state } = setup(false);
    scheduler.add({ id: 'dep', type: 'protests', origin: 'real-A', year: 1980, month: 6, countries: ['A'], scope: 'list', magnitude: 2, preconditions: [{ kind: 'eventFired', event: 'root', fired: true }], delayMaxYears: 1, hooks: [] });
    const t = absMonth(1980, 6);
    expect(scheduler.tick(ctx(t, { baselineX: state.x, mirror: new Map() })).delayed).toEqual(['dep']);
    scheduler.add({ id: 'root', type: 'protests', origin: 'real-A', year: 1980, month: 7, countries: ['A'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 1, hooks: [] });
    const r = scheduler.tick(ctx(t + 1, { baselineX: state.x, mirror: new Map() }));
    expect(r.firings.map((f) => f.event.id).sort()).toEqual(['dep', 'root']);
  });

  it('fires a hook with delayMonths 0 in the same tick, after its parent', () => {
    const { scheduler, ctx } = setup(true);
    const t = absMonth(1983, 5);
    scheduler.add({
      id: 'quake-h', type: 'earthquake', origin: 'real-A', year: 1983, month: 5, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 0,
      hooks: [{ type: 'earthquake', target: 'self', delayMonths: 0, magnitude: 2, probability: 1 }],
    } as ScheduledEvent);
    const r = scheduler.tick(ctx(t));
    expect(r.firings.map((f) => [f.event.id, f.phase])).toEqual([['quake-h', 'shock'], ['quake-h#h0', 'shock']]);
    expect([...scheduler.firedAt(t).keys()]).toEqual(['quake-h', 'quake-h#h0']);
  });
});
