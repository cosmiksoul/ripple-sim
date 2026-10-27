import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, type Content } from '@ripple/content';
import { absMonth, fromAbs, Countries, Graph, IndicatorsMeta, Territories, decadesOf, encodeDecade, type Country, type Edge } from '@ripple/schema';
import type { Topology } from 'topojson-specification';
import { assembleCountries, deriveEdges, missingReferences } from './countries.js';
import { DEFAULT_CACHE_DIR, fetchCached, sha1, type FetchImpl, type FetchOptions } from './fetch.js';
import { buildGrid } from './indicators.js';
import { buildTopology, selectCountries, selectTerritories, type ModernCountry, type ModernTerritory, type NeFeature } from './naturalearth.js';
import { parseOwidCsv } from './owid.js';
import type { Series } from './series.js';
import { owidUrl, SOURCES } from './sources.js';
import { fetchWdi } from './wdi.js';
import { gunzipText, parseWppCsv } from './wpp.js';
import { dirSizeBytes, OUT_DIR, writeBin, writeJson } from './write.js';

export interface BuildContext {
  cacheDir: string;
  outDir: string;
  log: (msg: string) => void;
  fetchImpl?: FetchImpl;
}

export interface GeoResult {
  modern: ModernCountry[];
  territories: ModernTerritory[];
  countries: Country[];
  topology: Topology;
  edges: Edge[];
  inputs: Record<string, string>;
}

export interface RawResult {
  raw: Record<string, Series>;
  population: Series;
  inputs: Record<string, string>;
}

function fetchOpts(ctx: BuildContext): FetchOptions {
  return { cacheDir: ctx.cacheDir, log: ctx.log, fetchImpl: ctx.fetchImpl };
}

export async function buildGeo(ctx: BuildContext, content: Content = loadContent()): Promise<GeoResult> {
  const raw = await fetchCached(SOURCES.naturalEarth.url, fetchOpts(ctx));
  const collection = JSON.parse(raw.toString('utf8')) as { features: NeFeature[] };
  const modern = selectCountries(collection.features, content.geo);
  const { territories, dropped } = selectTerritories(collection.features, content.geo, modern);
  if (dropped.length > 0) ctx.log(`geo: dropped features without a principal sovereign: ${dropped.join(' ')}`);
  const { topology, borders } = buildTopology(modern, territories);
  const countries = assembleCountries(modern, content.historicalCountries, content.transitions);
  const missing = missingReferences(countries, content);
  if (missing.length > 0) {
    throw new Error(`content references unknown countries: ${missing.join(', ')} — find their ADM0_A3 in the Natural Earth file and add to packages/content/config/geo.json include/idOverrides`);
  }
  const edges = deriveEdges(borders, content.historicalCountries, countries);
  ctx.log(`geo: ${modern.length} modern + ${content.historicalCountries.length} historical countries + ${territories.length} territories, ${edges.length} border edges`);
  return { modern, territories, countries, topology, edges, inputs: { [SOURCES.naturalEarth.id]: sha1(raw) } };
}

export async function loadRaw(ctx: BuildContext, content: Content = loadContent()): Promise<RawResult> {
  const inputs: Record<string, string> = {};
  const opts = fetchOpts(ctx);
  const wpp = await fetchCached(SOURCES.wpp.url, opts);
  inputs[SOURCES.wpp.id] = sha1(wpp);
  const population = parseWppCsv(gunzipText(wpp));
  ctx.log(`wpp: ${population.size} locations`);
  const raw: Record<string, Series> = {};
  for (const [code, rule] of Object.entries(content.normalization)) {
    if (!('source' in rule)) continue;
    const sep = rule.source.indexOf(':');
    const kind = rule.source.slice(0, sep), ref = rule.source.slice(sep + 1);
    if (kind === 'wdi') raw[code] = await fetchWdi(ref, opts, inputs);
    else if (kind === 'owid') {
      const buf = await fetchCached(owidUrl(ref), opts);
      inputs[`owid:${ref}`] = sha1(buf);
      raw[code] = parseOwidCsv(buf.toString('utf8'));
    } else if (kind === 'wpp') raw[code] = population;
    else throw new Error(`unknown source kind "${kind}" for ${code}`);
    ctx.log(`${code}: ${raw[code]!.size} series from ${rule.source}`);
  }
  return { raw, population, inputs };
}

export function dataVersionOf(inputs: Record<string, string>, content: Content): string {
  return createHash('sha1').update(JSON.stringify({ inputs, content })).digest('hex').slice(0, 12);
}

export function writeGeo(ctx: BuildContext, geo: GeoResult, dataVersion: string): void {
  writeJson(join(ctx.outDir, 'countries.json'), Countries.parse(geo.countries));
  writeJson(join(ctx.outDir, 'territories.json'), Territories.parse(geo.territories.map(({ id, name, parent }) => ({ id, name, parent }))));
  writeJson(join(ctx.outDir, 'geometry.topo.json'), geo.topology);
  writeJson(join(ctx.outDir, 'graph.json'), Graph.parse({ dataVersion, edges: geo.edges }));
}

export async function build(ctx: BuildContext): Promise<void> {
  const content = loadContent();
  const geo = await buildGeo(ctx, content);
  const data = await loadRaw(ctx, content);
  const grid = buildGrid({
    countries: geo.countries,
    historical: content.historicalCountries,
    config: content.indicatorConfig,
    normalization: content.normalization,
    priors: content.priors,
    raw: data.raw,
    population: data.population,
    firstAbs: absMonth(content.engine.horizon.firstYear, 1),
    lastAbs: absMonth(content.engine.horizon.lastYear, 12),
  });
  const inputs = { ...geo.inputs, ...data.inputs };
  const dataVersion = dataVersionOf(inputs, content);
  const meta = IndicatorsMeta.parse({ dataVersion, ...grid.meta });
  writeGeo(ctx, geo, dataVersion);
  writeJson(join(ctx.outDir, 'indicators', 'meta.json'), meta);
  for (const d of decadesOf(meta)) writeBin(join(ctx.outDir, 'indicators', `${d}.bin`), encodeDecade(meta, grid.values, d));
  for (const m of meta.indicators) ctx.log(`${m.code}: realUntil ${m.realUntil}, estimated ${m.estimated.length}: ${m.estimated.join(' ')}`);
  const today = fromAbs(meta.todayAbs);
  ctx.log(`today: ${today.year}-${String(today.month).padStart(2, '0')} (abs ${meta.todayAbs})`);
  writeJson(join(ctx.outDir, 'manifest.json'), {
    dataVersion,
    sources: Object.values(SOURCES),
    inputs,
    countries: meta.countries.length,
    territories: geo.territories.length,
    indicators: meta.indicators.map((m) => m.code),
    firstAbs: meta.firstAbs,
    lastAbs: meta.lastAbs,
    todayAbs: meta.todayAbs,
  });
  ctx.log(`dataVersion ${dataVersion}, ${(dirSizeBytes(ctx.outDir) / 1e6).toFixed(2)} MB → ${ctx.outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build({ cacheDir: DEFAULT_CACHE_DIR, outDir: OUT_DIR, log: (m) => console.error(m) }).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
