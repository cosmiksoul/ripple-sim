import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type FetchImpl = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export interface FetchOptions {
  cacheDir: string;
  fetchImpl?: FetchImpl;
  log?: (msg: string) => void;
}

export const DEFAULT_CACHE_DIR = join(import.meta.dirname, '..', 'cache');

export function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

export function sha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}

/** Download once, then serve from `cacheDir`. The only place in the repo that touches the network. */
export async function fetchCached(url: string, opts: FetchOptions): Promise<Buffer> {
  mkdirSync(opts.cacheDir, { recursive: true });
  const file = join(opts.cacheDir, cacheKey(url));
  if (existsSync(file)) return readFileSync(file);
  const impl: FetchImpl = opts.fetchImpl ?? ((u) => fetch(u));
  opts.log?.(`GET ${url}`);
  const res = await impl(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  writeFileSync(`${file}.url`, url);
  return buf;
}
