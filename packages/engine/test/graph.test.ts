import { describe, expect, it } from 'vitest';
import { LinkGraph } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('LinkGraph', () => {
  const { dataset } = buildFixture();
  const index = new Map(dataset.meta.countries.map((id, k) => [id, k]));
  const g = new LinkGraph(dataset.graph, index);
  const id = (s: string) => index.get(s)!;
  const allActive = new Uint8Array(dataset.meta.countries.length).fill(1);

  it('lists active neighbours only', () => {
    expect(g.neighbors(id('A'), 'border', allActive).map((n) => n.c).sort()).toEqual([id('B'), id('F'), id('U'), id('U1')].sort());
    const noU = allActive.slice();
    noU[id('U')] = 0;
    expect(g.neighbors(id('A'), 'border', noU).map((n) => n.c)).not.toContain(id('U'));
  });

  it('spreads over rings with geometric decay', () => {
    const t = g.spillTargets([id('A')], 2, 0.25, { border: 1 }, allActive);
    expect(t.get(id('B'))).toBeCloseTo(0.25, 6);
    expect(t.get(id('C'))).toBeCloseTo(0.0625, 6);
    expect(t.has(id('A'))).toBe(false);
    const one = g.spillTargets([id('A')], 1, 0.25, { border: 1 }, allActive);
    expect(one.has(id('C'))).toBe(false);
  });

  it('does not route through inactive countries and honours bias', () => {
    const noB = allActive.slice();
    noB[id('B')] = 0;
    const t = g.spillTargets([id('A')], 2, 0.25, { border: 1 }, noB);
    expect(t.has(id('B'))).toBe(false);
    expect(t.has(id('C'))).toBe(false);
    const half = g.spillTargets([id('A')], 1, 0.25, { border: 0.5 }, allActive);
    expect(half.get(id('B'))).toBeCloseTo(0.125, 6);
    expect(g.spillTargets([id('A')], 2, 0.25, {}, allActive).size).toBe(0);
  });
});
