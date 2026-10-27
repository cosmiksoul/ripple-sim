import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Countries, Graph, IndicatorsMeta, decadesOf } from '@ripple/schema';
import { IndicatorStore, type Dataset } from '@ripple/engine';

export function loadDataset(dir: string): Dataset {
  const countries = Countries.parse(JSON.parse(readFileSync(join(dir, 'countries.json'), 'utf8')));
  const graph = Graph.parse(JSON.parse(readFileSync(join(dir, 'graph.json'), 'utf8')));
  const meta = IndicatorsMeta.parse(JSON.parse(readFileSync(join(dir, 'indicators', 'meta.json'), 'utf8')));
  const decades = new Map<number, Int16Array>();
  for (const d of decadesOf(meta)) {
    const buf = readFileSync(join(dir, 'indicators', `${d}.bin`));
    decades.set(d, new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  return { countries, meta, values: IndicatorStore.assemble(meta, decades), graph: graph.edges };
}
