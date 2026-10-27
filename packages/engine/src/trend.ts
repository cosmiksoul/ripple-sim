import { existsAt, type Analogs, type Country, type IndicatorsMeta } from '@ripple/schema';
import type { IndicatorStore, RealSource } from './store.js';

interface Rule {
  analog: number;
  shift: number; // months
  scale: number;
}

/** Real series that continue past a country's real end (ADR 0005):
 *  real[t] = real[end] + scale × (analog[t − shift] − analog[end − shift]),
 *  the analog coming from content or, without a record, from the median move of the country's subregion peers. */
export class Trend implements RealSource {
  readonly meta: IndicatorsMeta;
  readonly indicatorIndex: Map<string, number>;
  private readonly rules: Array<Rule | null>;
  private readonly peers: number[][]; // same subregion, other countries
  private readonly cache = new Map<number, Float32Array>(); // (i * nC + c) → synthetic values by month

  constructor(private readonly store: IndicatorStore, private readonly countries: Country[], analogs: Analogs) {
    this.meta = store.meta;
    this.indicatorIndex = store.indicatorIndex;
    this.rules = countries.map((k) => {
      const r = analogs[k.id];
      if (!r) return null;
      const analog = store.countryIndex.get(r.analog);
      if (analog === undefined) throw new Error(`analog ${r.analog} of ${k.id}: unknown country`);
      return { analog, shift: r.shiftYears * 12, scale: r.scale };
    });
    this.peers = countries.map((k, c) => countries.map((p, j) => (j !== c && p.subregion === k.subregion ? j : -1)).filter((j) => j >= 0));
  }

  realUntil(i: number): number {
    return this.store.realUntil(i);
  }

  real(i: number, c: number, abs: number): number {
    const end = this.countries[c]!.to;
    if (end === null || abs <= end) return this.store.real(i, c, abs);
    return this.synth(i, c, abs, end);
  }

  private synth(i: number, c: number, abs: number, end: number): number {
    const m = abs - this.meta.firstAbs;
    if (m < 0 || m >= this.store.nM) return NaN;
    const key = i * this.store.nC + c;
    let row = this.cache.get(key);
    if (!row) {
      row = new Float32Array(this.store.nM).fill(NaN);
      this.cache.set(key, row);
    }
    if (!Number.isNaN(row[m]!)) return row[m]!;
    const base = this.store.real(i, c, end);
    const rule = this.rules[c];
    const move = rule ? rule.scale * this.move(i, rule.analog, abs - rule.shift, end - rule.shift) : this.medianMove(i, c, abs, end);
    const v = Number.isNaN(move) ? base : base + move;
    row[m] = v;
    return row[m]!;
  }

  private move(i: number, c: number, abs: number, end: number): number {
    return this.store.real(i, c, abs) - this.store.real(i, c, end);
  }

  private medianMove(i: number, c: number, abs: number, end: number): number {
    const moves = this.peers[c]!
      .filter((p) => existsAt(this.countries[p]!, abs) && existsAt(this.countries[p]!, end))
      .map((p) => this.move(i, p, abs, end))
      .filter((d) => !Number.isNaN(d))
      .sort((a, b) => a - b);
    if (moves.length === 0) return NaN;
    const mid = moves.length >> 1;
    return moves.length % 2 === 1 ? moves[mid]! : (moves[mid - 1]! + moves[mid]!) / 2;
  }
}
