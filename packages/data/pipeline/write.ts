import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const OUT_DIR = join(import.meta.dirname, '..', 'out');

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

export function writeBin(path: string, data: Int16Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}

export function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    total += st.isDirectory() ? dirSizeBytes(p) : st.size;
  }
  return total;
}
