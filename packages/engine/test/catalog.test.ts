import { describe, expect, it } from 'vitest';
import type { ScheduledEvent } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { CatalogScorer } from '@ripple/engine';

describe('CatalogScorer', () => {
  const s = new CatalogScorer(loadContent().eventTypes);
  it('scales catalog points by magnitude/3', () => {
    expect(s.points('war', 3).safety).toBeCloseTo(-15, 6);
    expect(s.points('war', 5).safety).toBeCloseTo(-25, 6);
    expect(s.points('war', 1).info).toBe(0);
    expect(s.points('investment', 3).econ).toBeCloseTo(6, 6);
  });
  it('scores an event from its type and magnitude only', () => {
    const ev: ScheduledEvent = { id: 'x', type: 'war', origin: 'player', year: 1990, month: 1, countries: ['A'], scope: 'list', magnitude: 5, preconditions: [], delayMaxYears: 0, hooks: [] };
    expect(s.score(ev, { t: 0, countries: [0] })).toEqual(s.points('war', 5));
  });
  it('throws on unknown type', () => {
    expect(() => s.points('nope', 3)).toThrow(/unknown event type/);
  });
});
