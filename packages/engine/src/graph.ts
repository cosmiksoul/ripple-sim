import { LinkType, type Edge } from '@ripple/schema';

export interface Neighbor {
  c: number;
  w: number;
}

export class LinkGraph {
  private readonly adj = new Map<LinkType, Neighbor[][]>();
  readonly n: number;

  constructor(edges: Edge[], countryIndex: Map<string, number>) {
    this.n = countryIndex.size;
    for (const type of LinkType.options) this.adj.set(type, Array.from({ length: this.n }, () => []));
    for (const e of edges) {
      const a = countryIndex.get(e.a);
      const b = countryIndex.get(e.b);
      if (a === undefined || b === undefined || a === b) continue;
      const lists = this.adj.get(e.type)!;
      lists[a]!.push({ c: b, w: e.weight });
      lists[b]!.push({ c: a, w: e.weight });
    }
  }

  neighbors(c: number, type: LinkType, active: Uint8Array): Neighbor[] {
    return this.adj.get(type)![c]!.filter((nb) => active[nb.c] === 1);
  }

  spillTargets(
    origins: number[],
    rings: number,
    ringFactor: number,
    bias: Partial<Record<LinkType, number>>,
    active: Uint8Array,
  ): Map<number, number> {
    const result = new Map<number, number>();
    const originSet = new Set(origins);
    const types = (Object.entries(bias) as Array<[LinkType, number]>).filter(([, b]) => b > 0);
    if (types.length === 0 || rings === 0) return result;
    let frontier = new Map<number, number>(origins.map((o) => [o, 1]));
    for (let ring = 1; ring <= rings; ring++) {
      const next = new Map<number, number>();
      for (const [node, f] of frontier) {
        for (const [type, b] of types) {
          for (const nb of this.neighbors(node, type, active)) {
            if (originSet.has(nb.c)) continue;
            const factor = f * ringFactor * nb.w * b;
            if (result.has(nb.c)) continue; // reached at a closer ring already
            next.set(nb.c, Math.max(next.get(nb.c) ?? 0, factor));
          }
        }
      }
      for (const [c, f] of next) result.set(c, f);
      frontier = next;
      if (frontier.size === 0) break;
    }
    return result;
  }
}
