import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/load.js';
import { runCommand } from '../src/run.js';
import { validateCommand } from '../src/validate.js';
import { writeFixtureDir } from '../../../packages/engine/test/fixtures/world.js';

const ROOT = resolve(import.meta.dirname, '../../..');
const dir = mkdtempSync(join(tmpdir(), 'ripple-fixture-'));
writeFixtureDir(dir);

describe('cli', () => {
  it('loads a dataset directory', () => {
    const ds = loadDataset(dir);
    expect(ds.countries.length).toBe(10);
    expect(ds.values.length).toBe(ds.meta.indicators.length * ds.meta.countries.length * (ds.meta.lastAbs - ds.meta.firstAbs + 1));
  });

  it('validates the fixture without errors', () => {
    const v = validateCommand({ data: dir });
    expect(v.errors).toEqual([]);
  });

  it('runs with an intervention and writes a report', () => {
    const out = join(dir, 'report.json');
    const report = runCommand({ data: dir, from: 1980, to: 1999, seed: 3, live: 0.3, out, events: [{ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 }] });
    expect(report.run.interventions.length).toBe(1);
    expect(report.run.liveHistory).toBe(0.3);
    expect(report.divergence.world).toBeGreaterThan(0);
    expect(report.divergence.top[0]!.id).toBe('A');
    expect(report.final.find((c) => c.id === 'A')!.values.economy!.player).toBeGreaterThan(report.final.find((c) => c.id === 'A')!.values.economy!.baseline);
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, 'utf8')).run.seed).toBe(3);
  });

  it('exits 2 with a one-line message on a malformed --from and on a bad --event', () => {
    const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const fails = (extra: string[]) => {
      try {
        execFileSync(process.execPath, [tsx, 'apps/cli/src/main.ts', 'run', '--data', dir, ...extra], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        return e as { status: number; stderr: string };
      }
      throw new Error('expected a non-zero exit');
    };
    const badFrom = fails(['--from', '198O']);
    expect(badFrom.status).toBe(2);
    expect(badFrom.stderr).toContain('--from');
    expect(badFrom.stderr).not.toContain('at ');
    const badEvent = fails(['--event', '{"type":"investment"}']);
    expect(badEvent.status).toBe(2);
    expect(badEvent.stderr).toContain('--event #1');
    expect(badEvent.stderr).not.toContain('at ');
  });

  it('works as a binary', () => {
    const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const stdout = execFileSync(process.execPath, [tsx, 'apps/cli/src/main.ts', 'run', '--data', dir, '--from', '1980', '--to', '1990', '--seed', '1', '--live', '0'], { cwd: ROOT, encoding: 'utf8' });
    const report = JSON.parse(stdout);
    expect(report.run.startYear).toBe(1980);
    expect(report.run.liveHistory).toBe(0);
    expect(report.divergence.world).toBe(0);
  });
});
