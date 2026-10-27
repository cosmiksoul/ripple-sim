import type { Transition } from '@ripple/schema';
import type { WorldState } from './state.js';
import type { RealSource } from './store.js';

function weightsOf(state: WorldState, real: RealSource, ids: number[]): number[] {
  const pop = real.indicatorIndex.get('population');
  if (pop === undefined) return ids.map(() => 1);
  return ids.map((c) => Math.pow(10, state.x[state.idx(pop, c)]!));
}

export function applyTransition(tr: Transition, state: WorldState, real: RealSource, countryIndex: Map<string, number>, t: number): void {
  const idx = (id: string): number => {
    const k = countryIndex.get(id);
    if (k === undefined) throw new Error(`transition ${tr.id}: unknown country ${id}`);
    return k;
  };
  const from = tr.from.map(idx);
  const to = tr.to.map(idx);
  const kinds = real.meta.indicators.map((m) => m.kind);

  if (tr.kind === 'split' || tr.kind === 'secede') {
    const src = from[0]!;
    for (const dst of to) {
      state.active[dst] = 1;
      for (let i = 0; i < state.nI; i++) {
        const ks = state.idx(i, src), kd = state.idx(i, dst);
        const own = real.real(i, dst, t);
        if (kinds[i] === 'log10count') {
          state.x[kd] = Number.isNaN(own) ? state.x[ks]! - Math.log10(to.length + (tr.kind === 'secede' ? 9 : 0)) : own;
          state.offset[kd] = 0;
        } else {
          // Prefer the successor's own observed value so the baseline stays on real data; carry the deviation over.
          state.x[kd] = Number.isNaN(own) ? state.x[ks]! : own;
          state.offset[kd] = state.offset[ks]!;
        }
      }
    }
    if (tr.kind === 'split') state.active[src] = 0;
    return;
  }

  // merge
  const dst = to[0]!;
  const w = weightsOf(state, real, from);
  const wSum = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < state.nI; i++) {
    const kd = state.idx(i, dst);
    if (kinds[i] === 'log10count') {
      state.x[kd] = Math.log10(from.reduce((acc, c) => acc + Math.pow(10, state.x[state.idx(i, c)]!), 0));
      state.offset[kd] = 0;
    } else {
      const own = real.real(i, dst, t);
      const weighted = from.reduce((acc, c, k) => acc + (w[k]! / wSum) * state.x[state.idx(i, c)]!, 0);
      state.x[kd] = Number.isNaN(own) ? weighted : own;
      state.offset[kd] = from.reduce((acc, c, k) => acc + (w[k]! / wSum) * state.offset[state.idx(i, c)]!, 0);
    }
  }
  for (const c of from) if (c !== dst) state.active[c] = 0;
}
