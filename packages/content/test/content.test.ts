import { describe, expect, it } from 'vitest';
import { loadContent } from '@ripple/content';

describe('content', () => {
  const c = loadContent();
  it('loads and validates', () => {
    expect(c.eventTypes.length).toBeGreaterThan(20);
    expect(c.events.length).toBeGreaterThan(50);
    expect(c.transitions.length).toBe(11);
  });
  it('references only known event types', () => {
    const types = new Set(c.eventTypes.map((t) => t.id));
    for (const e of c.events) {
      expect(types.has(e.type), `event ${e.id} type ${e.type}`).toBe(true);
      for (const h of e.hooks) expect(types.has(h.type), `hook of ${e.id}: ${h.type}`).toBe(true);
    }
  });
  it('links transitions and events both ways', () => {
    const events = new Map(c.events.map((e) => [e.id, e]));
    for (const t of c.transitions) {
      expect(t.eventId, t.id).toBeDefined();
      const e = events.get(t.eventId!);
      expect(e, `transition ${t.id} → event ${t.eventId}`).toBeDefined();
      expect(e!.transition).toBe(t.id);
      expect(e!.year * 12 + e!.month - 1).toBe(t.abs);
    }
  });
  it('has unique event ids and ru/en texts for headlines', () => {
    const ids = c.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of c.eventTypes) {
      for (const h of [...t.headlines.ru, ...t.headlines.en]) expect(h).toContain('{country}');
    }
  });
  it('types with a lead carry signal headlines; nature never warns', () => {
    for (const t of c.eventTypes) {
      if (t.leadMonths > 0) {
        expect(t.signalHeadlines, t.id).toBeDefined();
        for (const h of [...t.signalHeadlines!.ru, ...t.signalHeadlines!.en]) expect(h).toContain('{country}');
      }
      if (t.group === 'nature') expect(t.leadMonths, t.id).toBe(0);
    }
    expect(c.eventTypes.find((t) => t.id === 'dissolution')!.leadMonths).toBe(6);
    expect(c.engine.signal.infoShare).toBeGreaterThan(0);
    expect(c.engine.signal.infoShare).toBeLessThan(1);
  });
  it('channel map targets configured indicators', () => {
    for (const [, m] of Object.entries(c.channels)) {
      for (const code of Object.keys(m)) expect(c.indicatorConfig[code], code).toBeDefined();
    }
  });
  it('maps analogs from historical countries to modern ones, with defaults filled in', () => {
    const historical = new Set(c.historicalCountries.map((h) => h.id));
    for (const [id, rule] of Object.entries(c.analogs)) {
      expect(historical.has(id), `analog key ${id}`).toBe(true);
      expect(historical.has(rule.analog), `analog ${rule.analog} of ${id}`).toBe(false);
    }
    expect(c.analogs.SUN).toEqual({ analog: 'CHN', shiftYears: 0, scale: 0.6 });
    expect(c.engine.handover.retarget).toEqual(['nature']);
    expect(c.engine.generation.gamma).toBeGreaterThan(0);
  });
});
