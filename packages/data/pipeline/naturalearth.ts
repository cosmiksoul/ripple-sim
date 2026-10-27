import type { GeoConfig, LocalizedText } from '@ripple/schema';
import type { FeatureCollection, Geometry } from 'geojson';
import { neighbors } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Objects, Topology } from 'topojson-specification';

export interface NeProperties {
  ADM0_A3: string;
  SOV_A3: string;
  ISO_A3_EH: string;
  TYPE: string;
  NAME_EN?: string;
  NAME?: string;
  NAME_RU?: string;
  REGION_UN: string;
  SUBREGION: string;
}

export interface NeFeature {
  type: 'Feature';
  properties: NeProperties;
  geometry: Geometry;
}

export interface ModernCountry {
  id: string;
  name: LocalizedText;
  region: string;
  subregion: string;
  geometry: Geometry;
}

export interface ModernTerritory {
  id: string;
  name: LocalizedText;
  parent: string;
  geometry: Geometry;
}

const ISO3 = /^[A-Z]{3}$/;
const QUANTIZATION = 1e4;
const KEEP_POINTS_QUANTILE = 0.5;

export function resolveId(p: NeProperties, geo: GeoConfig): string {
  const base = ISO3.test(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3;
  return geo.idOverrides[p.ADM0_A3] ?? base;
}

export function isPrincipal(p: NeProperties, geo: GeoConfig): boolean {
  if (geo.exclude.includes(p.ADM0_A3)) return false;
  if (geo.include.includes(p.ADM0_A3)) return true;
  if (!geo.principalTypes.includes(p.TYPE)) return false;
  if (p.TYPE === 'Country') return p.SOV_A3.slice(0, 2) === p.ADM0_A3.slice(0, 2);
  return true;
}

export function selectCountries(features: NeFeature[], geo: GeoConfig): ModernCountry[] {
  const out = new Map<string, ModernCountry>();
  for (const f of features) {
    const p = f.properties;
    if (!isPrincipal(p, geo)) continue;
    const id = resolveId(p, geo);
    if (!ISO3.test(id)) throw new Error(`no ISO3 id for feature ${p.ADM0_A3} (${p.NAME_EN ?? p.NAME ?? '?'})`);
    if (out.has(id)) throw new Error(`duplicate id ${id} (feature ${p.ADM0_A3})`);
    const en = p.NAME_EN || p.NAME || id;
    out.set(id, { id, name: { ru: p.NAME_RU || en, en }, region: p.REGION_UN, subregion: p.SUBREGION, geometry: f.geometry });
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Everything that is not a country of its own but belongs to one: drawn in the parent's colour, never simulated. */
export function selectTerritories(features: NeFeature[], geo: GeoConfig, countries: ModernCountry[]): { territories: ModernTerritory[]; dropped: string[] } {
  const ids = new Set(countries.map((c) => c.id));
  const bySovereign = new Map<string, string>();
  for (const f of features) if (isPrincipal(f.properties, geo)) bySovereign.set(f.properties.SOV_A3, resolveId(f.properties, geo));
  const out = new Map<string, ModernTerritory>();
  const dropped: string[] = [];
  for (const f of features) {
    const p = f.properties;
    if (isPrincipal(p, geo) || geo.exclude.includes(p.ADM0_A3)) continue;
    const parent = bySovereign.get(p.SOV_A3);
    if (parent === undefined || !ids.has(parent)) {
      dropped.push(p.ADM0_A3);
      continue;
    }
    const resolved = resolveId(p, geo);
    const id = ISO3.test(resolved) && !ids.has(resolved) ? resolved : p.ADM0_A3; // some dependencies share their ISO code with the sovereign (IOA, ATC → AUS)
    if (ids.has(id) || out.has(id)) throw new Error(`territory id ${id} clashes (feature ${p.ADM0_A3})`);
    const en = p.NAME_EN || p.NAME || id;
    out.set(id, { id, name: { ru: p.NAME_RU || en, en }, parent, geometry: f.geometry });
  }
  return { territories: [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), dropped: dropped.sort() };
}

function collectionOf(items: Array<{ id: string; geometry: Geometry }>): FeatureCollection {
  return { type: 'FeatureCollection', features: items.map((c) => ({ type: 'Feature', id: c.id, properties: { id: c.id }, geometry: c.geometry })) };
}

export function buildTopology(countries: ModernCountry[], territories: ModernTerritory[]): { topology: Topology; borders: Array<[string, string]> } {
  const topo = topology({ countries: collectionOf(countries), territories: collectionOf(territories) }, QUANTIZATION) as unknown as Topology<Objects<{}>>;
  const geometries = (topo.objects.countries as GeometryCollection).geometries;
  const borders: Array<[string, string]> = [];
  neighbors(geometries).forEach((list, k) => {
    for (const j of list) if (j > k) borders.push([countries[k]!.id, countries[j]!.id]);
  });
  const weighted = presimplify(topo);
  const simplified = simplify(weighted, quantile(weighted, KEEP_POINTS_QUANTILE));
  return { topology: simplified, borders };
}
