import type { Country, Edge, HistoricalCountry, LocalizedText, Transition } from '@ripple/schema';
import type { Content } from '@ripple/content';

export interface ModernSummary {
  id: string;
  name: LocalizedText;
  region: string;
  subregion: string;
}

export function assembleCountries(modern: ModernSummary[], historical: HistoricalCountry[], transitions: Transition[]): Country[] {
  const map = new Map<string, Country>();
  for (const m of modern) {
    map.set(m.id, { id: m.id, name: m.name, region: m.region, subregion: m.subregion, from: null, to: null, successors: [], predecessors: [], historical: false });
  }
  for (const e of historical) {
    if (map.has(e.id)) throw new Error(`historical country ${e.id} clashes with a modern country id`);
    map.set(e.id, { id: e.id, name: e.name, region: e.region, subregion: e.subregion, from: e.from, to: e.to, successors: [], predecessors: [], historical: true });
  }
  const declared = new Map(historical.map((e) => [e.id, e]));
  for (const tr of transitions) {
    for (const id of [...tr.from, ...tr.to]) if (!map.has(id)) throw new Error(`transition ${tr.id} references unknown country ${id}`);
    const survivors = tr.kind === 'merge' ? tr.to : tr.kind === 'secede' ? tr.from : [];
    for (const id of tr.from) {
      const c = map.get(id)!;
      for (const s of tr.to) if (s !== id && !c.successors.includes(s)) c.successors.push(s);
      if (!survivors.includes(id)) {
        const d = declared.get(id);
        if (d && d.to !== tr.abs - 1) throw new Error(`historical country ${id}: declared to=${d.to} but transition ${tr.id} ends it at ${tr.abs - 1}`);
        c.to = tr.abs - 1;
      }
    }
    for (const id of tr.to) {
      const c = map.get(id)!;
      for (const p of tr.from) if (p !== id && !c.predecessors.includes(p)) c.predecessors.push(p);
      if (!survivors.includes(id)) {
        const d = declared.get(id);
        if (d && d.from !== null && d.from !== tr.abs) throw new Error(`historical country ${id}: declared from=${d.from} but transition ${tr.id} starts it at ${tr.abs}`);
        c.from = tr.abs;
      }
    }
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Border edges for modern countries plus historical countries: a historical country borders whatever its members border outside it,
 *  other historical countries whose members touch, and its own members (West Germany next to East Germany).
 *  An edge is kept only if both ends exist at the same time for at least one month. */
export function deriveEdges(borders: Array<[string, string]>, historical: HistoricalCountry[], countries: Country[]): Edge[] {
  const life = new Map(countries.map((c) => [c.id, { from: c.from ?? -Infinity, to: c.to ?? Infinity }]));
  const coexist = (x: string, y: string): boolean => {
    const p = life.get(x), q = life.get(y);
    if (!p || !q) throw new Error(`deriveEdges: unknown country ${p ? y : x}`);
    return Math.max(p.from, q.from) <= Math.min(p.to, q.to);
  };
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const add = (x: string, y: string): void => {
    if (x === y || !coexist(x, y)) return;
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${a}|${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, type: 'border', weight: 1 });
  };
  for (const [a, b] of borders) add(a, b);
  const memberSets = historical.map((e) => ({ e, members: new Set(e.members) }));
  for (const { e, members } of memberSets) {
    for (const [a, b] of borders) {
      if (members.has(a) && !members.has(b)) add(e.id, b);
      if (members.has(b) && !members.has(a)) add(e.id, a);
    }
    for (const other of memberSets) {
      if (other.e.id === e.id) continue;
      if (borders.some(([a, b]) => (members.has(a) && other.members.has(b)) || (members.has(b) && other.members.has(a)))) add(e.id, other.e.id);
    }
    for (const m of e.members) add(e.id, m);
  }
  return edges.sort((p, q) => (p.a === q.a ? (p.b < q.b ? -1 : 1) : p.a < q.a ? -1 : 1));
}

/** Country ids that content refers to but the dataset lacks. */
export function missingReferences(countries: Country[], content: Content): string[] {
  const have = new Set(countries.map((c) => c.id));
  const refs = new Set<string>();
  for (const e of content.events) {
    for (const c of e.countries) refs.add(c);
    for (const h of e.hooks) if (Array.isArray(h.target)) for (const c of h.target) refs.add(c);
    for (const p of e.preconditions) if (p.kind === 'indicator' && p.country) refs.add(p.country);
  }
  for (const t of content.transitions) for (const c of [...t.from, ...t.to]) refs.add(c);
  for (const h of content.historicalCountries) for (const c of h.members) refs.add(c);
  for (const [id, rule] of Object.entries(content.analogs)) {
    refs.add(id);
    refs.add(rule.analog);
  }
  return [...refs].filter((id) => !have.has(id)).sort();
}
