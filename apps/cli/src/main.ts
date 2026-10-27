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
if (!values.data) {
  console.error('usage: ripple <run|validate> --data <dir> [--from Y] [--to Y] [--seed N] [--live 0..1] [--event JSON]... [--out file]');
  process.exit(2);
}
if (command === 'run') {
  const events = values.event.map((s) => PlayerEvent.parse(JSON.parse(s)));
  const report = runCommand({ data: values.data, from: Number(values.from), to: Number(values.to), seed: Number(values.seed), live: Number(values.live), events, out: values.out });
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
