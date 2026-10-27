import { describe, expect, it } from 'vitest';
import { Journal } from '@ripple/engine';

describe('Journal', () => {
  it('keeps only the strongest deltas per tick and drops tiny ones', () => {
    const j = new Journal({ maxTicks: 10, topPerTick: 2, minAbs: 0.01 });
    j.begin(1);
    j.record({ t: 1, i: 0, c: 0, amount: -5, cause: 'e1' });
    j.record({ t: 1, i: 0, c: 1, amount: 0.001, cause: 'e1' });
    j.record({ t: 1, i: 0, c: 2, amount: 2, cause: 'e2' });
    j.record({ t: 1, i: 0, c: 3, amount: -1, cause: 'e3' });
    j.commit();
    expect(j.deltas(0, 0, 1, 1).length).toBe(1);
    expect(j.deltas(0, 1, 1, 1).length).toBe(0);
    expect(j.deltas(0, 3, 1, 1).length).toBe(0);
    expect(j.size()).toBe(2);
  });

  it('evicts ticks beyond maxTicks', () => {
    const j = new Journal({ maxTicks: 3, topPerTick: 10, minAbs: 0 });
    for (let t = 0; t < 5; t++) {
      j.begin(t);
      j.record({ t, i: 0, c: 0, amount: 1, cause: 'e' });
      j.commit();
    }
    expect(j.deltas(0, 0, 0, 1).length).toBe(0);
    expect(j.deltas(0, 0, 2, 4).length).toBe(3);
  });

  it('explains a spill back to its origin', () => {
    const j = new Journal({ maxTicks: 100, topPerTick: 100, minAbs: 0 });
    for (let t = 0; t < 3; t++) {
      j.begin(t);
      j.record({ t, i: 0, c: 0, amount: -4, cause: 'war-B', channel: 'safety' });
      j.record({ t, i: 0, c: 1, amount: -1, cause: 'war-B', from: 0, channel: 'safety' });
      j.record({ t, i: 0, c: 1, amount: -0.2, cause: 'noise-like', channel: 'econ' });
      j.commit();
    }
    const why = j.why(0, 1, 2);
    expect(why[0]!.cause).toBe('war-B');
    expect(why[0]!.amount).toBeCloseTo(-3, 6);
    expect(why[0]!.from).toBe(0);
    expect(why[0]!.children[0]!.cause).toBe('war-B');
    expect(why[0]!.children[0]!.amount).toBeCloseTo(-12, 6);
    expect(why[0]!.children[0]!.children).toEqual([]);
    expect(why[1]!.cause).toBe('noise-like');
  });
});
