import { gunzipSync } from 'node:zlib';
import { csvObjects } from './csv.js';
import { setPoint, type Series } from './series.js';

const ISO3 = /^[A-Z]{3}$/;
const REQUIRED = ['ISO3_code', 'Variant', 'Time', 'PopTotal'];
const THOUSANDS = 1000;

export function gunzipText(buf: Buffer): string {
  return gunzipSync(buf).toString('utf8');
}

export function parseWppCsv(text: string): Series {
  const rows = csvObjects(text);
  const header = Object.keys(rows[0] ?? {});
  for (const col of REQUIRED) if (!header.includes(col)) throw new Error(`WPP csv: missing column ${col}; columns: ${header.join(', ')}`);
  const out: Series = new Map();
  const variantOf = new Map<string, string>();
  for (const r of rows) {
    const id = r.ISO3_code ?? '';
    const variant = r.Variant ?? '';
    if (!ISO3.test(id) || (variant !== 'Estimates' && variant !== 'Medium')) continue;
    const year = Number(r.Time);
    const pop = Number(r.PopTotal) * THOUSANDS;
    if (!Number.isInteger(year) || !(pop > 0)) continue;
    const key = `${id}:${year}`;
    if (variantOf.get(key) === 'Estimates') continue;
    variantOf.set(key, variant);
    setPoint(out, id, year, pop);
  }
  return out;
}
