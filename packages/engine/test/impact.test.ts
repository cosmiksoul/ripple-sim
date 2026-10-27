import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import {
  CatalogScorer, IndicatorStore, Journal, LinkGraph, applyActiveEvents, dynParamsFromMeta, initState, makeActiveEvent,
  monthlyFactor, type ImpactContext,
} from '@ripple/engine';
import { buildFixture, FIXTURE_EVENTS } from './fixtures/world.js';

function setup() {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const scorer = new CatalogScorer(content.eventTypes);
  const journal = new Journal(content.engine.journal);
  const ctx: ImpactContext = {
    state, params: dynParamsFromMeta(dataset.meta), meta: dataset.meta, countries: dataset.countries, indicatorIndex: store.indicatorIndex,
    channels: content.channels, graph: new LinkGraph(dataset.graph, store.countryIndex), spill: content.engine.spill, journal,
    todayAbs: dataset.meta.todayAbs,
  };
  return { dataset, content, store, state, scorer, journal, ctx };
}
const war = FIXTURE_EVENTS.find((e) => e.id === 'fx-war-1985')!;

describe('impact', () => {
  it('spreads shock over shockMonths then persists', () => {
    const { scorer } = setup();
    const ev = makeActiveEvent(war, [1], scorer, 'forward', 100); // war: shock 3, persist 24, ratio 1
    expect(monthlyFactor(ev, 100)).toBeCloseTo(1 / 3, 6);
    expect(monthlyFactor(ev, 102)).toBeCloseTo(1 / 3, 6);
    expect(monthlyFactor(ev, 103)).toBeCloseTo(1 / 24, 6);
    expect(monthlyFactor(ev, 126)).toBeCloseTo(1 / 24, 6);
    expect(monthlyFactor(ev, 127)).toBe(0);
  });

  it('a signal carries only its share of the info points for one month; the shock after it carries the rest', () => {
    const { scorer } = setup();
    const leak = { ...war, type: 'nuclear_accident' }; // magnitude 3: health −6, info −6, econ −2
    const signal = makeActiveEvent(leak, [1], scorer, 'forward', 100, { phase: 'signal', infoFactor: 0.5 });
    expect(signal.id).toBe('fx-war-1985#signal');
    expect(signal.phase).toBe('signal');
    expect(signal.points).toEqual({ econ: 0, safety: 0, health: 0, info: -3 });
    expect(signal.shockMonths).toBe(1);
    expect(signal.persistMonths).toBe(0);
    const shock = makeActiveEvent(leak, [1], scorer, 'forward', 102, { phase: 'shock', infoFactor: 0.5 });
    expect(shock.id).toBe('fx-war-1985');
    expect(shock.points.info).toBeCloseTo(-3, 6);
    expect(shock.points.health).toBeCloseTo(-6, 6);
    expect(makeActiveEvent(leak, [1], scorer, 'forward', 102).points.info).toBeCloseTo(-6, 6); // bare shock: everything
  });

  it('applies forward shocks to the country and spills to neighbours', () => {
    const { store, state, scorer, ctx, journal } = setup();
    const b = store.countryIndex.get('B')!, a = store.countryIndex.get('A')!, stab = store.indicatorIndex.get('stability')!;
    const before = state.x[state.idx(stab, b)]!;
    const t = absMonth(1985, 3);
    journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'forward', t)], t, ctx);
    journal.commit();
    // safety −15 × 1/3 × weight 1.0 = −5, plus econ −6 × 1/3 × (econ→stability 0.3) = −0.6
    expect(state.x[state.idx(stab, b)]).toBeCloseTo(before - 5 - 0.6, 4);
    // A is ring 1 (factor 0.25): −5 × 0.25 = −1.25 via safety, −2 × 0.25 × 0.3 = −0.15 via econ
    expect(state.x[state.idx(stab, a)]).toBeCloseTo(85 - 1.25 - 0.15, 4);
    const why = journal.why(stab, a, t);
    expect(why[0]!.cause).toBe('fx-war-1985');
    expect(why[0]!.from).toBe(b);
  });

  it('skips embedded shocks while real data exist, applies them after realUntil', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, econ = store.indicatorIndex.get('economy')!, stab = store.indicatorIndex.get('stability')!;
    const x0 = state.x[state.idx(econ, b)]!, s0 = state.x[state.idx(stab, b)]!;
    const t1 = absMonth(1985, 3);
    ctx.journal.begin(t1);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t1)], t1, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeCloseTo(x0, 6); // economy has real data until 1995 → embedded
    expect(state.x[state.idx(stab, b)]).toBeLessThan(s0); // stability is a prior → never embedded
    const t2 = absMonth(1997, 6);
    ctx.journal.begin(t2);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t2)], t2, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeLessThan(x0);
  });

  it('inverse applies with opposite sign only inside the real-data horizon', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, stab = store.indicatorIndex.get('stability')!, econ = store.indicatorIndex.get('economy')!;
    const s0 = state.x[state.idx(stab, b)]!, x0 = state.x[state.idx(econ, b)]!;
    const t = absMonth(1985, 3);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'inverse', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(stab, b)]).toBeCloseTo(s0, 6); // prior: realUntil < t → inverse skipped
    expect(state.x[state.idx(econ, b)]).toBeGreaterThan(x0); // war harms econ; inverse raises it
  });

  it('after «today» embedded shocks apply even where the series is a projection', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, econ = store.indicatorIndex.get('economy')!;
    const x0 = state.x[state.idx(econ, b)]!;
    const t = absMonth(1992, 6); // inside economy's realUntil (1995-12) but past a dataset whose «today» is 1990-12
    const early = { ...ctx, todayAbs: absMonth(1990, 12) };
    early.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t)], t, early);
    early.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeLessThan(x0);
  });

  it('does not subtract from a country that outlived its real end: its series is synthetic, nothing is embedded there', () => {
    const { store, state, scorer, ctx } = setup();
    const u = store.countryIndex.get('U')!, econ = store.indicatorIndex.get('economy')!;
    const x0 = state.x[state.idx(econ, u)]!; // U is still active in this unstepped state, but 1990-06 is past its real end (1989-12)
    const t = absMonth(1990, 6);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [u], scorer, 'inverse', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, u)]).toBeCloseTo(x0, 6);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [u], scorer, 'forward', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, u)]).toBeLessThan(x0);
  });
});
