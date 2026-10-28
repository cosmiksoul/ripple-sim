import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { CatalogScorer, Simulation, type Hazard, type Scorer } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

const make = (seed = 1, startYear = 1980, endYear = 2004, extra: { liveHistory?: number; hazards?: Hazard[]; scorer?: Scorer } = {}) => {
  const { dataset, content } = buildFixture();
  return Simulation.create({ dataset, content, seed, startYear, endYear, ...extra });
};
const propUp = (s: Simulation, id: string, abs: number) => {
  s.runTo(abs);
  const c = s.player.shared.countryIndex.get(id)!, stab = s.player.shared.indicatorIndex.get('stability')!;
  s.player.state.x[s.player.state.idx(stab, c)] = 95;
  s.player.state.offset[s.player.state.idx(stab, c)] = 35;
};

describe('Simulation', () => {
  it('rejects non-integer years and seeds and a reversed range', () => {
    expect(() => make(1, 1980.5)).toThrow(/startYear|endYear|seed/);
    expect(() => make(1, 1980, Number.NaN)).toThrow(/startYear|endYear|seed/);
    expect(() => make(1.5)).toThrow(/startYear|endYear|seed/);
    expect(() => make(1, 1990, 1985)).toThrow(/startYear|endYear|seed/);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = make(1), b = make(1), c = make(2);
    a.run(); b.run(); c.run();
    expect(a.stateHash()).toEqual(b.stateHash());
    expect(a.stateHash().player).not.toBe(c.stateHash().player);
    expect(a.t).toBe(a.endAbs);
  });

  it('without interventions the player world equals the baseline at every year', () => {
    const s = make(5);
    for (let y = 1981; y <= 2004; y++) {
      s.runTo(absMonth(y, 1));
      expect(s.stateHash().player).toBe(s.stateHash().baseline);
    }
    expect(s.divergence().world).toBe(0);
    expect(s.player.log.filter((l) => l.kind === 'inverse' || l.kind === 'delayed')).toEqual([]);
  });

  it('applies transitions in both worlds on schedule', () => {
    const s = make(1);
    s.runTo(absMonth(1990, 2));
    const u = s.baseline.shared.countryIndex.get('U')!, u1 = s.baseline.shared.countryIndex.get('U1')!;
    expect(s.baseline.state.active[u]).toBe(0);
    expect(s.player.state.active[u1]).toBe(1);
    expect(s.baseline.log.some((l) => l.kind === 'transition' && l.id === 'fx-u-1990')).toBe(true);
    s.runTo(absMonth(1994, 2));
    expect(s.player.state.active[s.player.shared.countryIndex.get('G')!]).toBe(0);
  });

  it('an intervention moves only the player world and shows up as divergence', () => {
    const clean = make(3);
    clean.run();
    const s = make(3);
    const id = s.apply({ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 });
    expect(id).toBe('player-1');
    s.run();
    expect(s.stateHash().baseline).toBe(clean.stateHash().baseline);
    expect(s.stateHash().player).not.toBe(clean.stateHash().player);
    const snap = s.snapshot();
    const a = snap.countries.find((c) => c.id === 'A')!;
    expect(a.values.economy!.player).toBeGreaterThan(a.values.economy!.baseline);
    expect(snap.divergence.world).toBeGreaterThan(0);
    expect(snap.divergence.byCountry.A).toBeGreaterThan(snap.divergence.byCountry.C!);
    expect(s.player.log.find((l) => l.id === 'player-1')?.mode).toBe('forward');
  });

  it('propping up U delays its dissolution only in the player world', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    const u = s.player.shared.countryIndex.get('U')!;
    s.runTo(absMonth(1990, 3));
    expect(s.baseline.state.active[u]).toBe(0);
    expect(s.player.state.active[u]).toBe(1);
    expect(s.player.log.some((l) => l.kind === 'delayed' && l.id === 'fx-u-split-1990')).toBe(true);
    expect(s.player.log.some((l) => l.kind === 'inverse' && l.id === 'fx-u-split-1990')).toBe(true);
    // the warning went out in both worlds six months earlier (dissolution: leadMonths 6); the player world then averted the shock
    for (const w of [s.baseline, s.player]) expect(w.log.some((l) => l.kind === 'signalled' && l.id === 'fx-u-split-1990' && l.t === absMonth(1989, 7))).toBe(true);
    expect(s.player.log.filter((l) => l.kind === 'averted').map((l) => [l.id, l.t])).toEqual([['fx-u-split-1990', absMonth(1990, 1)]]);
    expect(s.baseline.log.some((l) => l.kind === 'averted')).toBe(false);
  });

  it('an intervention is signalled the month it is thrown and strikes leadMonths later', () => {
    const s = make(3);
    s.apply({ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 }); // investment: leadMonths 2, no info points
    s.runTo(absMonth(1983, 3));
    const entries = () => s.player.log.filter((l) => l.id === 'player-1').map((l) => [l.kind, l.t]);
    expect(entries()).toEqual([['signalled', absMonth(1983, 1)]]);
    expect(s.stateHash().player).toBe(s.stateHash().baseline); // a headline only: nothing has struck yet
    s.runTo(absMonth(1983, 4));
    expect(entries()).toEqual([['signalled', absMonth(1983, 1)], ['fired', absMonth(1983, 3)]]);
    expect(s.stateHash().player).not.toBe(s.stateHash().baseline);
    expect(s.baseline.log.filter((l) => l.id === 'player-1')).toEqual([]);
  });

  it('a country alive in one world only counts as fully diverged, weighted by its own population', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.runTo(absMonth(1990, 3));
    const idx = (id: string) => s.shared.countryIndex.get(id)!;
    const div = s.divergence();
    expect(div.byCountry[idx('U')]).toBe(1); // player only
    expect(div.byCountry[idx('U1')]).toBe(1); // baseline only
    expect(div.byCountry[idx('E')]).toBe(0); // born in 1992: in neither world yet
    expect(div.byCountry[idx('A')]).toBeLessThan(0.5);
    expect(div.world).toBeGreaterThan(0.5); // U, U1, U2 hold 175M of ~250M people
  });

  it('a country that outlives its real end follows its analog trend and is never subtracted from', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.runTo(absMonth(1991, 1));
    const u = s.shared.countryIndex.get('U')!, econ = s.shared.indicatorIndex.get('economy')!;
    expect(s.player.state.active[u]).toBe(1);
    // U's economy stood at 45 when its series ends (1989-12); analog A climbs 1.25/year, scale 0.5 → 13 months later
    expect(s.player.state.x[s.player.state.idx(econ, u)]).toBeCloseTo(45 + 0.5 * 1.25 * (13 / 12), 0);
  });

  it('real events on a country that exists only in the baseline move to the holder or diverge', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.player.scheduler.add({ id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.baseline.scheduler.add({ id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.player.scheduler.add({ id: 'crash-u1', type: 'banking_crisis', origin: 'real-A', year: 1990, month: 7, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.baseline.scheduler.add({ id: 'crash-u1', type: 'banking_crisis', origin: 'real-A', year: 1990, month: 7, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.runTo(absMonth(1990, 8));
    expect(s.player.log.find((l) => l.kind === 'retargeted')).toMatchObject({ id: 'quake-u1', from: 'U1', to: 'U' });
    expect(s.player.log.find((l) => l.id === 'quake-u1' && l.kind === 'fired')?.mode).toBe('forward');
    expect(s.player.log.some((l) => l.kind === 'diverged' && l.id === 'crash-u1')).toBe(true);
    expect(s.baseline.log.filter((l) => l.kind === 'retargeted' || l.kind === 'diverged')).toEqual([]);
  });

  it('live history: hazards fire only in the player world before today, and in both worlds after', () => {
    const always: Hazard = { id: 'always', type: 'protests', magnitude: 2, rate: () => 1 };
    const strict = make(2, 1980, 2004, { hazards: [always] });
    strict.runTo(absMonth(1990, 1));
    expect(strict.player.log.filter((l) => l.id.startsWith('gen-'))).toEqual([]); // liveHistory 0 and no divergence → silent
    expect(strict.stateHash().player).toBe(strict.stateHash().baseline);
    const live = make(2, 1980, 2004, { liveHistory: 1, hazards: [always] });
    live.runTo(absMonth(1981, 1));
    expect(live.baseline.log.filter((l) => l.id.startsWith('gen-'))).toEqual([]);
    expect(live.player.log.filter((l) => l.id.startsWith('gen-') && l.kind === 'fired' && l.mode === 'forward').length).toBeGreaterThan(0);
    expect(live.divergence().world).toBeGreaterThan(0);
    strict.run();
    const after = (w: { log: Array<{ t: number; id: string }> }) => w.log.filter((l) => l.id.startsWith('gen-') && l.t > strict.todayAbs).map((l) => l.id);
    expect(after(strict.baseline).length).toBeGreaterThan(0);
    expect(after(strict.player)).toEqual(after(strict.baseline));
  });

  it('takes channel points from a pluggable scorer', () => {
    const catalog = new CatalogScorer(buildFixture().content.eventTypes);
    const doubled: Scorer = {
      def: (id) => catalog.def(id),
      score: (ev, ctx) => { const p = catalog.score(ev, ctx); return { ...p, econ: p.econ * 2 }; },
    };
    const econA = (s: Simulation) => {
      s.apply({ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 });
      s.run();
      const v = s.snapshot().countries.find((c) => c.id === 'A')!.values.economy!;
      return v.player - v.baseline;
    };
    expect(econA(make(3, 1980, 2004, { scorer: doubled }))).toBeGreaterThan(econA(make(3)));
  });

  it('rejects unknown types, non-player types and unknown countries', () => {
    const s = make(1);
    expect(() => s.apply({ type: 'nope', country: 'A', magnitude: 3, year: 1981, month: 1 })).toThrow();
    expect(() => s.apply({ type: 'dissolution', country: 'A', magnitude: 3, year: 1981, month: 1 })).toThrow(/not allowed/);
    expect(() => s.apply({ type: 'investment', country: 'ZZZ', magnitude: 3, year: 1981, month: 1 })).toThrow(/unknown country/);
  });

  it('serialises and restores a run bit-for-bit, live history included', () => {
    const s = make(9, 1980, 2004, { liveHistory: 0.3 });
    s.apply({ type: 'war', country: 'B', magnitude: 4, year: 1986, month: 5 });
    s.apply({ type: 'investment', country: 'C', magnitude: 2, year: 1990, month: 7 });
    s.run();
    const run = s.serializeRun();
    expect(run.interventions.length).toBe(2);
    expect(run.liveHistory).toBe(0.3);
    const { dataset, content } = buildFixture();
    const r = Simulation.restoreRun(dataset, content, run);
    r.run();
    expect(r.stateHash()).toEqual(s.stateHash());
    expect(() => make(1, 1980, 2004, { liveHistory: 2 })).toThrow(/liveHistory/);
  });

  it('snapshot converts log10 counts to absolute values', () => {
    const s = make(1);
    s.runTo(absMonth(1981, 1));
    const a = s.snapshot().countries.find((c) => c.id === 'A')!;
    expect(a.values.population!.real).toBeCloseTo(Math.pow(10, 7.5), -3);
  });
});
