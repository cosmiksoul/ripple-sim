import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cacheKey, fetchCached, sha1, type FetchImpl } from '../pipeline/fetch.js';
import { writeBin, writeJson, dirSizeBytes } from '../pipeline/write.js';

function fake(body: string, status = 200): { impl: FetchImpl; calls: string[] } {
  const calls: string[] = [];
  const impl: FetchImpl = async (url) => {
    calls.push(url);
    return { ok: status === 200, status, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer };
  };
  return { impl, calls };
}

describe('fetchCached', () => {
  it('downloads once and serves the cache afterwards', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'ripple-cache-'));
    const { impl, calls } = fake('hello');
    const a = await fetchCached('https://example.org/x.csv', { cacheDir, fetchImpl: impl });
    const b = await fetchCached('https://example.org/x.csv', { cacheDir, fetchImpl: impl });
    expect(a.toString()).toBe('hello');
    expect(b.toString()).toBe('hello');
    expect(calls).toEqual(['https://example.org/x.csv']);
    expect(existsSync(join(cacheDir, cacheKey('https://example.org/x.csv')))).toBe(true);
    expect(sha1(a)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
  });
  it('throws on HTTP errors and caches nothing', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'ripple-cache-'));
    const { impl } = fake('nope', 500);
    await expect(fetchCached('https://example.org/y', { cacheDir, fetchImpl: impl })).rejects.toThrow(/HTTP 500/);
    expect(existsSync(join(cacheDir, cacheKey('https://example.org/y')))).toBe(false);
  });
});

describe('write', () => {
  it('writes json and int16 binaries, measures directory size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ripple-out-'));
    writeJson(join(dir, 'a', 'x.json'), { k: 1 });
    writeBin(join(dir, 'a', 'y.bin'), Int16Array.from([1, -2, 3]));
    expect(JSON.parse(readFileSync(join(dir, 'a', 'x.json'), 'utf8'))).toEqual({ k: 1 });
    const raw = readFileSync(join(dir, 'a', 'y.bin'));
    expect(Array.from(new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)))).toEqual([1, -2, 3]);
    expect(dirSizeBytes(dir)).toBe(7 + 6);
  });
});
