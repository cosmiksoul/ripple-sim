import { existsAt, type Country } from '@ripple/schema';
import { hashBytes } from './rng.js';
import type { IndicatorStore } from './store.js';

export class WorldState {
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly offset: Float32Array;

  constructor(readonly nI: number, readonly nC: number, buffers?: { active: Uint8Array; x: Float32Array; offset: Float32Array }) {
    this.active = buffers?.active ?? new Uint8Array(nC);
    this.x = buffers?.x ?? new Float32Array(nI * nC);
    this.offset = buffers?.offset ?? new Float32Array(nI * nC);
  }
  idx(i: number, c: number): number {
    return i * this.nC + c;
  }
  clone(): WorldState {
    return new WorldState(this.nI, this.nC, { active: this.active.slice(), x: this.x.slice(), offset: this.offset.slice() });
  }
  hash(): number {
    const a = hashBytes(new Uint8Array(this.x.buffer, this.x.byteOffset, this.x.byteLength));
    const b = hashBytes(new Uint8Array(this.offset.buffer, this.offset.byteOffset, this.offset.byteLength));
    const c = hashBytes(this.active);
    return (a ^ Math.imul(b, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b)) >>> 0;
  }
}

export function initState(store: IndicatorStore, countries: Country[], startAbs: number): WorldState {
  const s = new WorldState(store.nI, store.nC);
  countries.forEach((country, c) => {
    if (!existsAt(country, startAbs)) return;
    s.active[c] = 1;
    for (let i = 0; i < store.nI; i++) {
      const v = store.real(i, c, startAbs);
      if (Number.isNaN(v)) throw new Error(`no data for ${store.meta.indicators[i]!.code}/${country.id} at ${startAbs}`);
      s.x[s.idx(i, c)] = v;
    }
  });
  return s;
}
