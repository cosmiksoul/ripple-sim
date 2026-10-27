import { describe, expect, it } from 'vitest';
import { loadContent } from '@ripple/content';
import type { Geometry, Polygon } from 'geojson';
import { buildTopology, isPrincipal, resolveId, selectCountries, selectTerritories, type NeFeature, type NeProperties } from '../pipeline/naturalearth.js';

const geo = loadContent().geo;

function square(x: number, y: number): Polygon {
  return { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] };
}
function feat(p: Partial<NeProperties> & { ADM0_A3: string }, geometry: Geometry = square(0, 0)): NeFeature {
  return {
    type: 'Feature',
    geometry,
    properties: { SOV_A3: p.ADM0_A3, ISO_A3_EH: p.ADM0_A3, TYPE: 'Sovereign country', NAME_EN: p.ADM0_A3, NAME_RU: `${p.ADM0_A3}-ru`, REGION_UN: 'Europe', SUBREGION: 'Western Europe', ...p },
  };
}

describe('natural earth selection', () => {
  it('keeps sovereign states and principal parts of kingdoms, drops dependencies and excluded codes', () => {
    const features = [
      feat({ ADM0_A3: 'DEU' }),
      feat({ ADM0_A3: 'DNK', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'GRL', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'PRI', SOV_A3: 'US1', TYPE: 'Dependency' }),
      feat({ ADM0_A3: 'ATA', TYPE: 'Indeterminate' }),
      feat({ ADM0_A3: 'CYN', TYPE: 'Sovereign country' }),
      feat({ ADM0_A3: 'KOS', ISO_A3_EH: '-99', TYPE: 'Disputed' }),
      feat({ ADM0_A3: 'NOR', SOV_A3: 'NOR', ISO_A3_EH: '-99', TYPE: 'Country' }),
      feat({ ADM0_A3: 'SDS' }),
    ];
    expect(features.map((f) => isPrincipal(f.properties, geo))).toEqual([true, true, false, false, false, false, true, true, true]);
    expect(selectCountries(features, geo).map((c) => c.id)).toEqual(['DEU', 'DNK', 'NOR', 'SSD', 'XKX']);
    expect(resolveId(features[6]!.properties, geo)).toBe('XKX');
  });
  it('uses NAME_RU and NAME_EN, falling back to NAME', () => {
    const [c] = selectCountries([feat({ ADM0_A3: 'FRA', NAME_RU: 'Франция', NAME_EN: 'France' })], geo);
    expect(c!.name).toEqual({ ru: 'Франция', en: 'France' });
    const [d] = selectCountries([feat({ ADM0_A3: 'ITA', NAME_RU: undefined, NAME_EN: undefined, NAME: 'Italy' })], geo);
    expect(d!.name).toEqual({ ru: 'Italy', en: 'Italy' });
  });
  it('throws on duplicate ids', () => {
    expect(() => selectCountries([feat({ ADM0_A3: 'DEU' }), feat({ ADM0_A3: 'DEU' })], geo)).toThrow(/duplicate/);
  });
});

describe('territories', () => {
  it('attaches dependencies and non-principal parts to the country that shares their sovereign, drops orphans', () => {
    const features = [
      feat({ ADM0_A3: 'DNK', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'GRL', SOV_A3: 'DN1', TYPE: 'Country', NAME_EN: 'Greenland', NAME_RU: 'Гренландия' }),
      feat({ ADM0_A3: 'USA', SOV_A3: 'US1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'PRI', SOV_A3: 'US1', TYPE: 'Dependency' }),
      feat({ ADM0_A3: 'ATA', TYPE: 'Indeterminate' }),
      feat({ ADM0_A3: 'XXX', SOV_A3: 'ZZZ', TYPE: 'Dependency' }),
    ];
    const countries = selectCountries(features, geo);
    const { territories, dropped } = selectTerritories(features, geo, countries);
    expect(territories.map((t) => [t.id, t.parent])).toEqual([['GRL', 'DNK'], ['PRI', 'USA']]);
    expect(territories[0]!.name).toEqual({ ru: 'Гренландия', en: 'Greenland' });
    expect(dropped).toEqual(['XXX']); // excluded ATA is silently skipped, an orphan is reported
  });
});

describe('topology', () => {
  it('finds shared borders between countries only and keeps territories as a separate object', () => {
    const features = [
      feat({ ADM0_A3: 'AAA' }, square(0, 0)), feat({ ADM0_A3: 'BBB' }, square(1, 0)), feat({ ADM0_A3: 'CCC' }, square(0, 1)), feat({ ADM0_A3: 'DDD' }, square(5, 5)),
      feat({ ADM0_A3: 'TTT', SOV_A3: 'AAA', TYPE: 'Dependency' }, square(2, 0)), // touches BBB, but territories do not border
    ];
    const countries = selectCountries(features, geo);
    const { territories } = selectTerritories(features, geo, countries);
    const { topology, borders } = buildTopology(countries, territories);
    expect(borders.map((b) => b.join('-')).sort()).toEqual(['AAA-BBB', 'AAA-CCC']);
    expect(topology.type).toBe('Topology');
    expect((topology.objects.countries as { geometries: unknown[] }).geometries.length).toBe(4);
    expect((topology.objects.territories as { geometries: Array<{ id: string }> }).geometries.map((g) => g.id)).toEqual(['TTT']);
  });
});
