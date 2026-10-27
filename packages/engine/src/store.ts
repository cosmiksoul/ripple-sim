import { decadesOf, decodeDecadeInto, type IndicatorsMeta } from '@ripple/schema';

/** What dynamics and transitions need from the real series. IndicatorStore serves the data as they are; Trend (trend.ts) continues them past a country's real end. */
export interface RealSource {
  readonly meta: IndicatorsMeta;
  readonly indicatorIndex: Map<string, number>;
  real(i: number, c: number, abs: number): number;
  realUntil(i: number): number;
}

export class IndicatorStore implements RealSource {
  readonly nI: number;
  readonly nC: number;
  readonly nM: number;
  readonly indicatorIndex: Map<string, number>;
  readonly countryIndex: Map<string, number>;

  constructor(readonly meta: IndicatorsMeta, readonly values: Float32Array) {
    this.nI = meta.indicators.length;
    this.nC = meta.countries.length;
    this.nM = meta.lastAbs - meta.firstAbs + 1;
    if (values.length !== this.nI * this.nC * this.nM) {
      throw new Error(`values length ${values.length} != ${this.nI}*${this.nC}*${this.nM}`);
    }
    this.indicatorIndex = new Map(meta.indicators.map((d, k) => [d.code, k]));
    this.countryIndex = new Map(meta.countries.map((id, k) => [id, k]));
  }

  real(i: number, c: number, abs: number): number {
    if (abs < this.meta.firstAbs || abs > this.meta.lastAbs) return NaN;
    return this.values[(i * this.nC + c) * this.nM + (abs - this.meta.firstAbs)]!;
  }

  realUntil(i: number): number {
    return this.meta.indicators[i]!.realUntil;
  }

  static assemble(meta: IndicatorsMeta, decades: Map<number, Int16Array>): Float32Array {
    const nM = meta.lastAbs - meta.firstAbs + 1;
    const values = new Float32Array(meta.indicators.length * meta.countries.length * nM).fill(NaN);
    for (const d of decadesOf(meta)) {
      const raw = decades.get(d);
      if (!raw) throw new Error(`missing decade file ${d}`);
      decodeDecadeInto(meta, raw, d, values);
    }
    return values;
  }
}
