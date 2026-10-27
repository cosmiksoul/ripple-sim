import { describe, expect, it } from 'vitest';
import { absMonth, type HistoricalCountry, type Transition } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { assembleCountries, deriveEdges, missingReferences } from '../pipeline/countries.js';

const name = (id: string) => ({ ru: id, en: id });
const modern = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((id) => ({ id, name: name(id), region: 'R', subregion: 'S' }));
const T_SPLIT = absMonth(1991, 12), T_MERGE = absMonth(1990, 10), T_SECEDE = absMonth(1993, 5);
const historical: HistoricalCountry[] = [
  { id: 'UUU', name: name('UUU'), region: 'R', subregion: 'S', members: ['AAA', 'BBB'], from: null, to: T_SPLIT - 1 },
  { id: 'GGG', name: name('GGG'), region: 'R', subregion: 'S', members: ['CCC'], from: null, to: T_MERGE - 1 },
];
const transitions: Transition[] = [
  { id: 'u', abs: T_SPLIT, kind: 'split', from: ['UUU'], to: ['AAA', 'BBB'], eventId: 'e-u' },
  { id: 'g', abs: T_MERGE, kind: 'merge', from: ['CCC', 'GGG'], to: ['CCC'], eventId: 'e-g' },
  { id: 'e', abs: T_SECEDE, kind: 'secede', from: ['DDD'], to: ['EEE'], eventId: 'e-e' },
];

describe('assembleCountries', () => {
  const countries = assembleCountries(modern, historical, transitions);
  const by = (id: string) => countries.find((c) => c.id === id)!;
  it('is sorted by id and marks historical historical', () => {
    expect(countries.map((c) => c.id)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'GGG', 'UUU']);
    expect(by('UUU').historical).toBe(true);
    expect(by('AAA').historical).toBe(false);
  });
  it('derives lifetimes and links from transitions', () => {
    expect(by('UUU')).toMatchObject({ from: null, to: T_SPLIT - 1, successors: ['AAA', 'BBB'] });
    expect(by('AAA')).toMatchObject({ from: T_SPLIT, to: null, predecessors: ['UUU'] });
    expect(by('GGG')).toMatchObject({ to: T_MERGE - 1, successors: ['CCC'] });
    expect(by('CCC')).toMatchObject({ from: null, to: null, predecessors: ['GGG'], successors: [] });
    expect(by('DDD')).toMatchObject({ from: null, to: null, successors: ['EEE'] });
    expect(by('EEE')).toMatchObject({ from: T_SECEDE, predecessors: ['DDD'] });
  });
  it('rejects unknown ids and inconsistent lifetimes', () => {
    expect(() => assembleCountries(modern, historical, [{ id: 'x', abs: 1, kind: 'secede', from: ['DDD'], to: ['ZZZ'] }])).toThrow(/unknown country ZZZ/);
    const bad: HistoricalCountry[] = [{ ...historical[0]!, to: T_SPLIT + 5 }];
    expect(() => assembleCountries(modern, bad, transitions)).toThrow(/UUU.*to/);
  });
});

describe('deriveEdges', () => {
  it('lifts member borders to historical, links coexisting members, drops pairs that never coexist', () => {
    const countries = assembleCountries(modern, historical, transitions);
    const borders: Array<[string, string]> = [['AAA', 'BBB'], ['BBB', 'CCC'], ['CCC', 'DDD']];
    const edges = deriveEdges(borders, historical, countries).map((e) => `${e.a}-${e.b}`).sort();
    // UUU: outer border BBB-CCC → UUU-CCC; historical countries UUU and GGG touch via BBB-CCC → GGG-UUU; members AAA/BBB appear only after UUU ends → no edge.
    // GGG: CCC-DDD → GGG-DDD; member CCC coexists → CCC-GGG; BBB-CCC would give BBB-GGG, but BBB starts after GGG ends → dropped.
    expect(edges).toEqual(['AAA-BBB', 'BBB-CCC', 'CCC-DDD', 'CCC-GGG', 'CCC-UUU', 'DDD-GGG', 'GGG-UUU']);
  });
});

describe('missingReferences', () => {
  it('lists ids used by content that the dataset lacks, analogs included', () => {
    const content = loadContent();
    const countries = assembleCountries(modern, historical, transitions);
    const missing = missingReferences(countries, content);
    expect(missing).toContain('USA');
    expect(missing).toContain('RUS');
    expect(missing).toContain('CHN'); // analog of SUN
    expect(missing).not.toContain('AAA');
  });
});
