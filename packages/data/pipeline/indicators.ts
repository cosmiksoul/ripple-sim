import { absMonth, type Country, type HistoricalCountry, type IndicatorConfig, type IndicatorMeta, type IndicatorsMeta, type Normalization, type NormalizationRule, type Priors } from '@ripple/schema';
import { aggregateYearly, fillMonthly, type Series, type Yearly } from './series.js';

export interface GridInputs {
  countries: Country[];
  historical: HistoricalCountry[];
  config: Record<string, IndicatorConfig>;
  normalization: Normalization;
  priors: Priors;
  raw: Record<string, Series>;
  population: Series;
  firstAbs: number;
  lastAbs: number;
}

export interface GridResult {
  meta: Omit<IndicatorsMeta, 'dataVersion'>;
  values: Float32Array;
}

const INDEX_MIN = 0;
const INDEX_MAX = 100;

export function transformValue(rule: NormalizationRule, raw: number): number {
  switch (rule.kind) {
    case 'identity':
      return raw;
    case 'linear':
      return clamp((INDEX_MAX * (raw - rule.lo)) / (rule.hi - rule.lo), INDEX_MIN, INDEX_MAX);
    case 'log':
      return raw > 0 ? clamp((INDEX_MAX * Math.log(raw / rule.lo)) / Math.log(rule.hi / rule.lo), INDEX_MIN, INDEX_MAX) : NaN;
    case 'log10':
      return raw > 0 ? Math.log10(raw) : NaN;
    default:
      return NaN;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(xs: number[]): number {
  const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function buildGrid(inp: GridInputs): GridResult {
  const codes = Object.keys(inp.config);
  const nC = inp.countries.length;
  const nM = inp.lastAbs - inp.firstAbs + 1;
  const values = new Float32Array(codes.length * nC * nM).fill(NaN);
  const metas: IndicatorMeta[] = new Array<IndicatorMeta>(codes.length);
  const slice = (i: number, c: number): Float32Array => values.subarray((i * nC + c) * nM, (i * nC + c + 1) * nM);
  const historicalById = new Map(inp.historical.map((e) => [e.id, e]));
  const base = (code: string): Omit<IndicatorMeta, 'realUntil' | 'prior' | 'estimated' | 'source'> => ({ code, ...inp.config[code]! });

  // Pass 1: sourced and prior indicators.
  codes.forEach((code, i) => {
    const rule = inp.normalization[code];
    if (!rule) throw new Error(`no normalization rule for ${code}`);
    if (rule.kind === 'derived') return;
    if (rule.kind === 'prior') {
      const p = inp.priors[code];
      if (!p) throw new Error(`indicator ${code} is a prior but priors.json has no entry`);
      inp.countries.forEach((c, k) => slice(i, k).fill(p.bySubregion[c.subregion] ?? p.default));
      metas[i] = { ...base(code), realUntil: inp.firstAbs - 1, prior: true, estimated: [], source: 'prior' };
      return;
    }
    const raw = inp.raw[code];
    if (!raw) throw new Error(`no raw series for ${code} (${rule.source})`);
    const cfg = inp.config[code]!;
    const mode = cfg.kind === 'log10count' ? 'sum' : 'weightedMean';
    const have = new Set<number>();
    let realUntil = inp.firstAbs - 1;
    inp.countries.forEach((c, k) => {
      let yearly: Yearly | undefined = raw.get(c.id);
      const hc = historicalById.get(c.id);
      if (!yearly && hc) yearly = aggregateYearly(hc.members, raw, inp.population, mode);
      if (!yearly || yearly.size === 0) return;
      const transformed: Yearly = new Map();
      for (const [year, v] of yearly) {
        const t = transformValue(rule, v);
        if (Number.isFinite(t)) transformed.set(year, clamp(t, cfg.min, cfg.max));
      }
      const r = fillMonthly(transformed, inp.firstAbs, inp.lastAbs, slice(i, k));
      if (!r) return;
      have.add(k);
      realUntil = Math.max(realUntil, Math.min(absMonth(r.lastYear, 12), inp.lastAbs));
    });
    const estimated: string[] = [];
    inp.countries.forEach((c, k) => {
      if (have.has(k)) return;
      const peers = pickPeers(inp.countries, have, c);
      const target = slice(i, k);
      for (let m = 0; m < nM; m++) target[m] = median(peers.map((p) => slice(i, p)[m]!));
      estimated.push(c.id);
    });
    metas[i] = { ...base(code), realUntil, prior: false, estimated, source: rule.source };
  });

  // Pass 2: derived indicators.
  codes.forEach((code, i) => {
    const rule = inp.normalization[code]!;
    if (rule.kind !== 'derived') return;
    const terms = rule.terms.map((t) => {
      const j = codes.indexOf(t.indicator);
      if (j < 0 || metas[j] === undefined || inp.normalization[t.indicator]!.kind === 'derived') throw new Error(`${code}: term ${t.indicator} must be a sourced or prior indicator`);
      return { j, weight: t.weight, invert: t.invert };
    });
    const cfg = inp.config[code]!;
    for (let k = 0; k < nC; k++) {
      const target = slice(i, k);
      for (let m = 0; m < nM; m++) {
        let acc = 0;
        for (const t of terms) {
          const v = slice(t.j, k)[m]!;
          acc += t.weight * (t.invert ? INDEX_MAX - v : v);
        }
        target[m] = clamp(acc, cfg.min, cfg.max);
      }
    }
    metas[i] = { ...base(code), realUntil: Math.min(...terms.map((t) => metas[t.j]!.realUntil)), prior: false, estimated: [], source: 'derived' };
  });

  // «Today»: the last month any observed (non-projection) source reaches. Same for every run on this dataset (ADR 0001).
  let todayAbs = inp.firstAbs - 1;
  codes.forEach((code, i) => {
    const rule = inp.normalization[code]!;
    if ('source' in rule && !rule.projection) todayAbs = Math.max(todayAbs, metas[i]!.realUntil);
  });
  if (todayAbs < inp.firstAbs) throw new Error('no observed series: cannot place «today»');

  // A historical country's series end with the country; past that the engine continues them by analog (trend.ts), not by a flat shelf.
  inp.countries.forEach((c, k) => {
    if (c.to === null || c.to >= inp.lastAbs) return;
    for (let i = 0; i < codes.length; i++) slice(i, k).fill(NaN, Math.max(0, c.to + 1 - inp.firstAbs));
  });
  // A successor has no history before it exists: fillMonthly holds its first observation flat backwards, those cells are invented.
  inp.countries.forEach((c, k) => {
    if (c.from === null || c.from <= inp.firstAbs) return;
    for (let i = 0; i < codes.length; i++) slice(i, k).fill(NaN, 0, c.from - inp.firstAbs);
  });

  return { meta: { countries: inp.countries.map((c) => c.id), indicators: metas, firstAbs: inp.firstAbs, lastAbs: inp.lastAbs, todayAbs }, values };
}

function pickPeers(countries: Country[], have: Set<number>, c: Country): number[] {
  const all = [...have];
  const sub = all.filter((k) => countries[k]!.subregion === c.subregion);
  if (sub.length > 0) return sub;
  const reg = all.filter((k) => countries[k]!.region === c.region);
  if (reg.length > 0) return reg;
  if (all.length === 0) throw new Error(`no data at all to estimate ${c.id}`);
  return all;
}
