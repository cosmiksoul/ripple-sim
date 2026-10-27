import { describe, expect, it } from 'vitest';
import { fetchWdi, parseWdiPage, wdiToSeries } from '../pipeline/wdi.js';
import { wdiUrl } from '../pipeline/sources.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page = (pages: number, rows: Array<[string, string, number | null]>) => [
  { page: 1, pages, per_page: 20000, total: rows.length },
  rows.map(([iso, date, value]) => ({ indicator: { id: 'X', value: 'x' }, country: { id: iso.slice(0, 2), value: iso }, countryiso3code: iso, date, value, unit: '', obs_status: '', decimal: 0 })),
];

describe('wdi', () => {
  it('parses a page and skips nulls, aggregates without iso3 and non-year dates', () => {
    const { pages, rows } = parseWdiPage(page(1, [['FRA', '1990', 2.5], ['FRA', '1991', null], ['', '1990', 1], ['DEU', '2000Q1', 3]]));
    expect(pages).toBe(1);
    const s = wdiToSeries(rows);
    expect([...s.keys()]).toEqual(['FRA']);
    expect(s.get('FRA')!.get(1990)).toBe(2.5);
  });
  it('rejects API error payloads', () => {
    expect(() => parseWdiPage([{ message: [{ id: '120', value: 'Invalid indicator' }] }])).toThrow(/WDI/);
  });
  it('follows pagination and records input hashes', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'ripple-wdi-'));
    const bodies: Record<string, unknown> = {
      [wdiUrl('X', 1)]: page(2, [['FRA', '1990', 1]]),
      [wdiUrl('X', 2)]: [{ page: 2, pages: 2 }, [{ countryiso3code: 'DEU', date: '1990', value: 2 }]],
    };
    const inputs: Record<string, string> = {};
    const s = await fetchWdi('X', {
      cacheDir,
      fetchImpl: async (url) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(bodies[url])).buffer as ArrayBuffer }),
    }, inputs);
    expect(s.get('FRA')!.get(1990)).toBe(1);
    expect(s.get('DEU')!.get(1990)).toBe(2);
    expect(Object.keys(inputs).sort()).toEqual(['wdi:X:p1', 'wdi:X:p2']);
  });
});
