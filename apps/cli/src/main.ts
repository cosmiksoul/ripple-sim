import { parseArgs } from 'node:util';
import { PlayerEvent } from '@ripple/schema';
import { runCommand } from './run.js';
import { validateCommand } from './validate.js';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    data: { type: 'string' },
    from: { type: 'string', default: '1980' },
    to: { type: 'string', default: '2050' },
    seed: { type: 'string', default: '1' },
    live: { type: 'string', default: '0' },
    event: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
  },
});
const USAGE = 'usage: ripple <run|validate> --data <dir> [--from Y] [--to Y] [--seed N] [--live 0..1] [--event JSON]... [--out file]';
function fail(message: string): never {
  console.error(`ripple: ${message}`);
  console.error(USAGE);
  process.exit(2);
}
if (!values.data) {
  console.error(USAGE);
  process.exit(2);
}
if (command === 'run') {
  for (const name of ['from', 'to', 'seed'] as const) {
    if (!/^-?\d+$/.test(values[name])) fail(`--${name} must be an integer${name === 'seed' ? '' : ' year'}, got "${values[name]}"`);
  }
  const live = values.live.trim() === '' ? Number.NaN : Number(values.live);
  if (!(Number.isFinite(live) && live >= 0 && live <= 1)) fail(`--live must be a number within 0..1, got "${values.live}"`);
  const events = values.event.map((s, n) => {
    let json: unknown;
    try {
      json = JSON.parse(s);
    } catch {
      return fail(`--event #${n + 1}: invalid JSON`);
    }
    const parsed = PlayerEvent.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return fail(`--event #${n + 1}: ${issue.path.join('.') || '(root)'} ${issue.message}`);
    }
    return parsed.data;
  });
  const report = runCommand({ data: values.data, from: Number(values.from), to: Number(values.to), seed: Number(values.seed), live, events, out: values.out });
  if (!values.out) process.stdout.write(JSON.stringify(report));
  else console.error(`divergence ${report.divergence.world.toFixed(4)} in ${report.elapsedMs.toFixed(0)} ms → ${values.out}`);
} else if (command === 'validate') {
  const v = validateCommand({ data: values.data });
  for (const w of v.warnings) console.error(`warn: ${w}`);
  for (const e of v.errors) console.error(`error: ${e}`);
  console.error(`${v.errors.length} errors, ${v.warnings.length} warnings`);
  process.exit(v.errors.length === 0 ? 0 : 1);
} else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
