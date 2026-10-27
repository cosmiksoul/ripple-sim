import type { Channel } from '@ripple/schema';

export interface Delta {
  t: number;
  i: number;
  c: number;
  amount: number;
  cause: string;
  from?: number;
  channel?: Channel;
}

export interface WhyNode {
  cause: string;
  amount: number;
  t: number;
  from?: number;
  channel?: Channel;
  children: WhyNode[];
}

export interface JournalConfig {
  maxTicks: number;
  topPerTick: number;
  minAbs: number;
}

export class Journal {
  private readonly ticks = new Map<number, Delta[]>();
  private pending: Delta[] = [];
  private current = Number.NaN;

  constructor(private readonly cfg: JournalConfig) {}

  begin(t: number): void {
    this.current = t;
    this.pending = [];
  }

  record(d: Delta): void {
    if (Math.abs(d.amount) < this.cfg.minAbs) return;
    this.pending.push(d);
  }

  commit(): void {
    this.pending.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    this.ticks.set(this.current, this.pending.slice(0, this.cfg.topPerTick));
    this.pending = [];
    while (this.ticks.size > this.cfg.maxTicks) {
      const oldest = Math.min(...this.ticks.keys());
      this.ticks.delete(oldest);
    }
  }

  size(): number {
    let n = 0;
    for (const d of this.ticks.values()) n += d.length;
    return n;
  }

  deltas(i: number, c: number, fromT: number, toT: number): Delta[] {
    const out: Delta[] = [];
    for (let t = fromT; t <= toT; t++) {
      const list = this.ticks.get(t);
      if (!list) continue;
      for (const d of list) if (d.i === i && d.c === c) out.push(d);
    }
    return out;
  }

  why(i: number, c: number, t: number, depth = 6, window = 24, onlyCause?: string): WhyNode[] {
    if (depth <= 0) return [];
    const groups = new Map<string, WhyNode>();
    for (const d of this.deltas(i, c, t - window, t)) {
      if (onlyCause !== undefined && d.cause !== onlyCause) continue;
      const key = `${d.cause}|${d.from ?? ''}`;
      const g = groups.get(key);
      if (g) {
        g.amount += d.amount;
        g.t = Math.max(g.t, d.t);
      } else {
        groups.set(key, { cause: d.cause, amount: d.amount, t: d.t, from: d.from, channel: d.channel, children: [] });
      }
    }
    const top = [...groups.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3);
    for (const node of top) {
      if (node.from !== undefined && node.from !== c) node.children = this.why(i, node.from, node.t, depth - 1, window, node.cause);
    }
    return top;
  }
}
