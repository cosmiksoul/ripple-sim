import { fetchCached, sha1, type FetchOptions } from './fetch.js';
import { setPoint, type Series } from './series.js';
import { wdiUrl } from './sources.js';

export interface WdiRow {
  countryiso3code: string;
  date: string;
  value: number | null;
}

const YEAR = /^\d{4}$/;

export function parseWdiPage(json: unknown): { pages: number; rows: WdiRow[] } {
  if (!Array.isArray(json) || json.length === 0 || typeof json[0] !== 'object' || json[0] === null) {
    throw new Error(`WDI: unexpected payload ${JSON.stringify(json).slice(0, 200)}`);
  }
  const header = json[0] as { pages?: number; message?: unknown };
  if (header.message) throw new Error(`WDI: API error ${JSON.stringify(header.message)}`);
  return { pages: header.pages ?? 1, rows: (json[1] ?? []) as WdiRow[] };
}

export function wdiToSeries(rows: WdiRow[], into: Series = new Map()): Series {
  for (const r of rows) {
    if (!r.countryiso3code || r.value === null || !YEAR.test(r.date)) continue;
    setPoint(into, r.countryiso3code, Number(r.date), r.value);
  }
  return into;
}

export async function fetchWdi(code: string, opts: FetchOptions, inputs: Record<string, string> = {}): Promise<Series> {
  const series: Series = new Map();
  let page = 1;
  let pages = 1;
  do {
    const buf = await fetchCached(wdiUrl(code, page), opts);
    inputs[`wdi:${code}:p${page}`] = sha1(buf);
    const parsed = parseWdiPage(JSON.parse(buf.toString('utf8')));
    pages = parsed.pages;
    wdiToSeries(parsed.rows, series);
    page++;
  } while (page <= pages);
  return series;
}
