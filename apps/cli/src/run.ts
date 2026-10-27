import { writeFileSync } from 'node:fs';
import { loadContent, type Content } from '@ripple/content';
import { Simulation, type CountrySnapshot, type LogEntry } from '@ripple/engine';
import type { PlayerEvent, RunRecord } from '@ripple/schema';
import { loadDataset } from './load.js';

export interface Report {
  run: RunRecord;
  elapsedMs: number;
  divergence: { world: number; top: Array<{ id: string; value: number }> };
  log: { baseline: LogEntry[]; player: LogEntry[] };
  final: CountrySnapshot[];
}

/** Drops content that references countries outside the dataset; a pure filter, never mutates its input. */
export function narrowContent(content: Content, ids: ReadonlySet<string>): Content {
  const transitions = content.transitions.filter((t) => [...t.from, ...t.to].every((id) => ids.has(id)));
  const keptTransitions = new Set(transitions.map((t) => t.id));
  const events = content.events
    .filter((e) => (e.scope === 'global' || e.countries.every((id) => ids.has(id))) && (e.transition === undefined || keptTransitions.has(e.transition)))
    .map((e) => ({
      ...e,
      hooks: e.hooks.flatMap((h) => {
        if (!Array.isArray(h.target)) return [h];
        const target = h.target.filter((id) => ids.has(id));
        return target.length > 0 ? [{ ...h, target }] : [];
      }),
    }));
  const analogs = Object.fromEntries(Object.entries(content.analogs).filter(([key, a]) => ids.has(key) && ids.has(a.analog)));
  const historicalCountries = content.historicalCountries.filter((h) => ids.has(h.id));
  return { ...content, transitions, events, analogs, historicalCountries };
}

export function runCommand(opts: { data: string; from: number; to: number; seed: number; live?: number; events: PlayerEvent[]; out?: string }): Report {
  const dataset = loadDataset(opts.data);
  const full = loadContent();
  const content = narrowContent(full, new Set(dataset.countries.map((c) => c.id)));
  const dropped = [
    [full.transitions.length - content.transitions.length, 'transitions'],
    [full.events.length - content.events.length, 'events'],
    [Object.keys(full.analogs).length - Object.keys(content.analogs).length, 'analogs'],
    [full.historicalCountries.length - content.historicalCountries.length, 'historical countries'],
  ] as const;
  if (dropped.some(([n]) => n > 0)) console.error(`content narrowed to the dataset: dropped ${dropped.map(([n, what]) => `${n} ${what}`).join(', ')}`);
  const sim = Simulation.create({ dataset, content, seed: opts.seed, startYear: opts.from, endYear: opts.to, liveHistory: opts.live ?? 0 });
  for (const e of opts.events) sim.apply(e);
  const started = performance.now();
  sim.run();
  const elapsedMs = performance.now() - started;
  const snap = sim.snapshot();
  const top = Object.entries(snap.divergence.byCountry)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const report: Report = { run: sim.serializeRun(), elapsedMs, divergence: { world: snap.divergence.world, top }, log: snap.log, final: snap.countries };
  if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2));
  return report;
}
