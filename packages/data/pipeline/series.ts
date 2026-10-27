import { absMonth } from '@ripple/schema';

export type Yearly = Map<number, number>;
export type Series = Map<string, Yearly>;

export function setPoint(series: Series, id: string, year: number, value: number): void {
  let y = series.get(id);
  if (!y) {
    y = new Map();
    series.set(id, y);
  }
  y.set(year, value);
}

const ANCHOR_MONTH = 7;

/** Yearly points → monthly values in `target` (index = abs − firstAbs). Linear between July anchors, flat outside. */
export function fillMonthly(points: Yearly, firstAbs: number, lastAbs: number, target: Float32Array): { firstYear: number; lastYear: number } | null {
  const years = [...points.keys()].sort((a, b) => a - b);
  if (years.length === 0) return null;
  const anchors = years.map((y) => ({ abs: absMonth(y, ANCHOR_MONTH), v: points.get(y)! }));
  let a = 0;
  for (let abs = firstAbs; abs <= lastAbs; abs++) {
    while (a + 1 < anchors.length && anchors[a + 1]!.abs <= abs) a++;
    const cur = anchors[a]!;
    let v: number;
    if (abs <= anchors[0]!.abs) v = anchors[0]!.v;
    else if (a === anchors.length - 1) v = cur.v;
    else {
      const nxt = anchors[a + 1]!;
      v = cur.v + ((nxt.v - cur.v) * (abs - cur.abs)) / (nxt.abs - cur.abs);
    }
    target[abs - firstAbs] = v;
  }
  return { firstYear: years[0]!, lastYear: years[years.length - 1]! };
}

/** Combine member series into one: `sum` for counts, population-weighted mean for indices. A year needs data from at least half of the members. */
export function aggregateYearly(members: string[], series: Series, weights: Series, mode: 'sum' | 'weightedMean'): Yearly {
  const years = new Set<number>();
  for (const m of members) for (const y of series.get(m)?.keys() ?? []) years.add(y);
  const out: Yearly = new Map();
  for (const y of [...years].sort((p, q) => p - q)) {
    let acc = 0, wSum = 0, n = 0;
    for (const m of members) {
      const v = series.get(m)?.get(y);
      if (v === undefined) continue;
      const w = mode === 'sum' ? 1 : (weights.get(m)?.get(y) ?? 1);
      acc += mode === 'sum' ? v : v * w;
      wSum += w;
      n++;
    }
    if (n === 0 || n * 2 < members.length) continue;
    out.set(y, mode === 'sum' ? acc : acc / wSum);
  }
  return out;
}
