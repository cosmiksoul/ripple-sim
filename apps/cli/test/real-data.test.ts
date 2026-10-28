import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { IndicatorStore, Simulation } from '@ripple/engine';
import { loadDataset } from '../src/load.js';
import { validateCommand } from '../src/validate.js';

const OUT = resolve(import.meta.dirname, '../../../packages/data/out');
const TOLERANCE = { index: 5, log10count: 0.02 } as const;
const BUDGET_MS = 3000;
const SUCCESSORS = ['RUS', 'UKR', 'BLR', 'KAZ', 'EST', 'LVA', 'LTU', 'XKX', 'SSD', 'TLS', 'ERI', 'NAM', 'CZE', 'SVK', 'MNE', 'SRB'];
const HISTORICAL = ['SUN', 'YUG', 'SCG', 'CSK', 'DDR', 'YMD'];

describe('real dataset', () => {
  const dataset = loadDataset(OUT);
  const content = loadContent();
  const store = new IndicatorStore(dataset.meta, dataset.values);

  it('validates', () => {
    const v = validateCommand({ data: OUT });
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('runs 1980→2025 within budget, fires all tier-A events and every transition', () => {
    const started = performance.now();
    const sim = Simulation.create({ dataset, content, seed: 1, startYear: 1980, endYear: 2025 });
    sim.run();
    expect(performance.now() - started).toBeLessThanOrEqual(BUDGET_MS);
    const fired = new Set(sim.baseline.log.filter((l) => l.kind === 'fired').map((l) => l.id));
    const due = content.events.filter((e) => e.year < 2025).map((e) => e.id);
    expect(due.filter((id) => !fired.has(id))).toEqual([]);
    expect(sim.baseline.log.filter((l) => l.kind === 'delayed' || l.kind === 'cancelled')).toEqual([]);
    expect(sim.player.log.filter((l) => l.kind === 'delayed' || l.kind === 'averted' || l.kind === 'cancelled' || l.kind === 'diverged' || l.kind === 'retargeted')).toEqual([]);
    expect(sim.player.log.filter((l) => l.kind === 'signalled').map((l) => [l.id, l.t])).toEqual(sim.baseline.log.filter((l) => l.kind === 'signalled').map((l) => [l.id, l.t]));
    expect(sim.baseline.log.find((l) => l.kind === 'signalled' && l.id === 'ussr-dissolution-1991')?.t).toBe(absMonth(1991, 6)); // dissolution: leadMonths 6
    const transitions = sim.baseline.log.filter((l) => l.kind === 'transition').map((l) => l.id).sort();
    expect(transitions).toEqual(content.transitions.map((t) => t.id).sort());
    const idx = (id: string) => sim.baseline.shared.countryIndex.get(id)!;
    for (const id of HISTORICAL) expect(sim.baseline.state.active[idx(id)], id).toBe(0);
    for (const id of SUCCESSORS) expect(sim.baseline.state.active[idx(id)], id).toBe(1);
    expect(sim.divergence().world).toBe(0);
    expect(sim.todayAbs).toBe(dataset.meta.todayAbs);
  });

  it('a clean run does not diverge from any start year', () => {
    for (const startYear of [1985, 1990, 1992]) {
      const sim = Simulation.create({ dataset, content, seed: 1, startYear, endYear: 2025 });
      sim.runTo(absMonth(2000, 12));
      expect(sim.divergence().world, `divergence from ${startYear}`).toBe(0);
      const allowed = new Set(['fired', 'signalled', 'transition']);
      const bad = [...new Set(sim.player.log.map((l) => l.kind))].filter((k) => !allowed.has(k));
      expect(bad, `offending kinds from ${startYear}`).toEqual([]);
    }
  });

  it('keeps the baseline within tolerance of the observed series', () => {
    const sim = Simulation.create({ dataset, content, seed: 1, startYear: 1980, endYear: 2025 });
    const violations: string[] = [];
    for (let year = 1981; year <= 2025; year++) {
      const t = absMonth(year, 1);
      sim.runTo(t);
      const st = sim.baseline.state;
      dataset.meta.indicators.forEach((m, i) => {
        if (m.prior || m.source === 'derived' || m.kind === 'rate' || t < (m.realFrom ?? dataset.meta.firstAbs) || t > m.realUntil) return;
        const tol = TOLERANCE[m.kind];
        for (let c = 0; c < store.nC; c++) {
          if (st.active[c] === 0) continue;
          const diff = Math.abs(st.x[st.idx(i, c)]! - store.real(i, c, t));
          if (diff > tol) violations.push(`${year} ${m.code} ${dataset.meta.countries[c]} off by ${diff.toFixed(2)}`);
        }
      });
    }
    expect(violations.slice(0, 20)).toEqual([]);
  });

  it('propped-up USSR survives 1991 only in the player world, keeps a live trend and takes over its successors’ territory', () => {
    const clean = Simulation.create({ dataset, content, seed: 7, startYear: 1980, endYear: 2025 });
    clean.runTo(absMonth(1992, 6));
    const sim = Simulation.create({ dataset, content, seed: 7, startYear: 1980, endYear: 2025 });
    for (const [year, month] of [[1989, 1], [1989, 7], [1990, 1]] as const) {
      sim.apply({ type: 'reform', country: 'SUN', magnitude: 5, year, month });
    }
    // Two events that in reality stand on Russia after the dissolution: a quake moves to whoever holds the land, a crash does not happen.
    const real = { origin: 'real-A' as const, scope: 'list' as const, countries: ['RUS'], magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] };
    sim.player.scheduler.add({ ...real, id: 'test-quake-rus', type: 'earthquake', year: 1992, month: 3 });
    sim.player.scheduler.add({ ...real, id: 'test-crash-rus', type: 'banking_crisis', year: 1992, month: 4 });
    sim.runTo(absMonth(1992, 6));
    const sun = sim.player.shared.countryIndex.get('SUN')!, rus = sim.player.shared.countryIndex.get('RUS')!;
    expect(sim.baseline.state.active[sun]).toBe(0);
    expect(sim.baseline.state.active[rus]).toBe(1);
    expect(sim.player.state.active[sun]).toBe(1);
    expect(sim.player.state.active[rus]).toBe(0);
    expect(sim.player.log.some((l) => l.kind === 'delayed' && l.id === 'ussr-dissolution-1991')).toBe(true);
    expect(sim.player.log.some((l) => l.kind === 'averted' && l.id === 'ussr-dissolution-1991')).toBe(true); // the warning went out in 1991-06, the shock did not come
    expect(sim.player.log.some((l) => l.kind === 'transition' && l.id === 'sun-1991')).toBe(false);
    expect(sim.player.log.find((l) => l.kind === 'retargeted')).toMatchObject({ id: 'test-quake-rus', from: 'RUS', to: 'SUN' });
    expect(sim.player.log.some((l) => l.kind === 'diverged' && l.id === 'test-crash-rus')).toBe(true);
    const econ = sim.player.shared.indicatorIndex.get('economy')!;
    const sunEconomy = sim.player.state.x[sim.player.state.idx(econ, sun)]!;
    expect(Number.isFinite(sunEconomy)).toBe(true); // past SUN's real end the trend is synthetic (analog CHN)
    expect(sunEconomy).toBeGreaterThan(0);
    const div = sim.divergence();
    expect(div.byCountry[sun]).toBe(1);
    expect(div.byCountry[rus]).toBe(1);
    expect(sim.stateHash().baseline).toBe(clean.stateHash().baseline);
    expect(div.world).toBeGreaterThan(0);
  });
});
