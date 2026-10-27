// cyrb53 (public domain, bryc): 53-bit string hash, identical on every JS engine.
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export type Key = string | number;
// Unit separator between keys: prevents boundary collisions (('a','b') vs ('ab')).
const SEP = '\u001f';

export function hashKeys(seed: number, ...keys: Key[]): number {
  return cyrb53(keys.join(SEP), seed >>> 0);
}
export function uniform(seed: number, ...keys: Key[]): number {
  return hashKeys(seed, ...keys) / 9007199254740992;
}
export function chance(p: number, seed: number, ...keys: Key[]): boolean {
  return uniform(seed, ...keys) < p;
}

function mix(h: number, v: number): number {
  h = Math.imul(h ^ (v >>> 0), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** Fast integer-key hash for hot loops (noise). */
export function hashInts(seed: number, a: number, b: number, c: number, d: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = mix(h, a);
  h = mix(h, b);
  h = mix(h, c);
  h = mix(h, d);
  return h;
}
export function uniformInts(seed: number, a: number, b: number, c: number, d: number): number {
  return hashInts(seed, a, b, c, d) / 4294967296;
}

/** FNV-1a over bytes; used for state hashing in tests and determinism checks. */
export function hashBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
