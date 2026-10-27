import { absMonth, fromAbs, type PlayerEvent, type RunRecord, type ScheduledEvent } from '@ripple/schema';
import type { Content } from '@ripple/content';
import { dynParamsFromMeta } from './dynamics.js';
import { CatalogScorer, type Scorer } from './events/catalog.js';
import { LinkGraph } from './graph.js';
import type { Hazard } from './hazards.js';
import { initState } from './state.js';
import { IndicatorStore } from './store.js';
import { Trend } from './trend.js';
import type { Dataset } from './types.js';
import { SimWorld, type LogEntry, type WorldShared } from './world.js';

export interface SimOptions {
  dataset: Dataset;
  content: Content;
  seed: number;
  startYear: number;
  endYear?: number;
  liveHistory?: number; // 0..1, default 0 («Строгая»); UI presets: 0 / 0.3 / 1
  hazards?: Hazard[]; // default none (stage 0)
  scorer?: Scorer; // default: the content catalog; the seam for model scorers (version 2.0)
}

export interface CountrySnapshot {
  id: string;
  active: { baseline: boolean; player: boolean };
  values: Record<string, { baseline: number; player: number; real: number }>;
}
export interface Snapshot {
  t: number;
  year: number;
  month: number;
  divergence: { world: number; byCountry: Record<string, number> };
  countries: CountrySnapshot[];
  log: { baseline: LogEntry[]; player: LogEntry[] };
}

export class Simulation {
  t: number;
  readonly todayAbs: number;
  readonly interventions: PlayerEvent[] = [];
  private counter = 0;

  private constructor(
    readonly dataset: Dataset,
    readonly content: Content,
    readonly shared: WorldShared,
    readonly startAbs: number,
    readonly endAbs: number,
    readonly baseline: SimWorld,
    readonly player: SimWorld,
    private readonly startYear: number,
    private readonly endYear: number,
  ) {
    this.t = startAbs;
    this.todayAbs = shared.todayAbs;
  }

  static create(opts: SimOptions): Simulation {
    const { dataset, content } = opts;
    const endYear = opts.endYear ?? 2050;
    const liveHistory = opts.liveHistory ?? 0;
    const startAbs = absMonth(opts.startYear, 1);
    const endAbs = absMonth(endYear, 12);
    if (startAbs < dataset.meta.firstAbs || endAbs > dataset.meta.lastAbs) {
      throw new Error(`run ${opts.startYear}–${endYear} outside dataset range`);
    }
    if (!(liveHistory >= 0 && liveHistory <= 1)) throw new Error(`liveHistory must be within 0..1, got ${liveHistory}`);
    const store = new IndicatorStore(dataset.meta, dataset.values);
    const shared: WorldShared = {
      store,
      trend: new Trend(store, dataset.countries, content.analogs),
      countries: dataset.countries,
      params: dynParamsFromMeta(dataset.meta),
      graph: new LinkGraph(dataset.graph, store.countryIndex),
      scorer: opts.scorer ?? new CatalogScorer(content.eventTypes),
      channels: content.channels,
      engine: content.engine,
      transitions: new Map(content.transitions.map((tr) => [tr.id, tr])),
      countryIndex: store.countryIndex,
      indicatorIndex: store.indicatorIndex,
      hazards: opts.hazards ?? [],
      liveHistory,
      todayAbs: dataset.meta.todayAbs,
      startAbs,
      seed: opts.seed,
    };
    const events = content.events.filter((e) => absMonth(e.year, e.month) >= startAbs);
    const baseline = new SimWorld(shared, initState(store, dataset.countries, startAbs), events, true);
    const player = new SimWorld(shared, initState(store, dataset.countries, startAbs), events, false);
    return new Simulation(dataset, content, shared, startAbs, endAbs, baseline, player, opts.startYear, endYear);
  }

  step(): boolean {
    if (this.t >= this.endAbs) return false;
    const divergence = this.divergence().byCountry; // as of the start of the tick, for the hazard gate
    const mirrorX = this.baseline.state.x.slice();
    this.baseline.step(this.t);
    this.player.step(this.t, { x: mirrorX, fired: this.baseline.scheduler.firedAt(this.t), divergence });
    this.t += 1;
    return true;
  }

  runTo(abs: number): void {
    while (this.t < Math.min(abs, this.endAbs)) this.step();
  }

  run(): void {
    this.runTo(this.endAbs);
  }

  apply(ev: PlayerEvent): string {
    const def = this.shared.scorer.def(ev.type);
    if (!def.playerAllowed) throw new Error(`event type ${ev.type} is not allowed for the player`);
    if (!this.shared.countryIndex.has(ev.country)) throw new Error(`unknown country ${ev.country}`);
    const abs = Math.max(absMonth(ev.year, ev.month), this.t);
    const { year, month } = fromAbs(abs);
    const id = `player-${++this.counter}`;
    const scheduled: ScheduledEvent = {
      id, type: ev.type, origin: 'player', year, month, countries: [ev.country], scope: 'list', magnitude: ev.magnitude,
      preconditions: [], delayMaxYears: 0, hooks: [],
    };
    this.player.scheduler.add(scheduled);
    this.interventions.push({ ...ev, year, month });
    return id;
  }

  /** Per country: 1 − exp(−rms/σ) over index indicators where both worlds have it; 1 where only one world has it (ADR 0005).
   *  World: population-weighted mean, each country weighed by its population in the world where it exists. */
  divergence(): { world: number; byCountry: Float32Array } {
    const { store, engine } = this.shared;
    const b = this.baseline.state, p = this.player.state;
    const idx = store.meta.indicators.map((m, i) => (m.kind === 'index' ? i : -1)).filter((i) => i >= 0);
    const pop = store.indicatorIndex.get('population');
    const byCountry = new Float32Array(store.nC);
    let wSum = 0, acc = 0;
    for (let c = 0; c < store.nC; c++) {
      const inB = b.active[c] === 1, inP = p.active[c] === 1;
      if (!inB && !inP) continue;
      let value: number;
      if (inB !== inP) {
        value = 1;
      } else {
        let sq = 0;
        for (const i of idx) {
          const d = p.x[p.idx(i, c)]! - b.x[b.idx(i, c)]!;
          sq += d * d;
        }
        value = 1 - Math.exp(-Math.sqrt(sq / Math.max(1, idx.length)) / engine.divergenceSigma);
      }
      const s = inP ? p : b;
      const w = pop === undefined ? 1 : Math.pow(10, s.x[s.idx(pop, c)]!);
      byCountry[c] = value;
      acc += w * value;
      wSum += w;
    }
    return { world: wSum === 0 ? 0 : acc / wSum, byCountry };
  }

  snapshot(): Snapshot {
    const { store } = this.shared;
    const div = this.divergence();
    const { year, month } = fromAbs(this.t);
    const display = (kind: string, v: number) => (kind === 'log10count' ? Math.pow(10, v) : v);
    const countries = this.dataset.countries.map((country, c) => {
      const values: CountrySnapshot['values'] = {};
      store.meta.indicators.forEach((m, i) => {
        values[m.code] = {
          baseline: display(m.kind, this.baseline.state.x[this.baseline.state.idx(i, c)]!),
          player: display(m.kind, this.player.state.x[this.player.state.idx(i, c)]!),
          real: display(m.kind, store.real(i, c, Math.min(this.t, store.meta.lastAbs))),
        };
      });
      return { id: country.id, active: { baseline: this.baseline.state.active[c] === 1, player: this.player.state.active[c] === 1 }, values };
    });
    const byCountry: Record<string, number> = {};
    this.dataset.countries.forEach((k, c) => (byCountry[k.id] = div.byCountry[c]!));
    return { t: this.t, year, month, divergence: { world: div.world, byCountry }, countries, log: { baseline: this.baseline.log, player: this.player.log } };
  }

  stateHash(): { baseline: number; player: number } {
    return { baseline: this.baseline.state.hash(), player: this.player.state.hash() };
  }

  serializeRun(): RunRecord {
    return {
      v: 1, dataVersion: this.dataset.meta.dataVersion, seed: this.shared.seed, startYear: this.startYear, endYear: this.endYear,
      liveHistory: this.shared.liveHistory, interventions: [...this.interventions],
    };
  }

  static restoreRun(dataset: Dataset, content: Content, run: RunRecord, hazards: Hazard[] = []): Simulation {
    if (run.dataVersion !== dataset.meta.dataVersion) throw new Error(`run data ${run.dataVersion} != dataset ${dataset.meta.dataVersion}`);
    const sim = Simulation.create({ dataset, content, seed: run.seed, startYear: run.startYear, endYear: run.endYear, liveHistory: run.liveHistory, hazards });
    for (const iv of run.interventions) sim.apply(iv);
    return sim;
  }
}
