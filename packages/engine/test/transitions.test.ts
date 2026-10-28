import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, applyTransition, initState } from '@ripple/engine';
import { buildFixture, FIXTURE_TRANSITIONS } from './fixtures/world.js';

function setup() {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const id = (s: string) => store.countryIndex.get(s)!;
  const ind = (s: string) => store.indicatorIndex.get(s)!;
  return { store, state, id, ind };
}

describe('transitions', () => {
  it('split: successors take their own real values where data exist, inherit the offset, predecessor deactivates', () => {
    const { store, state, id, ind } = setup();
    state.offset[state.idx(ind('economy'), id('U'))] = 3;
    state.x[state.idx(ind('economy'), id('U'))] = 48;
    applyTransition(FIXTURE_TRANSITIONS[0]!, state, store, store.countryIndex, absMonth(1990, 1));
    expect(state.active[id('U')]).toBe(0);
    expect(state.active[id('U1')]).toBe(1);
    expect(state.x[state.idx(ind('economy'), id('U1'))]).toBeCloseTo(52, 1); // U1 real series 49 (44 + 0.5/yr × 10 years) plus the carried offset 3
    expect(state.offset[state.idx(ind('economy'), id('U2'))]).toBeCloseTo(3, 5); // counterfactual deviation carries over
    expect(state.x[state.idx(ind('population'), id('U1'))]).toBeCloseTo(7.7, 3); // own real series
  });

  it('secede: child activates on its own real values, parent stays', () => {
    const { store, state, id, ind } = setup();
    applyTransition(FIXTURE_TRANSITIONS[1]!, state, store, store.countryIndex, absMonth(1992, 1));
    expect(state.active[id('D')]).toBe(1);
    expect(state.active[id('E')]).toBe(1);
    expect(state.x[state.idx(ind('economy'), id('E'))]).toBeCloseTo(35, 3);
  });

  it('merge: real value for the survivor, population-weighted offsets for every kind, absorbed country deactivates', () => {
    const { store, state, id, ind } = setup();
    const f = id('F'), g = id('G'), econ = ind('economy'), pop = ind('population');
    const t = absMonth(1994, 1);
    state.offset[state.idx(econ, f)] = 2;
    state.offset[state.idx(econ, g)] = 4;
    state.x[state.idx(pop, f)] = 7; // 10M
    state.x[state.idx(pop, g)] = 7; // 10M → equal weights
    state.offset[state.idx(pop, f)] = 0.1;
    state.offset[state.idx(pop, g)] = 0.3;
    applyTransition(FIXTURE_TRANSITIONS[2]!, state, store, store.countryIndex, t);
    expect(state.active[g]).toBe(0);
    expect(state.active[f]).toBe(1);
    expect(state.x[state.idx(econ, f)]).toBeCloseTo(63, 3); // F's real series 60 plus the weighted offset 3
    expect(state.offset[state.idx(econ, f)]).toBeCloseTo(3, 5);
    expect(state.x[state.idx(pop, f)]).toBeCloseTo(store.real(pop, f, t) + 0.2, 5); // F's own observed count plus the weighted offset, not the sum
    expect(state.offset[state.idx(pop, f)]).toBeCloseTo(0.2, 5);
  });

  it('merge without the survivor’s own data log-sums the counts and keeps the weighted index', () => {
    const { store, state, id, ind } = setup();
    const f = id('F'), g = id('G'), econ = ind('economy'), pop = ind('population');
    state.x[state.idx(econ, f)] = 50;
    state.x[state.idx(econ, g)] = 70;
    state.x[state.idx(pop, f)] = 7;
    state.x[state.idx(pop, g)] = 7;
    applyTransition(FIXTURE_TRANSITIONS[2]!, state, store, store.countryIndex, store.meta.lastAbs + 1);
    expect(state.x[state.idx(pop, f)]).toBeCloseTo(Math.log10(2e7), 5);
    expect(state.x[state.idx(econ, f)]).toBeCloseTo(60, 5);
  });
});
