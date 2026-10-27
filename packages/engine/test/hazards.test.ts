import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, gateFactor, generateEvents, initState, type Hazard, type HazardContext } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

const always: Hazard = { id: 'always', type: 'protests', magnitude: 2, rate: () => 1 };
const never: Hazard = { ...always, id: 'never', rate: () => 0 };
const half: Hazard = { ...always, id: 'half', rate: () => 0.5 };

describe('hazards', () => {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const ctx = (t: number): HazardContext => ({ t, state, countries: dataset.countries, indicatorIndex: store.indicatorIndex });
  const today = dataset.meta.todayAbs;
  const before = absMonth(1985, 1), after = today + 1;
  const gate = (isBaseline: boolean, liveHistory: number, divergence?: Float32Array) => ({ isBaseline, todayAbs: today, liveHistory, gamma: 1.5, divergence });

  it('gates: nothing in the baseline before today; liveHistory or divergence^gamma in the player world; everything after today', () => {
    expect(gateFactor(gate(true, 1), 0, before)).toBe(0);
    expect(gateFactor(gate(false, 0), 0, before)).toBe(0);
    expect(gateFactor(gate(false, 0.3), 0, before)).toBe(0.3);
    const div = new Float32Array([0.5]);
    expect(gateFactor(gate(false, 0, div), 0, before)).toBeCloseTo(Math.pow(0.5, 1.5), 6);
    expect(gateFactor(gate(false, 0.3, div), 0, before)).toBeCloseTo(Math.pow(0.5, 1.5), 6);
    expect(gateFactor(gate(true, 0), 0, after)).toBe(1);
    expect(gateFactor(gate(false, 0), 0, after)).toBe(1);
  });

  it('generates one event per active country per hazard at gated probability 1, with stable ids', () => {
    const events = generateEvents([always, never], ctx(before), gate(false, 1), 1);
    const active = dataset.countries.filter((_, c) => state.active[c] === 1);
    expect(events.length).toBe(active.length);
    expect(events[0]).toMatchObject({ id: `gen-always-${active[0]!.id}-${before}`, type: 'protests', origin: 'generated', countries: [active[0]!.id], year: 1985, month: 1, magnitude: 2 });
    expect(generateEvents([always], ctx(before), gate(true, 1), 1)).toEqual([]);
    expect(generateEvents([always], ctx(before), gate(false, 0), 1)).toEqual([]);
    expect(generateEvents([], ctx(after), gate(false, 1), 1)).toEqual([]);
  });

  it('is a seeded coin flip: both worlds draw the same events after today, other seeds draw differently', () => {
    const a = generateEvents([half], ctx(after), gate(true, 0), 3);
    const b = generateEvents([half], ctx(after), gate(false, 0), 3);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0); // 7 active countries at p = 0.5; if seed 3 happens to draw none or all, pick another seed here and below
    expect(a.length).toBeLessThan(dataset.countries.length);
    expect(generateEvents([half], ctx(after), gate(true, 0), 4)).not.toEqual(a);
  });
});
