import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  absMonth, decadesOf, encodeDecade, type Country, type Edge, type IndicatorsMeta, type ScheduledEvent, type Transition,
} from '@ripple/schema';
import { loadContent, type Content } from '@ripple/content';
import type { Dataset } from '@ripple/engine';

const FIRST = absMonth(1980, 1);
const LAST = absMonth(2004, 12);
const REAL_UNTIL = absMonth(1995, 12);
const U_END = absMonth(1990, 1) - 1;
const E_START = absMonth(1992, 1);
const FG_MERGE = absMonth(1994, 1);

const c = (id: string, extra: Partial<Country> = {}): Country => ({
  id, name: { ru: id, en: id }, region: 'Test', subregion: 'Test', from: null, to: null,
  successors: [], predecessors: [], historical: false, ...extra,
});

export const FIXTURE_COUNTRIES: Country[] = [
  c('A'), c('B'), c('C'),
  c('U', { to: U_END, successors: ['U1', 'U2'], historical: true }),
  c('U1', { from: U_END + 1, predecessors: ['U'] }),
  c('U2', { from: U_END + 1, predecessors: ['U'] }),
  c('D', { successors: ['E'] }),
  c('E', { from: E_START, predecessors: ['D'] }),
  c('F'),
  c('G', { to: FG_MERGE - 1, successors: ['F'], historical: true }),
];

const ECON_START: Record<string, number> = { A: 50, B: 40, C: 30, U: 45, U1: 44, U2: 46, D: 55, E: 35, F: 60, G: 50 };
const ECON_SLOPE_PER_YEAR: Record<string, number> = { A: 20 / 16, B: 0, C: 1, U: 0, U1: 0.5, U2: 0.5, D: 0, E: 0, F: 0, G: 0 };
const STABILITY: Record<string, number> = { A: 85, B: 60, C: 45, U: 60, U1: 55, U2: 55, D: 50, E: 40, F: 70, G: 65 };
const LOG_POP: Record<string, number> = { A: 7.5, B: 7.0, C: 6.5, U: 8.0, U1: 7.7, U2: 7.4, D: 7.2, E: 6.0, F: 7.0, G: 6.8 };

function realEconomy(id: string, abs: number): number {
  const country = FIXTURE_COUNTRIES.find((k) => k.id === id)!;
  if (country.to !== null && abs > country.to) return NaN; // dissolved country: no data after its end
  const years = (Math.min(abs, REAL_UNTIL) - FIRST) / 12;
  return ECON_START[id]! + ECON_SLOPE_PER_YEAR[id]! * years;
}

export function buildMeta(): IndicatorsMeta {
  const content = loadContent();
  const cfg = (code: string) => content.indicatorConfig[code]!;
  const base = (code: string, realUntil: number, prior = false) => ({
    code, ...cfg(code), realUntil, prior, estimated: [] as string[], source: 'fixture',
  });
  return {
    dataVersion: 'fixture-1',
    countries: FIXTURE_COUNTRIES.map((k) => k.id),
    indicators: [base('economy', REAL_UNTIL), base('stability', FIRST - 1, true), base('population', REAL_UNTIL)],
    firstAbs: FIRST,
    lastAbs: LAST,
    todayAbs: REAL_UNTIL,
  };
}

export function buildValues(meta: IndicatorsMeta): Float32Array {
  const nC = meta.countries.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const values = new Float32Array(meta.indicators.length * nC * nM);
  meta.indicators.forEach((ind, i) => {
    meta.countries.forEach((id, ci) => {
      for (let m = 0; m < nM; m++) {
        const abs = meta.firstAbs + m;
        let v: number;
        if (ind.code === 'economy') v = realEconomy(id, abs);
        else if (ind.code === 'stability') v = STABILITY[id]!;
        else v = LOG_POP[id]!;
        values[(i * nC + ci) * nM + m] = v;
      }
    });
  });
  return values;
}

export const FIXTURE_EDGES: Edge[] = [
  ['A', 'B'], ['B', 'C'], ['U', 'A'], ['U1', 'A'], ['U2', 'B'], ['D', 'E'], ['D', 'C'], ['F', 'G'], ['F', 'A'],
].map(([a, b]) => ({ a: a!, b: b!, type: 'border' as const, weight: 1 }));

export const FIXTURE_TRANSITIONS: Transition[] = [
  { id: 'fx-u-1990', abs: U_END + 1, kind: 'split', from: ['U'], to: ['U1', 'U2'], eventId: 'fx-u-split-1990' },
  { id: 'fx-e-1992', abs: E_START, kind: 'secede', from: ['D'], to: ['E'], eventId: 'fx-e-secede-1992' },
  { id: 'fx-fg-1994', abs: FG_MERGE, kind: 'merge', from: ['F', 'G'], to: ['F'], eventId: 'fx-merge-1994' },
];

export const FIXTURE_EVENTS: ScheduledEvent[] = [
  { id: 'fx-war-1985', type: 'war', origin: 'real-A', year: 1985, month: 3, countries: ['B'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] },
  {
    id: 'fx-u-split-1990', type: 'dissolution', origin: 'real-A', year: 1990, month: 1, countries: ['U'], scope: 'list', magnitude: 4,
    preconditions: [{ kind: 'indicator', indicator: 'stability', country: 'U', op: '<', rhs: { baselinePlus: 15 } }],
    delayMaxYears: 5, transition: 'fx-u-1990',
    hooks: [{ type: 'banking_crisis', target: ['U1', 'U2'], delayMonths: 1, magnitude: 3, probability: 1 }],
  },
  { id: 'fx-e-secede-1992', type: 'independence', origin: 'real-A', year: 1992, month: 1, countries: ['E', 'D'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 5, hooks: [], transition: 'fx-e-1992' },
  { id: 'fx-merge-1994', type: 'unification', origin: 'real-A', year: 1994, month: 1, countries: ['F', 'G'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 5, hooks: [], transition: 'fx-fg-1994' },
  { id: 'fx-crisis-1997', type: 'banking_crisis', origin: 'real-A', year: 1997, month: 6, countries: ['A'], scope: 'list', magnitude: 4, preconditions: [], delayMaxYears: 5, hooks: [] },
];

export function buildFixture(): { dataset: Dataset; content: Content } {
  const meta = buildMeta();
  const real = loadContent();
  const content: Content = {
    ...real,
    historicalCountries: [],
    analogs: { U: { analog: 'A', shiftYears: 0, scale: 0.5 } }, // G has no record → subregion median
    transitions: FIXTURE_TRANSITIONS,
    events: FIXTURE_EVENTS,
  };
  return { dataset: { countries: FIXTURE_COUNTRIES, meta, values: buildValues(meta), graph: FIXTURE_EDGES }, content };
}

/** Writes the fixture in the on-disk layout the CLI loader expects. */
export function writeFixtureDir(dir: string): void {
  const { dataset } = buildFixture();
  mkdirSync(join(dir, 'indicators'), { recursive: true });
  writeFileSync(join(dir, 'countries.json'), JSON.stringify(dataset.countries));
  writeFileSync(join(dir, 'graph.json'), JSON.stringify({ dataVersion: dataset.meta.dataVersion, edges: dataset.graph }));
  writeFileSync(join(dir, 'indicators', 'meta.json'), JSON.stringify(dataset.meta));
  for (const d of decadesOf(dataset.meta)) {
    const raw = encodeDecade(dataset.meta, dataset.values, d);
    writeFileSync(join(dir, 'indicators', `${d}.bin`), Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
  }
}
