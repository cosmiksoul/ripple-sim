import { existsAt } from '@ripple/schema';
import { IndicatorStore } from '@ripple/engine';
import { loadDataset } from './load.js';

export function validateCommand(opts: { data: string }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ds = loadDataset(opts.data);
  const store = new IndicatorStore(ds.meta, ds.values);
  const ids = new Set(ds.countries.map((c) => c.id));
  if (ds.meta.countries.join() !== ds.countries.map((c) => c.id).join()) errors.push('meta.countries order differs from countries.json');
  if (ds.meta.todayAbs < ds.meta.firstAbs || ds.meta.todayAbs > ds.meta.lastAbs) errors.push(`todayAbs ${ds.meta.todayAbs} outside the grid`);
  for (const e of ds.graph) {
    if (!ids.has(e.a) || !ids.has(e.b)) errors.push(`graph edge ${e.a}-${e.b} references unknown country`);
  }
  ds.countries.forEach((country, c) => {
    for (let abs = ds.meta.firstAbs; abs <= ds.meta.lastAbs; abs++) {
      if (!existsAt(country, abs)) continue;
      for (let i = 0; i < store.nI; i++) {
        if (Number.isNaN(store.real(i, c, abs))) {
          errors.push(`${country.id}/${ds.meta.indicators[i]!.code}: missing value at abs ${abs}`);
          abs = ds.meta.lastAbs; // one report per country is enough
          break;
        }
      }
    }
  });
  for (const m of ds.meta.indicators) if (m.estimated.length > ds.countries.length / 2) warnings.push(`${m.code}: more than half of countries are estimated`);
  return { errors, warnings };
}
