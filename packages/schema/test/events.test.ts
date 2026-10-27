import { describe, expect, it } from 'vitest';
import { EventTypeDef, PlayerEvent, ScheduledEvent } from '@ripple/schema';

describe('event schemas', () => {
  it('applies defaults to scheduled events', () => {
    const e = ScheduledEvent.parse({
      id: 'x', type: 'war', origin: 'real-A', year: 1980, month: 9, countries: ['IRN', 'IRQ'], magnitude: 4,
    });
    expect(e.delayMaxYears).toBe(5);
    expect(e.scope).toBe('list');
    expect(e.hooks).toEqual([]);
    expect(e.leadMonths).toBeUndefined();
  });
  it('applies defaults to event types: no lead, one shock month', () => {
    const t = EventTypeDef.parse({ id: 'flood', group: 'nature', headlines: { ru: ['{country}: наводнение'], en: ['{country}: flooding'] } });
    expect(t.leadMonths).toBe(0);
    expect(t.shockMonths).toBe(1);
    expect(t.signalHeadlines).toBeUndefined();
  });
  it('rejects magnitude out of range', () => {
    expect(() => PlayerEvent.parse({ type: 'war', country: 'A', magnitude: 6, year: 1990, month: 1 })).toThrow();
  });
});
