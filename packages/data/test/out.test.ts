import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { absMonth, Countries, Graph, IndicatorsMeta, MISSING, MONTHS_PER_DECADE, Territories, decadesOf, existsAt } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { missingReferences } from '../pipeline/countries.js';
import { dirSizeBytes } from '../pipeline/write.js';

const OUT = resolve(import.meta.dirname, '../out');
const MB = 1e6;
const read = (name: string): unknown => JSON.parse(readFileSync(join(OUT, name), 'utf8'));

describe('packages/data/out', () => {
  const manifest = read('manifest.json') as { dataVersion: string; todayAbs: number; sources: Array<{ license: string }> };
  const countries = Countries.parse(read('countries.json'));
  const territories = Territories.parse(read('territories.json'));
  const graph = Graph.parse(read('graph.json'));
  const meta = IndicatorsMeta.parse(read('indicators/meta.json'));

  it('has one dataVersion everywhere', () => {
    expect(graph.dataVersion).toBe(manifest.dataVersion);
    expect(meta.dataVersion).toBe(manifest.dataVersion);
    expect(manifest.sources.every((s) => s.license.length > 0)).toBe(true);
  });
  it('fixes «today» inside the observed range', () => {
    expect(manifest.todayAbs).toBe(meta.todayAbs);
    expect(meta.todayAbs).toBeGreaterThanOrEqual(absMonth(2022, 12));
    expect(meta.todayAbs).toBeLessThan(absMonth(2030, 1));
    for (const m of meta.indicators) if (m.code !== 'population' && !m.prior) expect(m.realUntil, m.code).toBeLessThanOrEqual(meta.todayAbs);
  });
  it('hangs every territory on a modern country', () => {
    const modern = new Set(countries.filter((c) => !c.historical).map((c) => c.id));
    expect(territories.length).toBeGreaterThan(20);
    for (const t of territories) {
      expect(modern.has(t.parent), `${t.id} → ${t.parent}`).toBe(true);
      expect(modern.has(t.id), `${t.id} is also a country`).toBe(false);
    }
    expect(territories.find((t) => t.id === 'GRL')?.parent).toBe('DNK');
  });
  it('covers every country the content refers to', () => {
    expect(countries.length).toBeGreaterThanOrEqual(180);
    expect(missingReferences(countries, loadContent())).toEqual([]);
    expect(meta.countries).toEqual(countries.map((c) => c.id));
  });
  it('ends a historical country’s series with the country', () => {
    const sun = meta.countries.indexOf('SUN');
    const to = countries.find((c) => c.id === 'SUN')!.to!;
    const decade = Math.floor((to + 1) / MONTHS_PER_DECADE) * 10; // 1990: both `to` (1991-11) and the month after fall in it
    const buf = readFileSync(join(OUT, 'indicators', `${decade}.bin`));
    const raw = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const at = (i: number, abs: number) => raw[(i * meta.countries.length + sun) * MONTHS_PER_DECADE + (abs - decade * 12)]!;
    expect(at(0, to)).not.toBe(MISSING);
    expect(at(0, to + 1)).toBe(MISSING);
  });
  it('has lifetimes consistent with transitions', () => {
    const by = new Map(countries.map((c) => [c.id, c]));
    for (const t of loadContent().transitions) {
      const survivors = t.kind === 'merge' ? t.to : t.kind === 'secede' ? t.from : [];
      for (const id of t.to) expect(existsAt(by.get(id)!, t.abs), `${id} exists at ${t.id}`).toBe(true);
      for (const id of t.from) {
        expect(existsAt(by.get(id)!, t.abs - 1), `${id} exists before ${t.id}`).toBe(true);
        if (!survivors.includes(id)) expect(existsAt(by.get(id)!, t.abs), `${id} gone after ${t.id}`).toBe(false);
      }
    }
  });
  it('has a decade file of the right size for every decade', () => {
    for (const d of decadesOf(meta)) {
      const p = join(OUT, 'indicators', `${d}.bin`);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBe(meta.indicators.length * meta.countries.length * MONTHS_PER_DECADE * 2);
    }
  });
  it('stays inside the size budget', () => {
    expect(dirSizeBytes(OUT)).toBeLessThanOrEqual(12 * MB);
    expect(statSync(join(OUT, 'geometry.topo.json')).size).toBeLessThanOrEqual(2.5 * MB);
  });
  it('only borders between historical that can coexist', () => {
    const by = new Map(countries.map((c) => [c.id, c]));
    for (const e of graph.edges) {
      const a = by.get(e.a)!, b = by.get(e.b)!;
      const start = Math.max(a.from ?? -Infinity, b.from ?? -Infinity);
      const end = Math.min(a.to ?? Infinity, b.to ?? Infinity);
      expect(start <= end, `${e.a}-${e.b} never coexist`).toBe(true);
    }
  });
});
