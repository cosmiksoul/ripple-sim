import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, type Content } from '@ripple/content';
import { Countries, Graph, Territories, type Country, type Edge } from '@ripple/schema';
import type { Topology } from 'topojson-specification';
import { assembleCountries, deriveEdges, missingReferences } from './countries.js';
import { DEFAULT_CACHE_DIR, fetchCached, sha1, type FetchImpl } from './fetch.js';
import { buildTopology, selectCountries, selectTerritories, type ModernCountry, type ModernTerritory, type NeFeature } from './naturalearth.js';
import { SOURCES } from './sources.js';
import { OUT_DIR, writeJson } from './write.js';

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

export async function buildGeo(ctx: BuildContext, content: Content = loadContent()): Promise<GeoResult> {
  const raw = await fetchCached(SOURCES.naturalEarth.url, { cacheDir: ctx.cacheDir, log: ctx.log, fetchImpl: ctx.fetchImpl });
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
  const dataVersion = dataVersionOf(geo.inputs, content);
  writeGeo(ctx, geo, dataVersion);
  ctx.log(`dataVersion ${dataVersion} → ${ctx.outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build({ cacheDir: DEFAULT_CACHE_DIR, outDir: OUT_DIR, log: (m) => console.error(m) }).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
