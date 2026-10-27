import { csvObjects } from './csv.js';
import { setPoint, type Series } from './series.js';

/** OWID historical without a plain ISO3 code that we model as countries. */
export const OWID_ENTITY_MAP: Record<string, string> = {
  Kosovo: 'XKX',
  USSR: 'SUN',
  Yugoslavia: 'YUG',
  Czechoslovakia: 'CSK',
  'East Germany': 'DDR',
  'South Yemen': 'YMD',
  'Serbia and Montenegro': 'SCG',
};

/** Non-value columns that some graphers carry besides Entity/Code/Year. */
export const OWID_IGNORED_COLUMNS = ['owid_region', 'World region according to OWID'];

const ISO3 = /^[A-Z]{3}$/;
const FIXED = ['entity', 'code', 'year'];

export function resolveOwidId(entity: string, code: string): string | null {
  const mapped = OWID_ENTITY_MAP[entity];
  if (mapped) return mapped;
  return ISO3.test(code) ? code : null;
}

export function parseOwidCsv(text: string): Series {
  const rows = csvObjects(text);
  const header = Object.keys(rows[0] ?? {});
  const named = (fixed: string): string => header.find((h) => h.toLowerCase() === fixed) ?? fixed;
  const entityCol = named('entity');
  const codeCol = named('code');
  const yearCol = named('year');
  const valueCols = header.filter((h) => !FIXED.includes(h.toLowerCase()) && !OWID_IGNORED_COLUMNS.includes(h));
  if (valueCols.length !== 1) throw new Error(`OWID csv: expected one value column besides Entity/Code/Year, got ${valueCols.join(', ')}`);
  const col = valueCols[0]!;
  const out: Series = new Map();
  for (const r of rows) {
    const id = resolveOwidId(r[entityCol] ?? '', r[codeCol] ?? '');
    if (!id) continue;
    const cell = r[col] ?? '';
    const year = Number(r[yearCol]);
    const v = Number(cell);
    if (cell === '' || !Number.isFinite(v) || !Number.isInteger(year)) continue;
    setPoint(out, id, year, v);
  }
  return out;
}
