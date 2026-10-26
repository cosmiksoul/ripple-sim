# Этап 0 «Скелет» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Headless-ядро симуляции «Рябь» с двумя мирами, реальной базовой линией 1980→2025 из открытых данных и CLI, без UI.

**Architecture:** pnpm-монорепо с пятью пакетами. `@ripple/schema` держит типы и zod-схемы данных; `@ripple/content` — авторские JSON (каталог типов событий, ярус A, переходы границ, конфиг динамики); `@ripple/data` — конвейер, который скачивает WDI, UN WPP, OWID (V-Dem, Barro-Lee) и Natural Earth и пишет помесячные сетки int16; `@ripple/engine` — чистый TypeScript без DOM: индикаторы с тягой к реальному тренду, тренд по аналогу для страны, пережившей свой реальный конец, граф границ, планировщик событий с правилом «встроено в реальность» и передачей модели странам, которые существуют только в одном мире, переходы границ, каркас функций риска с ручкой «живая история», журнал причин, два мира на общих хеш-случайных числах; `apps/cli` — `ripple run` и `ripple validate`. Решения зафиксированы в `GLOSSARY.md` и `docs/adr/0001–0005`; термины плана следуют глоссарию (исторические страны, территории, аналог, живая история, «сегодня»). Движок сначала строится на синтетическом наборе данных (fixtures), конвейер реальных данных идёт отдельной частью, и последняя задача сводит их интеграционными тестами.

**Tech Stack:** Node 24, pnpm 9, TypeScript 5.8 strict, Vitest 3, tsx, zod 3, topojson-server/simplify/client. Никакого бандлера и сборки в этапе 0: пакеты экспортируют `src/index.ts`, всё исполняется через tsx/vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-ripple-design.md` (разделы 3, 4.1–4.2, 4.5–4.7, 8, 10, 11, 12 «Этап 0»).

## Global Constraints

- Движок без DOM и без Node-специфики (`fs`, `path` только в `apps/cli` и `packages/data`).
- Все случайные числа — хеш от seed и семантических ключей; последовательных генераторов нет (спека 3.7).
- Тик = 1 месяц; `absMonth = year*12 + (month-1)`.
- Индикаторы 0–100 для `kind: index`; `inflation` в процентах (`rate`); `population`, `gdp` в log10 (`log10count`).
- Данные: ни одного числа руками в коде; авторские числа только в `packages/content`.
- Ни один тест не ходит в сеть. Сетевые вызовы только через `packages/data/pipeline/fetch.ts`, который вызывает `build.ts`; шаги плана с сетью помечены «(сеть)».
- Бюджет: полный забег 1980→2025 двух миров в Node ≤ 3 с; `packages/data/out` ≤ 12 МБ.
- Языки текстов контента: `ru` и `en` всегда вместе.
- Очки события приходят через интерфейс `Scorer`; движок не знает, откуда они (в этапе 0 каталог, в версии 2.0 модель или ансамбль LLM с материализованными оценками). Оценщик чистый: никакой сети и состояния внутри тика.
- Коммит после каждой задачи. Пуш делает пользователь (SSH).

## Структура файлов

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json, vitest.config.ts, .prettierrc, .gitattributes, .github/workflows/ci.yml, README.md
packages/schema/src/{index,time,countries,indicators,graph,events,content,run}.ts     типы + zod + int16-кодек
packages/schema/test/{time,indicators,events}.test.ts
packages/engine/src/{index,rng,store,state,dynamics,trend,hazards,graph,journal,transitions,world,sim,types}.ts
packages/engine/src/events/{catalog,impact,schedule}.ts
packages/engine/test/fixtures/world.ts                                                синтетический набор данных
packages/engine/test/*.test.ts
packages/content/{catalog/event-types.json,catalog/channels.json,config/indicators.json,config/engine.json,config/geo.json,config/normalization.json,priors/indicators.json,historical-countries.json,analogs.json,transitions.json,events/tier-a.json}
packages/content/src/index.ts, packages/content/test/content.test.ts
packages/data/pipeline/{sources,fetch,csv,write,naturalearth,countries,wdi,owid,wpp,series,indicators,build}.ts
packages/data/test/*.test.ts, packages/data/out/** (коммитится), packages/data/cache/** (в .gitignore)
apps/cli/src/{main,load,run,validate}.ts, apps/cli/test/cli.test.ts
```

Ответственности: `store.ts` — доступ к реальным рядам и интерфейс `RealSource`; `trend.ts` — тот же интерфейс поверх хранилища, продолжающий ряд страны после её реального конца по аналогу; `state.ts` — массивы состояния мира; `dynamics.ts` — формула тяги к тренду; `hazards.ts` — интерфейс функции риска и шаг генерации с ручкой «живая история» (в этапе 0 без единой функции риска); `graph.ts` — соседи и кольца распространения; `events/catalog.ts` — тип + сила → очки по каналам; `events/impact.ts` — очки → дельты индикаторов с правилом «встроено/вперёд/обратно»; `events/schedule.ts` — расписание, предусловия, окна, хуки, зеркало базового расписания, передача модели; `transitions.ts` — распад/объединение; `world.ts` — шаг одного мира; `sim.ts` — пара миров, вмешательства, расхождение, сериализация.

---

### Task 1: Монорепо, тулчейн, CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.prettierrc`, `.github/workflows/ci.yml`, `README.md`
- Create: `packages/schema/package.json`, `packages/schema/src/index.ts`, `packages/engine/package.json`, `packages/content/package.json`, `packages/data/package.json`, `apps/cli/package.json`
- Test: `packages/schema/test/smoke.test.ts`

**Interfaces:**
- Produces: workspace-пакеты `@ripple/schema`, `@ripple/engine`, `@ripple/content`, `@ripple/data`, `@ripple/cli`, каждый с `exports: { ".": "./src/index.ts" }`; корневые скрипты `pnpm test`, `pnpm typecheck`, `pnpm ripple`.

- [ ] **Step 1: Установить pnpm и создать корневые файлы**

Run: `npm i -g pnpm@9 && pnpm --version` (ожидается `9.x`).

`package.json`:
```json
{
  "name": "ripple",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "format": "prettier --write \"**/*.{ts,json,md,yml}\"",
    "data:build": "tsx packages/data/pipeline/build.ts",
    "ripple": "tsx apps/cli/src/main.ts"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "prettier": "^3.6.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  }
}
```

`tsconfig.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "include": [
    "packages/*/src/**/*.ts",
    "packages/*/test/**/*.ts",
    "packages/*/pipeline/**/*.ts",
    "apps/*/src/**/*.ts",
    "apps/*/test/**/*.ts",
    "vitest.config.ts"
  ]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
```

`.prettierrc`:
```json
{ "singleQuote": true, "printWidth": 110, "trailingComma": "all" }
```

- [ ] **Step 2: Создать пакеты**

`packages/schema/package.json`:
```json
{
  "name": "@ripple/schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.25.0" }
}
```

`packages/engine/package.json`:
```json
{
  "name": "@ripple/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@ripple/schema": "workspace:*" }
}
```

`packages/content/package.json`:
```json
{
  "name": "@ripple/content",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@ripple/schema": "workspace:*" }
}
```

`packages/data/package.json`:
```json
{
  "name": "@ripple/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ripple/schema": "workspace:*",
    "@ripple/content": "workspace:*",
    "topojson-client": "^3.1.0",
    "topojson-server": "^3.0.1",
    "topojson-simplify": "^3.0.3"
  },
  "devDependencies": {
    "@types/topojson-client": "^3.1.5",
    "@types/topojson-server": "^3.0.4",
    "@types/topojson-simplify": "^3.0.3",
    "@types/topojson-specification": "^1.0.5"
  }
}
```

`apps/cli/package.json`:
```json
{
  "name": "@ripple/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ripple/schema": "workspace:*",
    "@ripple/engine": "workspace:*",
    "@ripple/content": "workspace:*"
  }
}
```

`packages/schema/src/index.ts`:
```ts
export const SCHEMA_VERSION = 1;
```

- [ ] **Step 3: Написать smoke-тест, убедиться что он падает до установки**

`packages/schema/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@ripple/schema';

describe('workspace', () => {
  it('resolves @ripple/schema from source', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
```

Run: `pnpm test`
Expected: FAIL (vitest не установлен / пакет не разрешается).

- [ ] **Step 4: Установить зависимости и прогнать**

Run: `pnpm install && pnpm test && pnpm typecheck`
Expected: 1 тест PASS, typecheck без ошибок.

- [ ] **Step 5: CI и README**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
```

`README.md`:
```markdown
# Рябь (Ripple)

Симуляция мира 1980→2050: подбрось событие и смотри, как расходится рябь. Спека: `docs/superpowers/specs/2026-10-26-ripple-design.md`.

## Разработка

    pnpm install
    pnpm test          # все тесты
    pnpm typecheck
    pnpm data:build    # собрать данные (сеть), результат в packages/data/out
    pnpm ripple run --from 1980 --to 2025 --seed 1 --data packages/data/out
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: pnpm monorepo, vitest, typecheck, CI skeleton"
```

---

### Task 2: Схемы данных и int16-кодек

**Files:**
- Create: `packages/schema/src/time.ts`, `countries.ts`, `indicators.ts`, `graph.ts`, `events.ts`, `content.ts`, `run.ts`; Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/time.test.ts`, `packages/schema/test/indicators.test.ts`, `packages/schema/test/events.test.ts`

**Interfaces:**
- Produces: `absMonth(year, month)`, `fromAbs(abs)`, `decadeOf(abs)`, `decadeStartAbs(decade)`, `MONTHS_PER_DECADE`; zod-схемы и типы `Country`, `Transition`, `HistoricalCountry`, `Territory`, `Analogs`, `IndicatorMeta`, `IndicatorsMeta` (с полем `todayAbs` — «сегодня» набора данных), `Edge`, `LinkType`, `Channel`, `EventTypeDef`, `Predicate`, `FollowUp`, `ScheduledEvent`, `PlayerEvent`, `IndicatorConfig`, `EngineConfig` (с `generation.gamma` и `handover.retarget`), `Priors`, `RunRecord` (с `liveHistory`, по умолчанию 0); `encodeGrid`, `decodeGrid`, `MISSING`.

- [ ] **Step 1: Тесты времени и кодека**

`packages/schema/test/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, decadeOf, decadeStartAbs, fromAbs, isJanuary } from '@ripple/schema';

describe('time', () => {
  it('round-trips year/month', () => {
    expect(fromAbs(absMonth(1991, 12))).toEqual({ year: 1991, month: 12 });
    expect(absMonth(1980, 1) + 11).toBe(absMonth(1980, 12));
  });
  it('computes decades', () => {
    expect(decadeOf(absMonth(1986, 4))).toBe(1980);
    expect(decadeStartAbs(1990)).toBe(absMonth(1990, 1));
    expect(isJanuary(absMonth(2001, 1))).toBe(true);
    expect(isJanuary(absMonth(2001, 2))).toBe(false);
  });
  it('rejects bad months', () => {
    expect(() => absMonth(2000, 13)).toThrow();
  });
});
```

`packages/schema/test/indicators.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeGrid, encodeGrid, IndicatorsMeta, MISSING } from '@ripple/schema';

describe('int16 grid codec', () => {
  it('round-trips within quantization error and keeps NaN', () => {
    const src = Float32Array.from([0, 50, 100, NaN, 33.3]);
    const raw = encodeGrid(src, 0, 100);
    expect(raw[3]).toBe(MISSING);
    const back = decodeGrid(raw, 0, 100);
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[2]).toBeCloseTo(100, 2);
    expect(back[4]).toBeCloseTo(33.3, 2);
    expect(Number.isNaN(back[3])).toBe(true);
  });
  it('clips out-of-range values', () => {
    const back = decodeGrid(encodeGrid(Float32Array.from([-5, 105]), 0, 100), 0, 100);
    expect(back[0]).toBeCloseTo(0, 2);
    expect(back[1]).toBeCloseTo(100, 2);
  });
  it('parses meta', () => {
    const meta = IndicatorsMeta.parse({
      dataVersion: 'test',
      countries: ['A'],
      indicators: [
        { code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0, realUntil: 0, source: 'fixture' },
      ],
      firstAbs: 0,
      lastAbs: 11,
      todayAbs: 11,
    });
    expect(meta.indicators[0]?.prior).toBe(false);
  });
});
```

`packages/schema/test/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PlayerEvent, ScheduledEvent } from '@ripple/schema';

describe('event schemas', () => {
  it('applies defaults to scheduled events', () => {
    const e = ScheduledEvent.parse({
      id: 'x', type: 'war', origin: 'real-A', year: 1980, month: 9, countries: ['IRN', 'IRQ'], magnitude: 4,
    });
    expect(e.delayMaxYears).toBe(5);
    expect(e.scope).toBe('list');
    expect(e.hooks).toEqual([]);
  });
  it('rejects magnitude out of range', () => {
    expect(() => PlayerEvent.parse({ type: 'war', country: 'A', magnitude: 6, year: 1990, month: 1 })).toThrow();
  });
});
```

Run: `pnpm test` → FAIL (модули не существуют).

- [ ] **Step 2: Реализовать схемы**

`packages/schema/src/time.ts`:
```ts
export const MONTHS_PER_DECADE = 120;

export function absMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError(`bad month ${month}`);
  return year * 12 + (month - 1);
}
export function fromAbs(abs: number): { year: number; month: number } {
  return { year: Math.floor(abs / 12), month: (((abs % 12) + 12) % 12) + 1 };
}
export function decadeOf(abs: number): number {
  return Math.floor(abs / MONTHS_PER_DECADE) * 10;
}
export function decadeStartAbs(decade: number): number {
  return decade * 12;
}
export function isJanuary(abs: number): boolean {
  return ((abs % 12) + 12) % 12 === 0;
}
```

`packages/schema/src/countries.ts`:
```ts
import { z } from 'zod';

export const LocalizedText = z.object({ ru: z.string(), en: z.string() });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Country = z.object({
  id: z.string().min(3).max(4),
  name: LocalizedText,
  region: z.string(),
  subregion: z.string(),
  from: z.number().int().nullable(), // first abs month of existence; null = since data horizon
  to: z.number().int().nullable(), // last abs month of existence; null = still exists
  successors: z.array(z.string()).default([]),
  predecessors: z.array(z.string()).default([]),
  historical: z.boolean().default(false),
});
export type Country = z.infer<typeof Country>;
export const Countries = z.array(Country);

export const Transition = z.object({
  id: z.string(),
  abs: z.number().int(), // month at whose start the transition applies (baseline)
  kind: z.enum(['split', 'merge', 'secede']),
  from: z.array(z.string()).min(1),
  to: z.array(z.string()).min(1),
  eventId: z.string().optional(),
});
export type Transition = z.infer<typeof Transition>;
export const Transitions = z.array(Transition);

export const HistoricalCountry = z.object({
  id: z.string().min(3).max(4),
  name: LocalizedText,
  region: z.string(),
  subregion: z.string(),
  members: z.array(z.string()).min(1), // modern ids whose data are aggregated into this country
  from: z.number().int().nullable(),
  to: z.number().int(),
});
export type HistoricalCountry = z.infer<typeof HistoricalCountry>;

/** Dependent land with its own geometry but no indicators; drawn in the parent's colour. */
export const Territory = z.object({
  id: z.string().min(3).max(4),
  name: LocalizedText,
  parent: z.string().min(3).max(4), // id of the country that holds it
});
export type Territory = z.infer<typeof Territory>;
export const Territories = z.array(Territory);

/** How a country that outlives its real end continues its trend: real[t] = real[end] + scale × (analog[t − shift] − analog[end − shift]). */
export const AnalogRule = z.object({
  analog: z.string(),
  shiftYears: z.number().int().default(0),
  scale: z.number().positive().default(1),
});
export type AnalogRule = z.infer<typeof AnalogRule>;
export const Analogs = z.record(z.string(), AnalogRule);
export type Analogs = z.infer<typeof Analogs>;

export function existsAt(c: Pick<Country, 'from' | 'to'>, abs: number): boolean {
  return (c.from === null || c.from <= abs) && (c.to === null || abs <= c.to);
}
```

`packages/schema/src/indicators.ts`:
```ts
import { z } from 'zod';

export const IndicatorKind = z.enum(['index', 'rate', 'log10count']);
export type IndicatorKind = z.infer<typeof IndicatorKind>;

export const IndicatorMeta = z.object({
  code: z.string(),
  kind: IndicatorKind,
  min: z.number(),
  max: z.number(),
  stickiness: z.number().min(0).max(1),
  offsetHalflifeYears: z.number().positive(),
  noiseAmp: z.number().min(0),
  realUntil: z.number().int(), // last abs month with observed data
  prior: z.boolean().default(false),
  estimated: z.array(z.string()).default([]),
  source: z.string(),
});
export type IndicatorMeta = z.infer<typeof IndicatorMeta>;

export const IndicatorsMeta = z.object({
  dataVersion: z.string(),
  countries: z.array(z.string()),
  indicators: z.array(IndicatorMeta),
  firstAbs: z.number().int(),
  lastAbs: z.number().int(),
  todayAbs: z.number().int(), // «сегодня»: last month covered by observed (non-projection) series; same for every run on this dataset
});
export type IndicatorsMeta = z.infer<typeof IndicatorsMeta>;

export const MISSING = -32768;
const Q = 32767;

export function encodeGrid(values: ArrayLike<number>, min: number, max: number): Int16Array {
  const out = new Int16Array(values.length);
  const span = max - min;
  for (let k = 0; k < values.length; k++) {
    const v = values[k] as number;
    if (Number.isNaN(v)) {
      out[k] = MISSING;
      continue;
    }
    const q = Math.round(((v - min) / span) * Q);
    out[k] = q < 0 ? 0 : q > Q ? Q : q;
  }
  return out;
}

export function decodeGrid(raw: Int16Array, min: number, max: number): Float32Array {
  const out = new Float32Array(raw.length);
  const span = max - min;
  for (let k = 0; k < raw.length; k++) {
    const q = raw[k] as number;
    out[k] = q === MISSING ? NaN : min + (q / Q) * span;
  }
  return out;
}
```

`packages/schema/src/graph.ts`:
```ts
import { z } from 'zod';

export const LinkType = z.enum(['border', 'trade', 'bloc', 'migration', 'aviation', 'aid', 'sanction']);
export type LinkType = z.infer<typeof LinkType>;

export const Edge = z.object({ a: z.string(), b: z.string(), type: LinkType, weight: z.number().min(0).max(1) });
export type Edge = z.infer<typeof Edge>;

export const Graph = z.object({ dataVersion: z.string(), edges: z.array(Edge) });
export type Graph = z.infer<typeof Graph>;
```

`packages/schema/src/events.ts`:
```ts
import { z } from 'zod';
import { LocalizedText } from './countries.js';
import { LinkType } from './graph.js';

export const Channel = z.enum(['econ', 'safety', 'health', 'info']);
export type Channel = z.infer<typeof Channel>;
export const CHANNELS: readonly Channel[] = ['econ', 'safety', 'health', 'info'];

export const EventGroup = z.enum(['economy', 'politics', 'conflict', 'nature', 'society']);
export type EventGroup = z.infer<typeof EventGroup>;

export const EventTypeDef = z.object({
  id: z.string(),
  group: EventGroup,
  impact: z.record(Channel, z.number()).default({}), // points at magnitude 3; + good, − harm
  shockMonths: z.number().int().min(1).default(1),
  persistMonths: z.number().int().min(0).default(0),
  persistRatio: z.number().min(0).default(0), // persist total = ratio × shock total
  spreadBias: z.record(LinkType, z.number()).default({}),
  playerAllowed: z.boolean().default(false),
  headlines: z.object({ ru: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }),
});
export type EventTypeDef = z.infer<typeof EventTypeDef>;

export const Predicate = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('indicator'),
    indicator: z.string(),
    country: z.string().optional(), // default: primary country of the event
    op: z.enum(['<', '>']),
    rhs: z.union([z.number(), z.object({ baselinePlus: z.number() })]),
  }),
  z.object({ kind: z.literal('eventFired'), event: z.string(), fired: z.boolean().default(true) }),
]);
export type Predicate = z.infer<typeof Predicate>;

export const FollowUp = z.object({
  type: z.string(),
  target: z.union([z.literal('self'), z.literal('neighbors'), z.array(z.string())]),
  delayMonths: z.number().int().min(0),
  magnitude: z.number().int().min(1).max(5),
  probability: z.number().min(0).max(1).default(1),
  persistMonths: z.number().int().min(0).optional(),
});
export type FollowUp = z.infer<typeof FollowUp>;

export const EventOrigin = z.enum(['real-A', 'real-B', 'real-C', 'hook', 'player', 'generated']);
export type EventOrigin = z.infer<typeof EventOrigin>;

export const ScheduledEvent = z.object({
  id: z.string(),
  type: z.string(),
  origin: EventOrigin,
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  countries: z.array(z.string()).min(1), // first is primary
  scope: z.enum(['list', 'global']).default('list'),
  magnitude: z.number().int().min(1).max(5),
  shockMonths: z.number().int().min(1).optional(),
  persistMonths: z.number().int().min(0).optional(),
  preconditions: z.array(Predicate).default([]),
  delayMaxYears: z.number().int().min(0).default(5),
  hooks: z.array(FollowUp).default([]),
  transition: z.string().optional(),
  text: LocalizedText.optional(),
  source: z.string().optional(),
});
export type ScheduledEvent = z.infer<typeof ScheduledEvent>;

export const PlayerEvent = z.object({
  type: z.string(),
  country: z.string(),
  magnitude: z.number().int().min(1).max(5),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});
export type PlayerEvent = z.infer<typeof PlayerEvent>;
```

`packages/schema/src/content.ts`:
```ts
import { z } from 'zod';
import { Channel, EventGroup } from './events.js';
import { IndicatorKind } from './indicators.js';

export const IndicatorConfig = z.object({
  kind: IndicatorKind,
  min: z.number(),
  max: z.number(),
  stickiness: z.number().min(0).max(1),
  offsetHalflifeYears: z.number().positive(),
  noiseAmp: z.number().min(0),
});
export type IndicatorConfig = z.infer<typeof IndicatorConfig>;
export const IndicatorConfigs = z.record(z.string(), IndicatorConfig);

export const ChannelMap = z.record(Channel, z.record(z.string(), z.number()));
export type ChannelMap = z.infer<typeof ChannelMap>;

export const EngineConfig = z.object({
  journal: z.object({ maxTicks: z.number().int().positive(), topPerTick: z.number().int().positive(), minAbs: z.number().min(0) }),
  spill: z.object({ ringFactor: z.number().min(0).max(1), rings: z.record(Channel, z.number().int().min(0)) }),
  generation: z.object({ gamma: z.number().positive() }), // player world before «today»: hazard × max(liveHistory, divergence^gamma)
  handover: z.object({ retarget: z.array(EventGroup) }), // real events of these groups move to the territory holder; others are cancelled
  divergenceSigma: z.number().positive(),
});
export type EngineConfig = z.infer<typeof EngineConfig>;

export const Priors = z.record(
  z.string(),
  z.object({ default: z.number(), bySubregion: z.record(z.string(), z.number()).default({}) }),
);
export type Priors = z.infer<typeof Priors>;
```

`packages/schema/src/run.ts`:
```ts
import { z } from 'zod';
import { PlayerEvent } from './events.js';

export const RunRecord = z.object({
  v: z.literal(1),
  dataVersion: z.string(),
  seed: z.number().int(),
  startYear: z.number().int(),
  endYear: z.number().int(),
  liveHistory: z.number().min(0).max(1).default(0), // «живая история»: how far the player world may drift from history on its own before «today»
  interventions: z.array(PlayerEvent),
});
export type RunRecord = z.infer<typeof RunRecord>;
```

`packages/schema/src/index.ts`:
```ts
export const SCHEMA_VERSION = 1;
export * from './time.js';
export * from './countries.js';
export * from './indicators.js';
export * from './graph.js';
export * from './events.js';
export * from './content.js';
export * from './run.js';
```

- [ ] **Step 3: Прогнать**

Run: `pnpm test && pnpm typecheck`
Expected: все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): time helpers, data/content/event schemas, int16 grid codec"
```

---

### Task 3: Хеш-случайность

**Files:**
- Create: `packages/engine/src/rng.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/rng.test.ts`

**Interfaces:**
- Produces: `hashKeys(seed, ...keys): number` (0..2^53), `uniform(seed, ...keys): number` в [0,1), `chance(p, seed, ...keys): boolean`, `uniformInts(seed, a, b, c, d): number` (быстрый путь без строк), `hashBytes(bytes: Uint8Array): number`.

- [ ] **Step 1: Тест**

`packages/engine/test/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chance, hashBytes, hashKeys, uniform, uniformInts } from '@ripple/engine';

describe('hash rng', () => {
  it('is deterministic and key-sensitive', () => {
    expect(hashKeys(7, 'event', 'ARM', 1988)).toBe(hashKeys(7, 'event', 'ARM', 1988));
    expect(hashKeys(7, 'event', 'ARM', 1988)).not.toBe(hashKeys(8, 'event', 'ARM', 1988));
    expect(hashKeys(7, 'a', 'b')).not.toBe(hashKeys(7, 'ab'));
    expect(uniformInts(1, 2, 3, 4, 5)).toBe(uniformInts(1, 2, 3, 4, 5));
    expect(uniformInts(1, 2, 3, 4, 5)).not.toBe(uniformInts(1, 2, 3, 4, 6));
  });
  it('is roughly uniform', () => {
    const buckets = new Array(10).fill(0);
    let sum = 0;
    const n = 20000;
    for (let k = 0; k < n; k++) {
      const u = uniform(42, 'u', k);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
      buckets[Math.floor(u * 10)]++;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const b of buckets) expect(b / n).toBeGreaterThan(0.08);
    const fast = new Array(10).fill(0);
    for (let k = 0; k < n; k++) fast[Math.floor(uniformInts(42, 1, k, 0, 0) * 10)]++;
    for (const b of fast) expect(b / n).toBeGreaterThan(0.08);
  });
  it('chance respects probability', () => {
    let hits = 0;
    for (let k = 0; k < 10000; k++) if (chance(0.3, 1, 'c', k)) hits++;
    expect(hits / 10000).toBeCloseTo(0.3, 1);
  });
  it('hashes bytes', () => {
    const a = hashBytes(new Uint8Array([1, 2, 3]));
    expect(a).toBe(hashBytes(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(hashBytes(new Uint8Array([1, 2, 4])));
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Реализация**

`packages/engine/src/rng.ts`:
```ts
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
const SEP = '';

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
```

`packages/engine/src/index.ts`:
```ts
export * from './rng.js';
```

- [ ] **Step 3: Прогнать, закоммитить**

Run: `pnpm test packages/engine` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): stateless hash rng (cyrb53 keys, int fast path, byte hash)"
```

---

### Task 4: Контент v0 — каталог, конфиги, переходы, ярус A

**Files:**
- Create: `packages/content/catalog/event-types.json`, `packages/content/catalog/channels.json`, `packages/content/config/indicators.json`, `packages/content/config/engine.json`, `packages/content/priors/indicators.json`, `packages/content/historical-countries.json`, `packages/content/analogs.json`, `packages/content/transitions.json`, `packages/content/events/tier-a.json`, `packages/content/src/index.ts`
- Test: `packages/content/test/content.test.ts`

**Interfaces:**
- Produces: `loadContent(): Content` где `Content = { eventTypes: EventTypeDef[]; channels: ChannelMap; indicatorConfig: Record<string, IndicatorConfig>; engine: EngineConfig; priors: Priors; historicalCountries: HistoricalCountry[]; analogs: Analogs; transitions: Transition[]; events: ScheduledEvent[] }`. Все массивы уже прошли zod (значения по умолчанию заполнены).

- [ ] **Step 1: Тест валидации контента**

`packages/content/test/content.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadContent } from '@ripple/content';

describe('content', () => {
  const c = loadContent();
  it('loads and validates', () => {
    expect(c.eventTypes.length).toBeGreaterThan(20);
    expect(c.events.length).toBeGreaterThan(50);
    expect(c.transitions.length).toBe(11);
  });
  it('references only known event types', () => {
    const types = new Set(c.eventTypes.map((t) => t.id));
    for (const e of c.events) {
      expect(types.has(e.type), `event ${e.id} type ${e.type}`).toBe(true);
      for (const h of e.hooks) expect(types.has(h.type), `hook of ${e.id}: ${h.type}`).toBe(true);
    }
  });
  it('links transitions and events both ways', () => {
    const events = new Map(c.events.map((e) => [e.id, e]));
    for (const t of c.transitions) {
      expect(t.eventId, t.id).toBeDefined();
      const e = events.get(t.eventId!);
      expect(e, `transition ${t.id} → event ${t.eventId}`).toBeDefined();
      expect(e!.transition).toBe(t.id);
      expect(e!.year * 12 + e!.month - 1).toBe(t.abs);
    }
  });
  it('has unique event ids and ru/en texts for headlines', () => {
    const ids = c.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of c.eventTypes) {
      for (const h of [...t.headlines.ru, ...t.headlines.en]) expect(h).toContain('{country}');
    }
  });
  it('channel map targets configured indicators', () => {
    for (const [, m] of Object.entries(c.channels)) {
      for (const code of Object.keys(m)) expect(c.indicatorConfig[code], code).toBeDefined();
    }
  });
  it('maps analogs from historical countries to modern ones, with defaults filled in', () => {
    const historical = new Set(c.historicalCountries.map((h) => h.id));
    for (const [id, rule] of Object.entries(c.analogs)) {
      expect(historical.has(id), `analog key ${id}`).toBe(true);
      expect(historical.has(rule.analog), `analog ${rule.analog} of ${id}`).toBe(false);
    }
    expect(c.analogs.SUN).toEqual({ analog: 'CHN', shiftYears: 0, scale: 0.6 });
    expect(c.engine.handover.retarget).toEqual(['nature']);
    expect(c.engine.generation.gamma).toBeGreaterThan(0);
  });
});
```

Run: `pnpm test packages/content` → FAIL.

- [ ] **Step 2: Каталог типов событий**

`packages/content/catalog/event-types.json` (очки на силе 3; знак + польза, − вред):
```json
[
  { "id": "war", "group": "conflict", "impact": { "econ": -6, "safety": -15, "health": -4 }, "shockMonths": 3, "persistMonths": 24, "persistRatio": 1.0, "spreadBias": { "border": 1 }, "playerAllowed": true, "headlines": { "ru": ["{country}: началась война"], "en": ["{country}: war breaks out"] } },
  { "id": "civil_war", "group": "conflict", "impact": { "econ": -8, "safety": -18, "health": -5 }, "shockMonths": 3, "persistMonths": 36, "persistRatio": 1.2, "spreadBias": { "border": 0.8 }, "headlines": { "ru": ["{country}: гражданская война"], "en": ["{country}: civil war"] } },
  { "id": "ceasefire", "group": "conflict", "impact": { "safety": 8, "econ": 2 }, "shockMonths": 1, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: перемирие"], "en": ["{country}: ceasefire"] } },
  { "id": "terror", "group": "conflict", "impact": { "safety": -6, "info": -2 }, "shockMonths": 1, "persistMonths": 6, "persistRatio": 0.5, "headlines": { "ru": ["{country}: теракт"], "en": ["{country}: terror attack"] } },
  { "id": "coup", "group": "politics", "impact": { "safety": -10, "econ": -3, "info": -3 }, "shockMonths": 2, "persistMonths": 12, "persistRatio": 0.5, "playerAllowed": true, "headlines": { "ru": ["{country}: военный переворот"], "en": ["{country}: military coup"] } },
  { "id": "crackdown", "group": "politics", "impact": { "safety": -6, "info": -8 }, "shockMonths": 2, "persistMonths": 24, "persistRatio": 0.8, "playerAllowed": true, "headlines": { "ru": ["{country}: власти закручивают гайки"], "en": ["{country}: government cracks down"] } },
  { "id": "liberalization", "group": "politics", "impact": { "info": 8, "safety": -3, "econ": 2 }, "shockMonths": 3, "persistMonths": 24, "persistRatio": 1.0, "playerAllowed": true, "headlines": { "ru": ["{country}: политическая оттепель"], "en": ["{country}: political opening"] } },
  { "id": "protests", "group": "politics", "impact": { "safety": -6, "econ": -1 }, "shockMonths": 2, "persistMonths": 6, "persistRatio": 0.5, "playerAllowed": true, "headlines": { "ru": ["{country}: массовые протесты"], "en": ["{country}: mass protests"] } },
  { "id": "revolution", "group": "politics", "impact": { "safety": -12, "econ": -5, "info": 4 }, "shockMonths": 2, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: революция"], "en": ["{country}: revolution"] } },
  { "id": "election_change", "group": "politics", "impact": { "info": 3, "safety": 2, "econ": 1 }, "shockMonths": 1, "persistMonths": 12, "persistRatio": 1.0, "headlines": { "ru": ["{country}: выборы меняют курс"], "en": ["{country}: election changes course"] } },
  { "id": "dissolution", "group": "politics", "impact": { "econ": -10, "safety": -12, "info": 3 }, "shockMonths": 3, "persistMonths": 36, "persistRatio": 1.0, "headlines": { "ru": ["{country}: государство распадается"], "en": ["{country}: the state dissolves"] } },
  { "id": "unification", "group": "politics", "impact": { "econ": -2, "safety": 4, "info": 3 }, "shockMonths": 2, "persistMonths": 24, "persistRatio": 0.5, "headlines": { "ru": ["{country}: объединение"], "en": ["{country}: unification"] } },
  { "id": "independence", "group": "politics", "impact": { "safety": 3, "econ": -2, "info": 4 }, "shockMonths": 1, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: провозглашена независимость"], "en": ["{country}: independence declared"] } },
  { "id": "reform", "group": "politics", "impact": { "safety": 6, "econ": 2, "info": 2 }, "shockMonths": 6, "persistMonths": 36, "persistRatio": 1.0, "playerAllowed": true, "headlines": { "ru": ["{country}: правительство запускает реформы"], "en": ["{country}: government launches reforms"] } },
  { "id": "boom", "group": "economy", "impact": { "econ": 6 }, "shockMonths": 6, "persistMonths": 24, "persistRatio": 1.0, "headlines": { "ru": ["{country}: экономический бум"], "en": ["{country}: economic boom"] } },
  { "id": "recession", "group": "economy", "impact": { "econ": -5 }, "shockMonths": 3, "persistMonths": 12, "persistRatio": 0.5, "spreadBias": { "trade": 1, "border": 0.5 }, "headlines": { "ru": ["{country}: рецессия"], "en": ["{country}: recession"] } },
  { "id": "financial_crash", "group": "economy", "impact": { "econ": -6 }, "shockMonths": 1, "persistMonths": 6, "persistRatio": 0.5, "spreadBias": { "trade": 1, "border": 0.3 }, "headlines": { "ru": ["{country}: обвал биржи"], "en": ["{country}: stock market crash"] } },
  { "id": "banking_crisis", "group": "economy", "impact": { "econ": -10, "safety": -2 }, "shockMonths": 3, "persistMonths": 24, "persistRatio": 1.0, "spreadBias": { "trade": 1, "border": 0.5 }, "playerAllowed": true, "headlines": { "ru": ["{country}: банковский кризис"], "en": ["{country}: banking crisis"] } },
  { "id": "default", "group": "economy", "impact": { "econ": -12, "safety": -3 }, "shockMonths": 2, "persistMonths": 24, "persistRatio": 1.0, "spreadBias": { "trade": 0.8, "border": 0.4 }, "headlines": { "ru": ["{country}: дефолт"], "en": ["{country}: sovereign default"] } },
  { "id": "hyperinflation", "group": "economy", "impact": { "econ": -8, "safety": -4 }, "shockMonths": 6, "persistMonths": 24, "persistRatio": 1.0, "headlines": { "ru": ["{country}: гиперинфляция"], "en": ["{country}: hyperinflation"] } },
  { "id": "sanctions", "group": "economy", "impact": { "econ": -5, "info": -2 }, "shockMonths": 1, "persistMonths": 60, "persistRatio": 2.0, "playerAllowed": true, "headlines": { "ru": ["{country}: введены санкции"], "en": ["{country}: sanctions imposed"] } },
  { "id": "oil_price_crash", "group": "economy", "impact": { "econ": -8 }, "shockMonths": 3, "persistMonths": 24, "persistRatio": 1.0, "headlines": { "ru": ["{country}: обвал цен на нефть бьёт по бюджету"], "en": ["{country}: oil price crash hits the budget"] } },
  { "id": "oil_price_spike", "group": "economy", "impact": { "econ": -4 }, "shockMonths": 3, "persistMonths": 6, "persistRatio": 0.5, "headlines": { "ru": ["{country}: нефть дорожает, экономика тормозит"], "en": ["{country}: oil spike slows the economy"] } },
  { "id": "discovery_resources", "group": "economy", "impact": { "econ": 8 }, "shockMonths": 12, "persistMonths": 60, "persistRatio": 1.5, "playerAllowed": true, "headlines": { "ru": ["{country}: открыто крупное месторождение"], "en": ["{country}: major resource discovery"] } },
  { "id": "investment", "group": "economy", "impact": { "econ": 6 }, "shockMonths": 6, "persistMonths": 36, "persistRatio": 1.0, "playerAllowed": true, "headlines": { "ru": ["{country}: масштабные инвестиции в промышленность"], "en": ["{country}: large-scale industrial investment"] } },
  { "id": "earthquake", "group": "nature", "impact": { "health": -6, "econ": -3, "safety": -2 }, "shockMonths": 1, "persistMonths": 12, "persistRatio": 0.5, "playerAllowed": true, "headlines": { "ru": ["{country}: разрушительное землетрясение"], "en": ["{country}: devastating earthquake"] } },
  { "id": "flood", "group": "nature", "impact": { "health": -3, "econ": -3 }, "shockMonths": 1, "persistMonths": 6, "persistRatio": 0.5, "headlines": { "ru": ["{country}: наводнение"], "en": ["{country}: flooding"] } },
  { "id": "drought_famine", "group": "nature", "impact": { "health": -10, "econ": -6, "safety": -4 }, "shockMonths": 6, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: засуха и голод"], "en": ["{country}: drought and famine"] } },
  { "id": "epidemic", "group": "nature", "impact": { "health": -8, "econ": -3 }, "shockMonths": 3, "persistMonths": 12, "persistRatio": 0.8, "spreadBias": { "aviation": 1, "border": 0.5 }, "playerAllowed": true, "headlines": { "ru": ["{country}: вспышка эпидемии"], "en": ["{country}: epidemic outbreak"] } },
  { "id": "industrial_accident", "group": "nature", "impact": { "health": -4, "econ": -1, "info": -2 }, "shockMonths": 1, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: техногенная катастрофа"], "en": ["{country}: industrial disaster"] } },
  { "id": "nuclear_accident", "group": "nature", "impact": { "health": -6, "info": -6, "econ": -2 }, "shockMonths": 2, "persistMonths": 24, "persistRatio": 1.0, "spreadBias": { "border": 1 }, "headlines": { "ru": ["{country}: авария на АЭС"], "en": ["{country}: nuclear accident"] } },
  { "id": "tech_breakthrough", "group": "society", "impact": { "econ": 5, "health": 2 }, "shockMonths": 12, "persistMonths": 60, "persistRatio": 1.5, "playerAllowed": true, "headlines": { "ru": ["{country}: технологический прорыв"], "en": ["{country}: technological breakthrough"] } },
  { "id": "migration_wave", "group": "society", "impact": { "econ": -1, "safety": -3, "info": -2 }, "shockMonths": 3, "persistMonths": 12, "persistRatio": 0.5, "headlines": { "ru": ["{country}: волна беженцев"], "en": ["{country}: refugee wave"] } },
  { "id": "info_campaign", "group": "society", "impact": { "info": 4 }, "shockMonths": 3, "persistMonths": 6, "persistRatio": 0.5, "playerAllowed": true, "headlines": { "ru": ["{country}: информационная кампания"], "en": ["{country}: information campaign"] } }
]
```

`packages/content/catalog/channels.json` (очки канала → очки индикаторов):
```json
{
  "econ": { "economy": 1.0, "inflation": -0.8, "stability": 0.3, "happiness": 0.3 },
  "safety": { "stability": 1.0, "happiness": 0.4, "economy": 0.3 },
  "health": { "health": 1.0, "happiness": 0.3 },
  "info": { "stability": 0.15, "freedom": 0.3 }
}
```

- [ ] **Step 3: Конфиги, приоры, исторические страны, аналоги, переходы**

`packages/content/config/indicators.json`:
```json
{
  "economy":      { "kind": "index", "min": 0, "max": 100, "stickiness": 0.15, "offsetHalflifeYears": 15, "noiseAmp": 0.05 },
  "inequality":   { "kind": "index", "min": 0, "max": 100, "stickiness": 0.05, "offsetHalflifeYears": 20, "noiseAmp": 0.02 },
  "health":       { "kind": "index", "min": 0, "max": 100, "stickiness": 0.10, "offsetHalflifeYears": 10, "noiseAmp": 0.02 },
  "education":    { "kind": "index", "min": 0, "max": 100, "stickiness": 0.05, "offsetHalflifeYears": 20, "noiseAmp": 0.02 },
  "inflation":    { "kind": "rate",  "min": -50, "max": 5000, "stickiness": 0.30, "offsetHalflifeYears": 3, "noiseAmp": 0.05 },
  "information":  { "kind": "index", "min": 0, "max": 100, "stickiness": 0.10, "offsetHalflifeYears": 10, "noiseAmp": 0.02 },
  "freedom":      { "kind": "index", "min": 0, "max": 100, "stickiness": 0.10, "offsetHalflifeYears": 20, "noiseAmp": 0.03 },
  "institutions": { "kind": "index", "min": 0, "max": 100, "stickiness": 0.05, "offsetHalflifeYears": 20, "noiseAmp": 0.02 },
  "stability":    { "kind": "index", "min": 0, "max": 100, "stickiness": 0.30, "offsetHalflifeYears": 5, "noiseAmp": 0.05 },
  "happiness":    { "kind": "index", "min": 0, "max": 100, "stickiness": 0.20, "offsetHalflifeYears": 8, "noiseAmp": 0.03 },
  "population":   { "kind": "log10count", "min": 0, "max": 13, "stickiness": 0.50, "offsetHalflifeYears": 30, "noiseAmp": 0 },
  "gdp":          { "kind": "log10count", "min": 0, "max": 15, "stickiness": 0.15, "offsetHalflifeYears": 15, "noiseAmp": 0 }
}
```

`packages/content/config/engine.json`:
```json
{
  "journal": { "maxTicks": 1200, "topPerTick": 400, "minAbs": 0.01 },
  "spill": { "ringFactor": 0.25, "rings": { "econ": 2, "safety": 1, "health": 1, "info": 1 } },
  "generation": { "gamma": 1.5 },
  "handover": { "retarget": ["nature"] },
  "divergenceSigma": 40
}
```

`packages/content/priors/indicators.json` (названия субрегионов как в Natural Earth `SUBREGION`):
```json
{
  "stability": {
    "default": 60,
    "bySubregion": {
      "Northern America": 85, "Western Europe": 85, "Northern Europe": 88, "Southern Europe": 72, "Eastern Europe": 60,
      "Australia and New Zealand": 88, "Eastern Asia": 70, "South-Eastern Asia": 55, "Southern Asia": 45, "Central Asia": 55,
      "Western Asia": 45, "Northern Africa": 50, "Western Africa": 40, "Eastern Africa": 38, "Middle Africa": 35,
      "Southern Africa": 50, "Central America": 48, "Caribbean": 55, "South America": 50, "Melanesia": 55,
      "Micronesia": 65, "Polynesia": 65
    }
  }
}
```

`packages/content/historical-countries.json` (`from: null` = существует с горизонта данных; `to` = последний месяц существования = месяц перехода − 1):
```json
[
  { "id": "SUN", "name": { "ru": "СССР", "en": "Soviet Union" }, "region": "Europe", "subregion": "Eastern Europe", "members": ["RUS","UKR","BLR","MDA","GEO","ARM","AZE","KAZ","UZB","TKM","KGZ","TJK","EST","LVA","LTU"], "from": null, "to": 23902 },
  { "id": "YUG", "name": { "ru": "Югославия", "en": "Yugoslavia" }, "region": "Europe", "subregion": "Southern Europe", "members": ["SVN","HRV","BIH","MKD","SRB","MNE","XKX"], "from": null, "to": 23906 },
  { "id": "SCG", "name": { "ru": "Союзная Республика Югославия", "en": "FR Yugoslavia / Serbia and Montenegro" }, "region": "Europe", "subregion": "Southern Europe", "members": ["SRB","MNE","XKX"], "from": 23907, "to": 24076 },
  { "id": "CSK", "name": { "ru": "Чехословакия", "en": "Czechoslovakia" }, "region": "Europe", "subregion": "Eastern Europe", "members": ["CZE","SVK"], "from": null, "to": 23915 },
  { "id": "DDR", "name": { "ru": "ГДР", "en": "East Germany" }, "region": "Europe", "subregion": "Western Europe", "members": ["DEU"], "from": null, "to": 23888 },
  { "id": "YMD", "name": { "ru": "Южный Йемен", "en": "South Yemen" }, "region": "Asia", "subregion": "Western Asia", "members": ["YEM"], "from": null, "to": 23883 }
]
```
Справка по числам: `absMonth(1991,12)=23903`, `(1992,4)=23907`, `(2006,6)=24077`, `(1993,1)=23916`, `(1990,10)=23889`, `(1990,5)=23884`, `(1990,3)=23882`, `(1993,5)=23920`, `(2002,5)=24028`, `(2008,2)=24097`, `(2011,7)=24138`. Члены DDR и YMD помечены как `DEU`/`YEM` только для того, чтобы у исторической страны были веса населения; их ряды в v0 оцениваются по субрегиону (пометка `estimated`).

`packages/content/analogs.json` — аналог тренда для страны, которая в мире игрока пережила свой реальный конец (ADR 0005): `real[t] = real[конец] + scale × (analog[t − shift] − analog[конец − shift])`. Ключ — историческая страна, `analog` — современная; `shiftYears` и `scale` можно опускать (0 и 1). Без записи движок берёт медианную траекторию субрегиона страны. В v0 авторская запись одна:
```json
{
  "SUN": { "analog": "CHN", "scale": 0.6 }
}
```

`packages/content/transitions.json`:
```json
[
  { "id": "nam-1990", "abs": 23882, "kind": "secede", "from": ["ZAF"], "to": ["NAM"], "eventId": "namibia-independence-1990" },
  { "id": "yem-1990", "abs": 23884, "kind": "merge", "from": ["YEM", "YMD"], "to": ["YEM"], "eventId": "yemen-unification-1990" },
  { "id": "deu-1990", "abs": 23889, "kind": "merge", "from": ["DEU", "DDR"], "to": ["DEU"], "eventId": "germany-unification-1990" },
  { "id": "sun-1991", "abs": 23903, "kind": "split", "from": ["SUN"], "to": ["RUS","UKR","BLR","MDA","GEO","ARM","AZE","KAZ","UZB","TKM","KGZ","TJK","EST","LVA","LTU"], "eventId": "ussr-dissolution-1991" },
  { "id": "yug-1992", "abs": 23907, "kind": "split", "from": ["YUG"], "to": ["SVN","HRV","BIH","MKD","SCG"], "eventId": "yugoslavia-dissolution-1992" },
  { "id": "csk-1993", "abs": 23916, "kind": "split", "from": ["CSK"], "to": ["CZE","SVK"], "eventId": "czechoslovakia-split-1993" },
  { "id": "eri-1993", "abs": 23920, "kind": "secede", "from": ["ETH"], "to": ["ERI"], "eventId": "eritrea-independence-1993" },
  { "id": "tls-2002", "abs": 24028, "kind": "secede", "from": ["IDN"], "to": ["TLS"], "eventId": "east-timor-independence-2002" },
  { "id": "scg-2006", "abs": 24077, "kind": "split", "from": ["SCG"], "to": ["SRB","MNE"], "eventId": "montenegro-independence-2006" },
  { "id": "xkx-2008", "abs": 24097, "kind": "secede", "from": ["SRB"], "to": ["XKX"], "eventId": "kosovo-independence-2008" },
  { "id": "ssd-2011", "abs": 24138, "kind": "secede", "from": ["SDN"], "to": ["SSD"], "eventId": "south-sudan-independence-2011" }
]
```

- [ ] **Step 4: Ярус A**

`packages/content/events/tier-a.json` (поле `origin` везде `real-A`; `P(x)` ниже — сокращение, в файле писать полный объект предусловия вида `{"kind":"indicator","indicator":"stability","country":"SUN","op":"<","rhs":{"baselinePlus":15}}`; `F(id)` = `{"kind":"eventFired","event":"id"}`):
```json
[
  { "id": "pol-solidarity-1980", "type": "protests", "origin": "real-A", "year": 1980, "month": 8, "countries": ["POL"], "magnitude": 3, "text": { "ru": "Гданьск: рождение «Солидарности»", "en": "Gdańsk: Solidarity is born" } },
  { "id": "irn-irq-war-1980", "type": "war", "origin": "real-A", "year": 1980, "month": 9, "countries": ["IRN", "IRQ"], "magnitude": 4, "persistMonths": 95, "text": { "ru": "Ирак вторгается в Иран: начало ирано-иракской войны", "en": "Iraq invades Iran: the Iran–Iraq War begins" } },
  { "id": "pol-martial-law-1981", "type": "crackdown", "origin": "real-A", "year": 1981, "month": 12, "countries": ["POL"], "magnitude": 3, "text": { "ru": "Польша: военное положение", "en": "Poland: martial law declared" } },
  { "id": "falklands-1982", "type": "war", "origin": "real-A", "year": 1982, "month": 4, "countries": ["ARG", "GBR"], "magnitude": 2, "persistMonths": 2, "text": { "ru": "Фолклендская война", "en": "The Falklands War" } },
  { "id": "lebanon-war-1982", "type": "war", "origin": "real-A", "year": 1982, "month": 6, "countries": ["LBN", "ISR"], "magnitude": 3, "persistMonths": 36, "text": { "ru": "Израиль вторгается в Ливан", "en": "Israel invades Lebanon" } },
  { "id": "ethiopia-famine-1984", "type": "drought_famine", "origin": "real-A", "year": 1984, "month": 10, "countries": ["ETH"], "magnitude": 5, "persistMonths": 18, "text": { "ru": "Голод в Эфиопии", "en": "Famine in Ethiopia" } },
  { "id": "bhopal-1984", "type": "industrial_accident", "origin": "real-A", "year": 1984, "month": 12, "countries": ["IND"], "magnitude": 3, "text": { "ru": "Катастрофа в Бхопале", "en": "The Bhopal disaster" } },
  { "id": "perestroika-1985", "type": "liberalization", "origin": "real-A", "year": 1985, "month": 3, "countries": ["SUN"], "magnitude": 3, "persistMonths": 60, "text": { "ru": "Горбачёв: начало перестройки", "en": "Gorbachev: perestroika begins" } },
  { "id": "mexico-earthquake-1985", "type": "earthquake", "origin": "real-A", "year": 1985, "month": 9, "countries": ["MEX"], "magnitude": 3, "text": { "ru": "Землетрясение в Мехико", "en": "Mexico City earthquake" } },
  { "id": "oil-crash-1986", "type": "oil_price_crash", "origin": "real-A", "year": 1986, "month": 1, "countries": ["SAU", "SUN", "VEN", "NGA", "MEX", "IRN", "IRQ", "NOR", "GBR", "DZA", "LBY"], "magnitude": 4, "persistMonths": 36, "text": { "ru": "Обвал цен на нефть", "en": "Oil price collapse" } },
  { "id": "chernobyl-1986", "type": "nuclear_accident", "origin": "real-A", "year": 1986, "month": 4, "countries": ["SUN"], "magnitude": 5, "persistMonths": 36, "text": { "ru": "Авария на Чернобыльской АЭС", "en": "The Chernobyl disaster" } },
  { "id": "black-monday-1987", "type": "financial_crash", "origin": "real-A", "year": 1987, "month": 10, "countries": ["USA"], "magnitude": 2, "hooks": [ { "type": "financial_crash", "target": ["GBR", "JPN", "DEU", "FRA", "AUS"], "delayMonths": 0, "magnitude": 2 } ], "text": { "ru": "«Чёрный понедельник» на Уолл-стрит", "en": "Black Monday on Wall Street" } },
  { "id": "spitak-1988", "type": "earthquake", "origin": "real-A", "year": 1988, "month": 12, "countries": ["SUN"], "magnitude": 4, "text": { "ru": "Спитакское землетрясение в Армении", "en": "The Spitak earthquake in Armenia" } },
  { "id": "tiananmen-1989", "type": "crackdown", "origin": "real-A", "year": 1989, "month": 6, "countries": ["CHN"], "magnitude": 3, "text": { "ru": "Тяньаньмэнь", "en": "Tiananmen Square" } },
  { "id": "berlin-wall-1989", "type": "liberalization", "origin": "real-A", "year": 1989, "month": 11, "countries": ["DDR"], "magnitude": 5, "preconditions": [ { "kind": "indicator", "indicator": "stability", "country": "SUN", "op": "<", "rhs": { "baselinePlus": 15 } } ], "text": { "ru": "Падение Берлинской стены", "en": "The Berlin Wall falls" } },
  { "id": "velvet-revolution-1989", "type": "liberalization", "origin": "real-A", "year": 1989, "month": 11, "countries": ["CSK"], "magnitude": 4, "preconditions": [ { "kind": "eventFired", "event": "berlin-wall-1989" } ], "text": { "ru": "Бархатная революция", "en": "The Velvet Revolution" } },
  { "id": "romania-1989", "type": "revolution", "origin": "real-A", "year": 1989, "month": 12, "countries": ["ROU"], "magnitude": 4, "preconditions": [ { "kind": "eventFired", "event": "berlin-wall-1989" } ], "text": { "ru": "Румынская революция", "en": "The Romanian Revolution" } },
  { "id": "namibia-independence-1990", "type": "independence", "origin": "real-A", "year": 1990, "month": 3, "countries": ["NAM", "ZAF"], "magnitude": 2, "transition": "nam-1990", "text": { "ru": "Независимость Намибии", "en": "Namibian independence" } },
  { "id": "yemen-unification-1990", "type": "unification", "origin": "real-A", "year": 1990, "month": 5, "countries": ["YEM", "YMD"], "magnitude": 2, "transition": "yem-1990", "text": { "ru": "Объединение Йемена", "en": "Yemeni unification" } },
  { "id": "gulf-war-1990", "type": "war", "origin": "real-A", "year": 1990, "month": 8, "countries": ["IRQ", "KWT"], "magnitude": 4, "persistMonths": 7, "text": { "ru": "Ирак вторгается в Кувейт", "en": "Iraq invades Kuwait" } },
  { "id": "germany-unification-1990", "type": "unification", "origin": "real-A", "year": 1990, "month": 10, "countries": ["DEU", "DDR"], "magnitude": 4, "transition": "deu-1990", "preconditions": [ { "kind": "eventFired", "event": "berlin-wall-1989" } ], "text": { "ru": "Объединение Германии", "en": "German reunification" } },
  { "id": "yugoslav-wars-1991", "type": "civil_war", "origin": "real-A", "year": 1991, "month": 6, "countries": ["YUG"], "magnitude": 5, "persistMonths": 10, "preconditions": [ { "kind": "indicator", "indicator": "stability", "country": "YUG", "op": "<", "rhs": { "baselinePlus": 15 } } ], "text": { "ru": "Словения и Хорватия объявляют независимость, начинаются войны", "en": "Slovenia and Croatia declare independence; the Yugoslav wars begin" } },
  { "id": "ussr-coup-1991", "type": "coup", "origin": "real-A", "year": 1991, "month": 8, "countries": ["SUN"], "magnitude": 3, "preconditions": [ { "kind": "indicator", "indicator": "stability", "country": "SUN", "op": "<", "rhs": { "baselinePlus": 15 } } ], "text": { "ru": "Августовский путч", "en": "The August coup attempt" } },
  { "id": "ussr-dissolution-1991", "type": "dissolution", "origin": "real-A", "year": 1991, "month": 12, "countries": ["SUN"], "magnitude": 5, "persistMonths": 48, "transition": "sun-1991", "preconditions": [ { "kind": "indicator", "indicator": "stability", "country": "SUN", "op": "<", "rhs": { "baselinePlus": 15 } } ], "hooks": [ { "type": "banking_crisis", "target": ["RUS", "UKR", "BLR", "KAZ", "GEO", "ARM", "AZE", "MDA", "TJK", "KGZ", "UZB", "TKM"], "delayMonths": 1, "magnitude": 4, "persistMonths": 48 }, { "type": "war", "target": ["ARM", "AZE"], "delayMonths": 2, "magnitude": 4, "persistMonths": 26 }, { "type": "civil_war", "target": ["TJK"], "delayMonths": 5, "magnitude": 4, "persistMonths": 60 }, { "type": "civil_war", "target": ["GEO"], "delayMonths": 8, "magnitude": 3, "persistMonths": 16 }, { "type": "war", "target": ["MDA"], "delayMonths": 3, "magnitude": 2, "persistMonths": 4 } ], "text": { "ru": "Распад СССР", "en": "Dissolution of the Soviet Union" } },
  { "id": "yugoslavia-dissolution-1992", "type": "dissolution", "origin": "real-A", "year": 1992, "month": 4, "countries": ["YUG"], "magnitude": 5, "persistMonths": 48, "transition": "yug-1992", "preconditions": [ { "kind": "eventFired", "event": "yugoslav-wars-1991" } ], "hooks": [ { "type": "civil_war", "target": ["BIH"], "delayMonths": 0, "magnitude": 5, "persistMonths": 43 }, { "type": "war", "target": ["HRV", "SCG"], "delayMonths": 0, "magnitude": 4, "persistMonths": 42 } ], "text": { "ru": "Конец СФРЮ, война в Боснии", "en": "End of the SFRY; war in Bosnia" } },
  { "id": "czechoslovakia-split-1993", "type": "dissolution", "origin": "real-A", "year": 1993, "month": 1, "countries": ["CSK"], "magnitude": 1, "transition": "csk-1993", "preconditions": [ { "kind": "indicator", "indicator": "freedom", "country": "CSK", "op": ">", "rhs": { "baselinePlus": -15 } } ], "text": { "ru": "Бархатный развод: Чехия и Словакия", "en": "The Velvet Divorce: Czechia and Slovakia" } },
  { "id": "eritrea-independence-1993", "type": "independence", "origin": "real-A", "year": 1993, "month": 5, "countries": ["ERI", "ETH"], "magnitude": 2, "transition": "eri-1993", "text": { "ru": "Независимость Эритреи", "en": "Eritrean independence" } },
  { "id": "rwanda-genocide-1994", "type": "civil_war", "origin": "real-A", "year": 1994, "month": 4, "countries": ["RWA"], "magnitude": 5, "persistMonths": 4, "text": { "ru": "Геноцид в Руанде", "en": "The Rwandan genocide" } },
  { "id": "south-africa-election-1994", "type": "election_change", "origin": "real-A", "year": 1994, "month": 4, "countries": ["ZAF"], "magnitude": 4, "text": { "ru": "ЮАР: первые всеобщие выборы, конец апартеида", "en": "South Africa: first universal elections, end of apartheid" } },
  { "id": "mexico-peso-1994", "type": "financial_crash", "origin": "real-A", "year": 1994, "month": 12, "countries": ["MEX"], "magnitude": 3, "persistMonths": 12, "text": { "ru": "Мексика: кризис песо", "en": "Mexico: the peso crisis" } },
  { "id": "kobe-earthquake-1995", "type": "earthquake", "origin": "real-A", "year": 1995, "month": 1, "countries": ["JPN"], "magnitude": 3, "text": { "ru": "Землетрясение в Кобе", "en": "The Kobe earthquake" } },
  { "id": "asian-crisis-1997", "type": "banking_crisis", "origin": "real-A", "year": 1997, "month": 7, "countries": ["THA"], "magnitude": 4, "hooks": [ { "type": "banking_crisis", "target": ["IDN"], "delayMonths": 3, "magnitude": 5 }, { "type": "banking_crisis", "target": ["KOR"], "delayMonths": 4, "magnitude": 4 }, { "type": "banking_crisis", "target": ["MYS", "PHL"], "delayMonths": 2, "magnitude": 3 } ], "text": { "ru": "Азиатский финансовый кризис", "en": "The Asian financial crisis" } },
  { "id": "russia-default-1998", "type": "default", "origin": "real-A", "year": 1998, "month": 8, "countries": ["RUS"], "magnitude": 4, "hooks": [ { "type": "banking_crisis", "target": ["UKR", "KAZ", "BLR"], "delayMonths": 1, "magnitude": 2 } ], "text": { "ru": "Дефолт в России", "en": "Russia defaults" } },
  { "id": "kosovo-war-1999", "type": "war", "origin": "real-A", "year": 1999, "month": 3, "countries": ["SCG"], "magnitude": 3, "persistMonths": 3, "text": { "ru": "Война в Косове, бомбардировки НАТО", "en": "The Kosovo War; NATO bombing" } },
  { "id": "sept-11-2001", "type": "terror", "origin": "real-A", "year": 2001, "month": 9, "countries": ["USA"], "magnitude": 4, "hooks": [ { "type": "war", "target": ["AFG"], "delayMonths": 1, "magnitude": 4, "persistMonths": 200 } ], "text": { "ru": "11 сентября", "en": "September 11" } },
  { "id": "argentina-default-2001", "type": "default", "origin": "real-A", "year": 2001, "month": 12, "countries": ["ARG"], "magnitude": 4, "text": { "ru": "Дефолт Аргентины", "en": "Argentina defaults" } },
  { "id": "east-timor-independence-2002", "type": "independence", "origin": "real-A", "year": 2002, "month": 5, "countries": ["TLS", "IDN"], "magnitude": 2, "transition": "tls-2002", "text": { "ru": "Независимость Восточного Тимора", "en": "East Timor becomes independent" } },
  { "id": "sars-2003", "type": "epidemic", "origin": "real-A", "year": 2003, "month": 3, "countries": ["CHN"], "magnitude": 2, "text": { "ru": "Вспышка атипичной пневмонии", "en": "The SARS outbreak" } },
  { "id": "iraq-war-2003", "type": "war", "origin": "real-A", "year": 2003, "month": 3, "countries": ["IRQ", "USA"], "magnitude": 4, "persistMonths": 60, "text": { "ru": "Вторжение в Ирак", "en": "The invasion of Iraq" } },
  { "id": "indian-ocean-tsunami-2004", "type": "earthquake", "origin": "real-A", "year": 2004, "month": 12, "countries": ["IDN", "LKA", "THA", "IND"], "magnitude": 4, "text": { "ru": "Цунами в Индийском океане", "en": "The Indian Ocean tsunami" } },
  { "id": "katrina-2005", "type": "flood", "origin": "real-A", "year": 2005, "month": 8, "countries": ["USA"], "magnitude": 2, "text": { "ru": "Ураган «Катрина»", "en": "Hurricane Katrina" } },
  { "id": "montenegro-independence-2006", "type": "independence", "origin": "real-A", "year": 2006, "month": 6, "countries": ["MNE", "SCG"], "magnitude": 1, "transition": "scg-2006", "text": { "ru": "Черногория выходит из союза с Сербией", "en": "Montenegro leaves the union with Serbia" } },
  { "id": "kosovo-independence-2008", "type": "independence", "origin": "real-A", "year": 2008, "month": 2, "countries": ["XKX", "SRB"], "magnitude": 2, "transition": "xkx-2008", "text": { "ru": "Косово провозглашает независимость", "en": "Kosovo declares independence" } },
  { "id": "oil-spike-2008", "type": "oil_price_spike", "origin": "real-A", "year": 2008, "month": 7, "countries": ["USA", "CHN", "JPN", "DEU", "IND", "KOR", "FRA", "ITA", "ESP"], "magnitude": 3, "text": { "ru": "Нефть выше 140 долларов", "en": "Oil above $140" } },
  { "id": "financial-crisis-2008", "type": "banking_crisis", "origin": "real-A", "year": 2008, "month": 9, "countries": ["USA"], "magnitude": 5, "persistMonths": 30, "preconditions": [ { "kind": "indicator", "indicator": "economy", "country": "USA", "op": ">", "rhs": { "baselinePlus": -10 } } ], "hooks": [ { "type": "banking_crisis", "target": ["GBR", "IRL", "ISL"], "delayMonths": 1, "magnitude": 5 }, { "type": "banking_crisis", "target": ["DEU", "FRA", "JPN", "RUS", "UKR"], "delayMonths": 2, "magnitude": 3 }, { "type": "banking_crisis", "target": ["ESP", "ITA", "LVA"], "delayMonths": 3, "magnitude": 4 }, { "type": "default", "target": ["GRC"], "delayMonths": 20, "magnitude": 4 } ], "text": { "ru": "Крах Lehman Brothers: мировой финансовый кризис", "en": "Lehman Brothers collapses: the global financial crisis" } },
  { "id": "haiti-earthquake-2010", "type": "earthquake", "origin": "real-A", "year": 2010, "month": 1, "countries": ["HTI"], "magnitude": 5, "text": { "ru": "Землетрясение на Гаити", "en": "The Haiti earthquake" } },
  { "id": "arab-spring-2010", "type": "protests", "origin": "real-A", "year": 2010, "month": 12, "countries": ["TUN"], "magnitude": 4, "preconditions": [ { "kind": "indicator", "indicator": "stability", "country": "TUN", "op": "<", "rhs": { "baselinePlus": 15 } } ], "hooks": [ { "type": "protests", "target": ["EGY", "YEM"], "delayMonths": 1, "magnitude": 4 }, { "type": "civil_war", "target": ["LBY"], "delayMonths": 2, "magnitude": 5, "persistMonths": 8 }, { "type": "civil_war", "target": ["SYR"], "delayMonths": 3, "magnitude": 5, "persistMonths": 120 }, { "type": "protests", "target": ["BHR"], "delayMonths": 2, "magnitude": 3 } ], "text": { "ru": "Начало Арабской весны", "en": "The Arab Spring begins" } },
  { "id": "fukushima-2011", "type": "earthquake", "origin": "real-A", "year": 2011, "month": 3, "countries": ["JPN"], "magnitude": 4, "hooks": [ { "type": "nuclear_accident", "target": "self", "delayMonths": 0, "magnitude": 4 } ], "text": { "ru": "Землетрясение Тохоку и авария на Фукусиме", "en": "The Tōhoku earthquake and the Fukushima accident" } },
  { "id": "south-sudan-independence-2011", "type": "independence", "origin": "real-A", "year": 2011, "month": 7, "countries": ["SSD", "SDN"], "magnitude": 2, "transition": "ssd-2011", "text": { "ru": "Независимость Южного Судана", "en": "South Sudan becomes independent" } },
  { "id": "crimea-2014", "type": "war", "origin": "real-A", "year": 2014, "month": 3, "countries": ["UKR", "RUS"], "magnitude": 4, "persistMonths": 95, "hooks": [ { "type": "sanctions", "target": ["RUS"], "delayMonths": 4, "magnitude": 3 } ], "text": { "ru": "Крым и война на Донбассе", "en": "Crimea and the war in Donbas" } },
  { "id": "ebola-2014", "type": "epidemic", "origin": "real-A", "year": 2014, "month": 3, "countries": ["LBR", "SLE", "GIN"], "magnitude": 4, "persistMonths": 20, "text": { "ru": "Эпидемия Эболы в Западной Африке", "en": "The West African Ebola epidemic" } },
  { "id": "oil-crash-2014", "type": "oil_price_crash", "origin": "real-A", "year": 2014, "month": 11, "countries": ["SAU", "RUS", "VEN", "NGA", "IRN", "IRQ", "KAZ", "AZE", "NOR", "DZA", "AGO"], "magnitude": 4, "persistMonths": 30, "text": { "ru": "Нефть дешевеет вдвое", "en": "Oil price halves" } },
  { "id": "refugee-wave-2015", "type": "migration_wave", "origin": "real-A", "year": 2015, "month": 8, "countries": ["DEU", "SWE", "AUT", "GRC", "TUR", "HUN"], "magnitude": 4, "text": { "ru": "Миграционный кризис в Европе", "en": "The European migrant crisis" } },
  { "id": "brexit-2016", "type": "election_change", "origin": "real-A", "year": 2016, "month": 6, "countries": ["GBR"], "magnitude": 3, "text": { "ru": "Референдум о выходе из ЕС", "en": "The Brexit referendum" } },
  { "id": "covid-2020", "type": "epidemic", "origin": "real-A", "year": 2020, "month": 3, "countries": ["CHN"], "scope": "global", "magnitude": 5, "persistMonths": 24, "text": { "ru": "Пандемия COVID-19", "en": "The COVID-19 pandemic" } },
  { "id": "ukraine-war-2022", "type": "war", "origin": "real-A", "year": 2022, "month": 2, "countries": ["UKR", "RUS"], "magnitude": 5, "persistMonths": 60, "hooks": [ { "type": "sanctions", "target": ["RUS"], "delayMonths": 1, "magnitude": 5 }, { "type": "migration_wave", "target": ["POL", "DEU", "CZE"], "delayMonths": 2, "magnitude": 4 } ], "text": { "ru": "Полномасштабное вторжение России в Украину", "en": "Russia's full-scale invasion of Ukraine" } },
  { "id": "turkey-earthquake-2023", "type": "earthquake", "origin": "real-A", "year": 2023, "month": 2, "countries": ["TUR", "SYR"], "magnitude": 4, "text": { "ru": "Землетрясение в Турции и Сирии", "en": "The Turkey–Syria earthquake" } },
  { "id": "gaza-war-2023", "type": "war", "origin": "real-A", "year": 2023, "month": 10, "countries": ["ISR", "PSE"], "magnitude": 5, "persistMonths": 24, "text": { "ru": "Война в Газе", "en": "The Gaza war" } }
]
```

- [ ] **Step 5: Загрузчик**

`packages/content/src/index.ts`:
```ts
import {
  Analogs, ChannelMap, EngineConfig, EventTypeDef, HistoricalCountry, IndicatorConfigs, Priors, ScheduledEvent, Transition,
  type IndicatorConfig,
} from '@ripple/schema';
import { z } from 'zod';
import eventTypesJson from '../catalog/event-types.json';
import channelsJson from '../catalog/channels.json';
import indicatorsJson from '../config/indicators.json';
import engineJson from '../config/engine.json';
import priorsJson from '../priors/indicators.json';
import historicalJson from '../historical-countries.json';
import analogsJson from '../analogs.json';
import transitionsJson from '../transitions.json';
import tierAJson from '../events/tier-a.json';

export interface Content {
  eventTypes: EventTypeDef[];
  channels: ChannelMap;
  indicatorConfig: Record<string, IndicatorConfig>;
  engine: EngineConfig;
  priors: Priors;
  historicalCountries: HistoricalCountry[];
  analogs: Analogs;
  transitions: Transition[];
  events: ScheduledEvent[];
}

let cached: Content | undefined;

export function loadContent(): Content {
  if (cached) return cached;
  cached = {
    eventTypes: z.array(EventTypeDef).parse(eventTypesJson),
    channels: ChannelMap.parse(channelsJson),
    indicatorConfig: IndicatorConfigs.parse(indicatorsJson),
    engine: EngineConfig.parse(engineJson),
    priors: Priors.parse(priorsJson),
    historicalCountries: z.array(HistoricalCountry).parse(historicalJson),
    analogs: Analogs.parse(analogsJson),
    transitions: z.array(Transition).parse(transitionsJson),
    events: z.array(ScheduledEvent).parse(tierAJson),
  };
  return cached;
}
```

- [ ] **Step 6: Прогнать и закоммитить**

Run: `pnpm test packages/content && pnpm typecheck` → PASS (6 тестов).

```bash
git add packages/content
git commit -m "feat(content): v0 event catalog, channel map, dynamics config, transitions, tier-A events"
```

---

### Task 5: Хранилище рядов, кодек десятилетий и синтетический набор данных

**Files:**
- Modify: `packages/schema/src/indicators.ts` (добавить `encodeDecade`, `decodeDecadeInto`, `decadesOf`)
- Create: `packages/engine/src/types.ts`, `packages/engine/src/store.ts`; Modify: `packages/engine/src/index.ts`
- Create: `packages/engine/test/fixtures/world.ts`
- Test: `packages/schema/test/decade.test.ts`, `packages/engine/test/store.test.ts`

**Interfaces:**
- Consumes: `IndicatorsMeta`, `encodeGrid/decodeGrid`, `MONTHS_PER_DECADE`, `decadeStartAbs`, `decadeOf`.
- Produces:
  - `Dataset = { countries: Country[]; meta: IndicatorsMeta; values: Float32Array; graph: Edge[] }` — `values` в раскладке `[indicator][country][month]`, где `month = abs − meta.firstAbs`, `nM = lastAbs − firstAbs + 1`.
  - `interface RealSource { meta: IndicatorsMeta; indicatorIndex: Map<string, number>; real(i, c, abs): number; realUntil(i): number }` — всё, что динамике и переходам нужно от реальных рядов; `IndicatorStore` реализует его напрямую, `Trend` (задача 10) — поверх хранилища.
  - `IndicatorStore` с `real(i, c, abs): number` (NaN вне диапазона или при пропуске), `realUntil(i)`, `indicatorIndex: Map<string, number>`, `countryIndex: Map<string, number>`, `nI, nC, nM`, `static assemble(meta, decades: Map<number, Int16Array>): Float32Array`.
  - Формат файла десятилетия: `Int16Array` раскладки `[indicator][country][120]`, месяц `m` соответствует `abs = decadeStartAbs(decade) + m`; вне `[firstAbs, lastAbs]` стоит `MISSING`.
  - `buildFixture(): { dataset: Dataset; content: Content }` и `writeFixtureDir(dir)` в `packages/engine/test/fixtures/world.ts` — 10 стран (`A B C U U1 U2 D E F G`), 3 индикатора (`economy`, `stability` как приор, `population`), 1980-01…2004-12, `realUntil = todayAbs = 1995-12`, граф границ, 5 событий с переходами `fx-u-1990` (split), `fx-e-1992` (secede), `fx-fg-1994` (merge) и аналог `U → A` с масштабом 0.5 (у `G` записи нет — фолбэк на субрегион).

- [ ] **Step 1: Тесты кодека десятилетий и хранилища**

`packages/schema/test/decade.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, decadesOf, decodeDecadeInto, encodeDecade, type IndicatorsMeta } from '@ripple/schema';

function meta(): IndicatorsMeta {
  return {
    dataVersion: 't',
    countries: ['A', 'B'],
    indicators: [
      { code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0, realUntil: 0, prior: false, estimated: [], source: 'f' },
      { code: 'population', kind: 'log10count', min: 0, max: 13, stickiness: 0.5, offsetHalflifeYears: 30, noiseAmp: 0, realUntil: 0, prior: false, estimated: [], source: 'f' },
    ],
    firstAbs: absMonth(1985, 1),
    lastAbs: absMonth(1994, 12),
    todayAbs: absMonth(1994, 12),
  };
}

describe('decade files', () => {
  it('lists decades overlapping the range', () => {
    expect(decadesOf(meta())).toEqual([1980, 1990]);
  });
  it('round-trips values through decade blocks', () => {
    const m = meta();
    const nM = m.lastAbs - m.firstAbs + 1;
    const values = new Float32Array(2 * 2 * nM);
    for (let k = 0; k < values.length; k++) values[k] = (k % 97) / 10;
    const out = new Float32Array(values.length).fill(NaN);
    for (const d of decadesOf(m)) decodeDecadeInto(m, encodeDecade(m, values, d), d, out);
    for (let k = 0; k < values.length; k++) expect(out[k]).toBeCloseTo(values[k]!, 2);
  });
});
```

`packages/engine/test/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, decadesOf, encodeDecade } from '@ripple/schema';
import { IndicatorStore } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('IndicatorStore', () => {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  it('reads real values by indicator/country/month', () => {
    const e = store.indicatorIndex.get('economy')!;
    const a = store.countryIndex.get('A')!;
    expect(store.real(e, a, absMonth(1980, 1))).toBeCloseTo(50, 3);
    expect(store.real(e, a, absMonth(1995, 1))).toBeGreaterThan(69);
    expect(Number.isNaN(store.real(e, a, absMonth(1979, 12)))).toBe(true);
    expect(Number.isNaN(store.real(e, a, absMonth(2005, 1)))).toBe(true);
  });
  it('has no data for a dissolved country after its end', () => {
    const e = store.indicatorIndex.get('economy')!;
    const u = store.countryIndex.get('U')!;
    expect(store.real(e, u, absMonth(1989, 12))).toBeCloseTo(45, 3);
    expect(Number.isNaN(store.real(e, u, absMonth(1990, 1)))).toBe(true);
  });
  it('assembles from decade files', () => {
    const decades = new Map<number, Int16Array>();
    for (const d of decadesOf(dataset.meta)) decades.set(d, encodeDecade(dataset.meta, dataset.values, d));
    const assembled = IndicatorStore.assemble(dataset.meta, decades);
    expect(assembled.length).toBe(dataset.values.length);
    for (let k = 0; k < assembled.length; k += 97) {
      const a = assembled[k]!, v = dataset.values[k]!;
      if (Number.isNaN(v)) expect(Number.isNaN(a)).toBe(true);
      else expect(a).toBeCloseTo(v, 2);
    }
  });
});
```

Run: `pnpm test` → FAIL.

- [ ] **Step 2: Кодек десятилетий в schema**

Добавить в `packages/schema/src/indicators.ts`:
```ts
import { MONTHS_PER_DECADE, decadeOf, decadeStartAbs } from './time.js';

export function decadesOf(meta: Pick<IndicatorsMeta, 'firstAbs' | 'lastAbs'>): number[] {
  const out: number[] = [];
  for (let d = decadeOf(meta.firstAbs); d <= decadeOf(meta.lastAbs); d += 10) out.push(d);
  return out;
}

/** values: full grid [i][c][m], m = abs − firstAbs. Returns [i][c][120] block for the decade. */
export function encodeDecade(meta: IndicatorsMeta, values: Float32Array, decade: number): Int16Array {
  const nC = meta.countries.length;
  const nI = meta.indicators.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const start = decadeStartAbs(decade);
  const out = new Int16Array(nI * nC * MONTHS_PER_DECADE);
  const block = new Float32Array(nC * MONTHS_PER_DECADE);
  for (let i = 0; i < nI; i++) {
    const ind = meta.indicators[i]!;
    for (let c = 0; c < nC; c++) {
      for (let m = 0; m < MONTHS_PER_DECADE; m++) {
        const abs = start + m;
        const inRange = abs >= meta.firstAbs && abs <= meta.lastAbs;
        block[c * MONTHS_PER_DECADE + m] = inRange ? values[(i * nC + c) * nM + (abs - meta.firstAbs)]! : NaN;
      }
    }
    out.set(encodeGrid(block, ind.min, ind.max), i * nC * MONTHS_PER_DECADE);
  }
  return out;
}

export function decodeDecadeInto(meta: IndicatorsMeta, raw: Int16Array, decade: number, values: Float32Array): void {
  const nC = meta.countries.length;
  const nI = meta.indicators.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const start = decadeStartAbs(decade);
  for (let i = 0; i < nI; i++) {
    const ind = meta.indicators[i]!;
    const block = decodeGrid(raw.subarray(i * nC * MONTHS_PER_DECADE, (i + 1) * nC * MONTHS_PER_DECADE), ind.min, ind.max);
    for (let c = 0; c < nC; c++) {
      for (let m = 0; m < MONTHS_PER_DECADE; m++) {
        const abs = start + m;
        if (abs < meta.firstAbs || abs > meta.lastAbs) continue;
        values[(i * nC + c) * nM + (abs - meta.firstAbs)] = block[c * MONTHS_PER_DECADE + m]!;
      }
    }
  }
}
```

- [ ] **Step 3: Типы и хранилище в engine**

`packages/engine/src/types.ts`:
```ts
import type { Country, Edge, IndicatorsMeta } from '@ripple/schema';

export interface Dataset {
  countries: Country[];
  meta: IndicatorsMeta;
  values: Float32Array; // [indicator][country][month], month = abs - meta.firstAbs
  graph: Edge[];
}
```

`packages/engine/src/store.ts`:
```ts
import { decadesOf, decodeDecadeInto, type IndicatorsMeta } from '@ripple/schema';

/** What dynamics and transitions need from the real series. IndicatorStore serves the data as they are; Trend (trend.ts) continues them past a country's real end. */
export interface RealSource {
  readonly meta: IndicatorsMeta;
  readonly indicatorIndex: Map<string, number>;
  real(i: number, c: number, abs: number): number;
  realUntil(i: number): number;
}

export class IndicatorStore implements RealSource {
  readonly nI: number;
  readonly nC: number;
  readonly nM: number;
  readonly indicatorIndex: Map<string, number>;
  readonly countryIndex: Map<string, number>;

  constructor(readonly meta: IndicatorsMeta, readonly values: Float32Array) {
    this.nI = meta.indicators.length;
    this.nC = meta.countries.length;
    this.nM = meta.lastAbs - meta.firstAbs + 1;
    if (values.length !== this.nI * this.nC * this.nM) {
      throw new Error(`values length ${values.length} != ${this.nI}*${this.nC}*${this.nM}`);
    }
    this.indicatorIndex = new Map(meta.indicators.map((d, k) => [d.code, k]));
    this.countryIndex = new Map(meta.countries.map((id, k) => [id, k]));
  }

  real(i: number, c: number, abs: number): number {
    if (abs < this.meta.firstAbs || abs > this.meta.lastAbs) return NaN;
    return this.values[(i * this.nC + c) * this.nM + (abs - this.meta.firstAbs)]!;
  }

  realUntil(i: number): number {
    return this.meta.indicators[i]!.realUntil;
  }

  static assemble(meta: IndicatorsMeta, decades: Map<number, Int16Array>): Float32Array {
    const nM = meta.lastAbs - meta.firstAbs + 1;
    const values = new Float32Array(meta.indicators.length * meta.countries.length * nM).fill(NaN);
    for (const d of decadesOf(meta)) {
      const raw = decades.get(d);
      if (!raw) throw new Error(`missing decade file ${d}`);
      decodeDecadeInto(meta, raw, d, values);
    }
    return values;
  }
}
```

Обновить `packages/engine/src/index.ts`:
```ts
export * from './rng.js';
export * from './types.js';
export * from './store.js';
```

- [ ] **Step 4: Синтетический набор данных**

`packages/engine/test/fixtures/world.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  absMonth, decadesOf, encodeDecade, type Country, type Edge, type IndicatorsMeta, type ScheduledEvent, type Transition,
} from '@ripple/schema';
import { loadContent, type Content } from '@ripple/content';
import type { Dataset } from '@ripple/engine';

const FIRST = absMonth(1980, 1);
const LAST = absMonth(2004, 12);
const REAL_UNTIL = absMonth(1995, 12);
const U_END = absMonth(1990, 1) - 1;
const E_START = absMonth(1992, 1);
const FG_MERGE = absMonth(1994, 1);

const c = (id: string, extra: Partial<Country> = {}): Country => ({
  id, name: { ru: id, en: id }, region: 'Test', subregion: 'Test', from: null, to: null,
  successors: [], predecessors: [], historical: false, ...extra,
});

export const FIXTURE_COUNTRIES: Country[] = [
  c('A'), c('B'), c('C'),
  c('U', { to: U_END, successors: ['U1', 'U2'], historical: true }),
  c('U1', { from: U_END + 1, predecessors: ['U'] }),
  c('U2', { from: U_END + 1, predecessors: ['U'] }),
  c('D', { successors: ['E'] }),
  c('E', { from: E_START, predecessors: ['D'] }),
  c('F'),
  c('G', { to: FG_MERGE - 1, successors: ['F'], historical: true }),
];

const ECON_START: Record<string, number> = { A: 50, B: 40, C: 30, U: 45, U1: 44, U2: 46, D: 55, E: 35, F: 60, G: 50 };
const ECON_SLOPE_PER_YEAR: Record<string, number> = { A: 20 / 16, B: 0, C: 1, U: 0, U1: 0.5, U2: 0.5, D: 0, E: 0, F: 0, G: 0 };
const STABILITY: Record<string, number> = { A: 85, B: 60, C: 45, U: 60, U1: 55, U2: 55, D: 50, E: 40, F: 70, G: 65 };
const LOG_POP: Record<string, number> = { A: 7.5, B: 7.0, C: 6.5, U: 8.0, U1: 7.7, U2: 7.4, D: 7.2, E: 6.0, F: 7.0, G: 6.8 };

function realEconomy(id: string, abs: number): number {
  const country = FIXTURE_COUNTRIES.find((k) => k.id === id)!;
  if (country.to !== null && abs > country.to) return NaN; // dissolved country: no data after its end
  const years = (Math.min(abs, REAL_UNTIL) - FIRST) / 12;
  return ECON_START[id]! + ECON_SLOPE_PER_YEAR[id]! * years;
}

export function buildMeta(): IndicatorsMeta {
  const content = loadContent();
  const cfg = (code: string) => content.indicatorConfig[code]!;
  const base = (code: string, realUntil: number, prior = false) => ({
    code, ...cfg(code), realUntil, prior, estimated: [] as string[], source: 'fixture',
  });
  return {
    dataVersion: 'fixture-1',
    countries: FIXTURE_COUNTRIES.map((k) => k.id),
    indicators: [base('economy', REAL_UNTIL), base('stability', FIRST - 1, true), base('population', REAL_UNTIL)],
    firstAbs: FIRST,
    lastAbs: LAST,
    todayAbs: REAL_UNTIL,
  };
}

export function buildValues(meta: IndicatorsMeta): Float32Array {
  const nC = meta.countries.length;
  const nM = meta.lastAbs - meta.firstAbs + 1;
  const values = new Float32Array(meta.indicators.length * nC * nM);
  meta.indicators.forEach((ind, i) => {
    meta.countries.forEach((id, ci) => {
      for (let m = 0; m < nM; m++) {
        const abs = meta.firstAbs + m;
        let v: number;
        if (ind.code === 'economy') v = realEconomy(id, abs);
        else if (ind.code === 'stability') v = STABILITY[id]!;
        else v = LOG_POP[id]!;
        values[(i * nC + ci) * nM + m] = v;
      }
    });
  });
  return values;
}

export const FIXTURE_EDGES: Edge[] = [
  ['A', 'B'], ['B', 'C'], ['U', 'A'], ['U1', 'A'], ['U2', 'B'], ['D', 'E'], ['D', 'C'], ['F', 'G'], ['F', 'A'],
].map(([a, b]) => ({ a: a!, b: b!, type: 'border' as const, weight: 1 }));

export const FIXTURE_TRANSITIONS: Transition[] = [
  { id: 'fx-u-1990', abs: U_END + 1, kind: 'split', from: ['U'], to: ['U1', 'U2'], eventId: 'fx-u-split-1990' },
  { id: 'fx-e-1992', abs: E_START, kind: 'secede', from: ['D'], to: ['E'], eventId: 'fx-e-secede-1992' },
  { id: 'fx-fg-1994', abs: FG_MERGE, kind: 'merge', from: ['F', 'G'], to: ['F'], eventId: 'fx-merge-1994' },
];

export const FIXTURE_EVENTS: ScheduledEvent[] = [
  { id: 'fx-war-1985', type: 'war', origin: 'real-A', year: 1985, month: 3, countries: ['B'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] },
  {
    id: 'fx-u-split-1990', type: 'dissolution', origin: 'real-A', year: 1990, month: 1, countries: ['U'], scope: 'list', magnitude: 4,
    preconditions: [{ kind: 'indicator', indicator: 'stability', country: 'U', op: '<', rhs: { baselinePlus: 15 } }],
    delayMaxYears: 5, transition: 'fx-u-1990',
    hooks: [{ type: 'banking_crisis', target: ['U1', 'U2'], delayMonths: 1, magnitude: 3, probability: 1 }],
  },
  { id: 'fx-e-secede-1992', type: 'independence', origin: 'real-A', year: 1992, month: 1, countries: ['E', 'D'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 5, hooks: [], transition: 'fx-e-1992' },
  { id: 'fx-merge-1994', type: 'unification', origin: 'real-A', year: 1994, month: 1, countries: ['F', 'G'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 5, hooks: [], transition: 'fx-fg-1994' },
  { id: 'fx-crisis-1997', type: 'banking_crisis', origin: 'real-A', year: 1997, month: 6, countries: ['A'], scope: 'list', magnitude: 4, preconditions: [], delayMaxYears: 5, hooks: [] },
];

export function buildFixture(): { dataset: Dataset; content: Content } {
  const meta = buildMeta();
  const real = loadContent();
  const content: Content = {
    ...real,
    historicalCountries: [],
    analogs: { U: { analog: 'A', shiftYears: 0, scale: 0.5 } }, // G has no record → subregion median
    transitions: FIXTURE_TRANSITIONS,
    events: FIXTURE_EVENTS,
  };
  return { dataset: { countries: FIXTURE_COUNTRIES, meta, values: buildValues(meta), graph: FIXTURE_EDGES }, content };
}

/** Writes the fixture in the on-disk layout the CLI loader expects. */
export function writeFixtureDir(dir: string): void {
  const { dataset } = buildFixture();
  mkdirSync(join(dir, 'indicators'), { recursive: true });
  writeFileSync(join(dir, 'countries.json'), JSON.stringify(dataset.countries));
  writeFileSync(join(dir, 'graph.json'), JSON.stringify({ dataVersion: dataset.meta.dataVersion, edges: dataset.graph }));
  writeFileSync(join(dir, 'indicators', 'meta.json'), JSON.stringify(dataset.meta));
  for (const d of decadesOf(dataset.meta)) {
    const raw = encodeDecade(dataset.meta, dataset.values, d);
    writeFileSync(join(dir, 'indicators', `${d}.bin`), Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
  }
}
```

- [ ] **Step 5: Прогнать и закоммитить**

Run: `pnpm test && pnpm typecheck` → PASS.

```bash
git add packages/schema packages/engine
git commit -m "feat(engine): indicator store, decade codec, synthetic fixture dataset"
```

---

### Task 6: Состояние мира и динамика индикаторов

**Files:**
- Create: `packages/engine/src/state.ts`, `packages/engine/src/dynamics.ts`; Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/dynamics.test.ts`

**Interfaces:**
- Consumes: `IndicatorStore`, `uniformInts`, `hashBytes`, `existsAt`.
- Produces:
  - `class WorldState { nI; nC; active: Uint8Array; x: Float32Array; offset: Float32Array; idx(i,c); clone(); hash(): number }` (раскладка `x[i*nC + c]`).
  - `initState(store, countries, startAbs): WorldState`.
  - `DynParams = { stickiness; decayPerMonth; noiseAmp; min; max; kind }`, `dynParamsFromMeta(meta): DynParams[]`.
  - `applyShock(state, i, c, amount, params)` — прибавляет к `x` и `offset`, клампит индексы к `[min,max]`.
  - `stepIndicators(state, real: RealSource, params, t, seed)` — переводит состояние из месяца `t` в `t+1`; реальные ряды приходят через `RealSource` (хранилище в тестах динамики, `Trend` в мире). Уточнение формулы спеки 3.2: приращение реального ряда `real[t+1] − real[t]` прибавляется к `x` целиком, а `k` гасит только остаточный зазор `x − (real + offset)`. Так базовый мир без вмешательств совпадает с данными точно (без запаздывания на быстрых рядах вроде интернета или свободы), а отклонения по-прежнему затухают с полураспадом `offset`. Где `real[t+1]` нет — `x` держится.

- [ ] **Step 1: Тест**

`packages/engine/test/dynamics.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, type IndicatorsMeta } from '@ripple/schema';
import { IndicatorStore, WorldState, applyShock, dynParamsFromMeta, initState, stepIndicators } from '@ripple/engine';

function tiny(opts: { noiseAmp?: number; real?: (c: number, abs: number) => number } = {}) {
  const first = absMonth(1980, 1), last = absMonth(1999, 12);
  const meta: IndicatorsMeta = {
    dataVersion: 't', countries: ['A', 'B'], firstAbs: first, lastAbs: last, todayAbs: last,
    indicators: [{ code: 'economy', kind: 'index', min: 0, max: 100, stickiness: 0.15, offsetHalflifeYears: 5, noiseAmp: opts.noiseAmp ?? 0, realUntil: last, prior: false, estimated: [], source: 'f' }],
  };
  const nM = last - first + 1;
  const values = new Float32Array(2 * nM);
  for (let c = 0; c < 2; c++) for (let m = 0; m < nM; m++) values[c * nM + m] = opts.real ? opts.real(c, first + m) : 50;
  const store = new IndicatorStore(meta, values);
  const countries = ['A', 'B'].map((id) => ({ id, name: { ru: id, en: id }, region: '', subregion: '', from: null, to: null, successors: [], predecessors: [], historical: false }));
  return { meta, store, countries, first, params: dynParamsFromMeta(meta) };
}

describe('dynamics', () => {
  it('initialises from real data at start month', () => {
    const { store, countries, first } = tiny({ real: (c) => (c === 0 ? 10 : 20) });
    const s = initState(store, countries, first);
    expect(s.x[0]).toBeCloseTo(10, 5);
    expect(s.x[1]).toBeCloseTo(20, 5);
    expect(Array.from(s.active)).toEqual([1, 1]);
  });

  it('converges to the real trend', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    s.x[0] = 10;
    for (let t = first; t < first + 60; t++) stepIndicators(s, store, params, t, 1);
    expect(Math.abs(s.x[0]! - 50)).toBeLessThan(0.1);
  });

  it('decays a shock with the configured half-life', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    applyShock(s, 0, 0, 10, params[0]!);
    expect(s.x[0]).toBeCloseTo(60, 5);
    for (let t = first; t < first + 120; t++) stepIndicators(s, store, params, t, 1);
    expect(s.offset[0]).toBeCloseTo(2.5, 1); // 10 · 2^(-120/60)
    expect(s.x[0]).toBeCloseTo(52.5, 0);
  });

  it('holds position when there is no real data', () => {
    const { store, countries, first, params } = tiny({ real: (_c, abs) => (abs < absMonth(1985, 1) ? 50 : NaN) });
    const s = initState(store, countries, first);
    for (let t = first; t < absMonth(1990, 1); t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(50, 3);
  });

  it('follows a moving real trend without lag and keeps a shock on top of it', () => {
    const { store, countries, first, params } = tiny({ real: (_c, abs) => 20 + (abs - first) });
    const s = initState(store, countries, first);
    for (let t = first; t < first + 24; t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(44, 3);
    applyShock(s, 0, 0, 10, params[0]!);
    for (let t = first + 24; t < first + 36; t++) stepIndicators(s, store, params, t, 1);
    expect(s.x[0]).toBeCloseTo(56 + 10 * Math.pow(2, -12 / 60), 0);
  });

  it('clamps index indicators to bounds', () => {
    const { store, countries, first, params } = tiny();
    const s = initState(store, countries, first);
    applyShock(s, 0, 0, 80, params[0]!);
    expect(s.x[0]).toBe(100);
  });

  it('skips inactive countries and is seed-deterministic', () => {
    const { store, countries, first, params } = tiny({ noiseAmp: 0.5 });
    const a = initState(store, countries, first);
    a.active[1] = 0;
    const b = a.clone();
    for (let t = first; t < first + 24; t++) {
      stepIndicators(a, store, params, t, 7);
      stepIndicators(b, store, params, t, 7);
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.x[1]).toBeCloseTo(50, 5);
    const c = initState(store, countries, first);
    for (let t = first; t < first + 24; t++) stepIndicators(c, store, params, t, 8);
    expect(c.x[0]).not.toBe(a.x[0]);
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Реализация**

`packages/engine/src/state.ts`:
```ts
import { existsAt, type Country } from '@ripple/schema';
import { hashBytes } from './rng.js';
import type { IndicatorStore } from './store.js';

export class WorldState {
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly offset: Float32Array;

  constructor(readonly nI: number, readonly nC: number, buffers?: { active: Uint8Array; x: Float32Array; offset: Float32Array }) {
    this.active = buffers?.active ?? new Uint8Array(nC);
    this.x = buffers?.x ?? new Float32Array(nI * nC);
    this.offset = buffers?.offset ?? new Float32Array(nI * nC);
  }
  idx(i: number, c: number): number {
    return i * this.nC + c;
  }
  clone(): WorldState {
    return new WorldState(this.nI, this.nC, { active: this.active.slice(), x: this.x.slice(), offset: this.offset.slice() });
  }
  hash(): number {
    const a = hashBytes(new Uint8Array(this.x.buffer, this.x.byteOffset, this.x.byteLength));
    const b = hashBytes(new Uint8Array(this.offset.buffer, this.offset.byteOffset, this.offset.byteLength));
    const c = hashBytes(this.active);
    return (a ^ Math.imul(b, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b)) >>> 0;
  }
}

export function initState(store: IndicatorStore, countries: Country[], startAbs: number): WorldState {
  const s = new WorldState(store.nI, store.nC);
  countries.forEach((country, c) => {
    if (!existsAt(country, startAbs)) return;
    s.active[c] = 1;
    for (let i = 0; i < store.nI; i++) {
      const v = store.real(i, c, startAbs);
      if (Number.isNaN(v)) throw new Error(`no data for ${store.meta.indicators[i]!.code}/${country.id} at ${startAbs}`);
      s.x[s.idx(i, c)] = v;
    }
  });
  return s;
}
```

`packages/engine/src/dynamics.ts`:
```ts
import type { IndicatorKind, IndicatorsMeta } from '@ripple/schema';
import { uniformInts } from './rng.js';
import type { WorldState } from './state.js';
import type { RealSource } from './store.js';

export interface DynParams {
  stickiness: number;
  decayPerMonth: number;
  noiseAmp: number;
  min: number;
  max: number;
  kind: IndicatorKind;
}

const NOISE_TAG = 0x4e4f4953;

export function dynParamsFromMeta(meta: IndicatorsMeta): DynParams[] {
  return meta.indicators.map((m) => ({
    stickiness: m.stickiness,
    decayPerMonth: Math.pow(2, -1 / (m.offsetHalflifeYears * 12)),
    noiseAmp: m.noiseAmp,
    min: m.min,
    max: m.max,
    kind: m.kind,
  }));
}

function clamp(v: number, p: DynParams): number {
  if (p.kind !== 'index') return v;
  return v < p.min ? p.min : v > p.max ? p.max : v;
}

/** Immediate displacement that then decays with the indicator's half-life. */
export function applyShock(state: WorldState, i: number, c: number, amount: number, p: DynParams): void {
  const k = state.idx(i, c);
  state.offset[k] = state.offset[k]! + amount;
  state.x[k] = clamp(state.x[k]! + amount, p);
}

/** Advance all active countries from month t to t+1.
 *  The real series' increment is applied in full (baseline == data when nothing was touched);
 *  stickiness only closes the residual gap between x and real + offset. */
export function stepIndicators(state: WorldState, real: RealSource, params: DynParams[], t: number, seed: number): void {
  const { nC, nI } = state;
  for (let i = 0; i < nI; i++) {
    const p = params[i]!;
    for (let c = 0; c < nC; c++) {
      if (state.active[c] === 0) continue;
      const k = i * nC + c;
      const off = state.offset[k]! * p.decayPerMonth;
      state.offset[k] = off;
      const realNow = real.real(i, c, t);
      const realNext = real.real(i, c, t + 1);
      const shift = Number.isNaN(realNow) || Number.isNaN(realNext) ? 0 : realNext - realNow;
      const base = state.x[k]! + shift;
      const trend = Number.isNaN(realNext) ? base : realNext + off;
      const noise = p.noiseAmp === 0 ? 0 : p.noiseAmp * (uniformInts(seed, NOISE_TAG, i, c, t + 1) - 0.5);
      state.x[k] = clamp(base + p.stickiness * (trend - base) + noise, p);
    }
  }
}
```

Добавить в `packages/engine/src/index.ts`:
```ts
export * from './state.js';
export * from './dynamics.js';
```

- [ ] **Step 3: Прогнать и закоммитить**

Run: `pnpm test packages/engine && pnpm typecheck` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): world state arrays, gravity-to-trend dynamics with decaying offsets"
```

---

### Task 7: Граф связей и кольца распространения

**Files:**
- Create: `packages/engine/src/graph.ts`; Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/graph.test.ts`

**Interfaces:**
- Consumes: `Edge`, `LinkType`.
- Produces: `class LinkGraph { constructor(edges: Edge[], countryIndex: Map<string, number>); neighbors(c, type, active): Array<{ c: number; w: number }>; spillTargets(origins: number[], rings: number, ringFactor: number, bias: Partial<Record<LinkType, number>>, active: Uint8Array): Map<number, number> }`. Фактор цели = `max` по путям от `ringFactor^ring × Π(w × bias)`; страны-источники и неактивные страны в результат не попадают, неактивные не проводят.

- [ ] **Step 1: Тест**

`packages/engine/test/graph.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LinkGraph } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('LinkGraph', () => {
  const { dataset } = buildFixture();
  const index = new Map(dataset.meta.countries.map((id, k) => [id, k]));
  const g = new LinkGraph(dataset.graph, index);
  const id = (s: string) => index.get(s)!;
  const allActive = new Uint8Array(dataset.meta.countries.length).fill(1);

  it('lists active neighbours only', () => {
    expect(g.neighbors(id('A'), 'border', allActive).map((n) => n.c).sort()).toEqual([id('B'), id('F'), id('U'), id('U1')].sort());
    const noU = allActive.slice();
    noU[id('U')] = 0;
    expect(g.neighbors(id('A'), 'border', noU).map((n) => n.c)).not.toContain(id('U'));
  });

  it('spreads over rings with geometric decay', () => {
    const t = g.spillTargets([id('A')], 2, 0.25, { border: 1 }, allActive);
    expect(t.get(id('B'))).toBeCloseTo(0.25, 6);
    expect(t.get(id('C'))).toBeCloseTo(0.0625, 6);
    expect(t.has(id('A'))).toBe(false);
    const one = g.spillTargets([id('A')], 1, 0.25, { border: 1 }, allActive);
    expect(one.has(id('C'))).toBe(false);
  });

  it('does not route through inactive countries and honours bias', () => {
    const noB = allActive.slice();
    noB[id('B')] = 0;
    const t = g.spillTargets([id('A')], 2, 0.25, { border: 1 }, noB);
    expect(t.has(id('B'))).toBe(false);
    expect(t.has(id('C'))).toBe(false);
    const half = g.spillTargets([id('A')], 1, 0.25, { border: 0.5 }, allActive);
    expect(half.get(id('B'))).toBeCloseTo(0.125, 6);
    expect(g.spillTargets([id('A')], 2, 0.25, {}, allActive).size).toBe(0);
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Реализация**

`packages/engine/src/graph.ts`:
```ts
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
```

Добавить `export * from './graph.js';` в `packages/engine/src/index.ts`.

- [ ] **Step 3: Прогнать и закоммитить**

Run: `pnpm test packages/engine` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): link graph with ring-based spill targets"
```

---

### Task 8: Журнал причин

**Files:**
- Create: `packages/engine/src/journal.ts`; Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/journal.test.ts`

**Interfaces:**
- Produces:
  - `Delta = { t: number; i: number; c: number; amount: number; cause: string; from?: number; channel?: Channel }`.
  - `WhyNode = { cause: string; amount: number; t: number; from?: number; channel?: Channel; children: WhyNode[] }`.
  - `class Journal { constructor(cfg: { maxTicks; topPerTick; minAbs }); begin(t); record(d); commit(); deltas(i, c, fromT, toT): Delta[]; why(i, c, t, depth?, window?): WhyNode[]; size(): number }`. `why` агрегирует дельты цели за окно `window` месяцев по `(cause, from)`, берёт 3 сильнейших, и для дельт с `from` рекурсивно спрашивает, почему та же причина изменила индикатор в стране-источнике.

- [ ] **Step 1: Тест**

`packages/engine/test/journal.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Journal } from '@ripple/engine';

describe('Journal', () => {
  it('keeps only the strongest deltas per tick and drops tiny ones', () => {
    const j = new Journal({ maxTicks: 10, topPerTick: 2, minAbs: 0.01 });
    j.begin(1);
    j.record({ t: 1, i: 0, c: 0, amount: -5, cause: 'e1' });
    j.record({ t: 1, i: 0, c: 1, amount: 0.001, cause: 'e1' });
    j.record({ t: 1, i: 0, c: 2, amount: 2, cause: 'e2' });
    j.record({ t: 1, i: 0, c: 3, amount: -1, cause: 'e3' });
    j.commit();
    expect(j.deltas(0, 0, 1, 1).length).toBe(1);
    expect(j.deltas(0, 1, 1, 1).length).toBe(0);
    expect(j.deltas(0, 3, 1, 1).length).toBe(0);
    expect(j.size()).toBe(2);
  });

  it('evicts ticks beyond maxTicks', () => {
    const j = new Journal({ maxTicks: 3, topPerTick: 10, minAbs: 0 });
    for (let t = 0; t < 5; t++) {
      j.begin(t);
      j.record({ t, i: 0, c: 0, amount: 1, cause: 'e' });
      j.commit();
    }
    expect(j.deltas(0, 0, 0, 1).length).toBe(0);
    expect(j.deltas(0, 0, 2, 4).length).toBe(3);
  });

  it('explains a spill back to its origin', () => {
    const j = new Journal({ maxTicks: 100, topPerTick: 100, minAbs: 0 });
    for (let t = 0; t < 3; t++) {
      j.begin(t);
      j.record({ t, i: 0, c: 0, amount: -4, cause: 'war-B', channel: 'safety' });
      j.record({ t, i: 0, c: 1, amount: -1, cause: 'war-B', from: 0, channel: 'safety' });
      j.record({ t, i: 0, c: 1, amount: -0.2, cause: 'noise-like', channel: 'econ' });
      j.commit();
    }
    const why = j.why(0, 1, 2);
    expect(why[0]!.cause).toBe('war-B');
    expect(why[0]!.amount).toBeCloseTo(-3, 6);
    expect(why[0]!.from).toBe(0);
    expect(why[0]!.children[0]!.cause).toBe('war-B');
    expect(why[0]!.children[0]!.amount).toBeCloseTo(-12, 6);
    expect(why[0]!.children[0]!.children).toEqual([]);
    expect(why[1]!.cause).toBe('noise-like');
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Реализация**

`packages/engine/src/journal.ts`:
```ts
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
```

Добавить `export * from './journal.js';` в индекс.

- [ ] **Step 3: Прогнать и закоммитить**

Run: `pnpm test packages/engine` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): causal journal with per-tick top-N and why() traversal"
```

---

### Task 9: События — оценщик каталога, применение воздействия, планировщик, переходы границ

Правило «встроено в реальность» (спека 4.2, 3.2): в историческом периоде реальные ряды уже содержат последствия реальных событий. Поэтому у каждого активного события есть режим применения:
- `embedded` — событие случилось так же, как в базовом мире; шок применяется к индикатору `i` только если `t > realUntil(i)` (то есть за горизонтом данных, где базовая линия сама симуляция);
- `forward` — событие, которого нет в базовом мире в этот месяц (игрок, сдвинутое по времени, хук сдвинутого); применяется всегда;
- `inverse` — событие, которое в базовом мире случилось в этот месяц, а в мире игрока нет; применяется с обратным знаком только если `t ≤ realUntil(i)`.

Базовый мир всегда использует `embedded`. Мир игрока сравнивает своё срабатывание с тем, что базовый мир сделал в этот же тик («зеркало»): базовый шагает первым, его планировщик отдаёт `firedAt(t)`. «Внутри данных» значит `t ≤ min(realUntil(i), todayAbs)`: после «сегодня» ни один ряд не содержит будущих событий, даже если это проекция до 2100 (население), поэтому там `embedded` применяется как `forward`.

Хуки наследуют режим родителя через то же зеркало: хуки базового мира получают id `${parent}#h${idx}`, одинаковые в обоих мирах, поэтому хуки кризиса, которого в мире игрока не случилось, приходят из зеркала и вычитаются (`inverse`), а хуки родителя, сработавшего позже (`forward`), сами стоят на новом месте и идут `forward`.

Передача модели (ADR 0005): если в мире игрока первичная страна реального события неактивна (СССР не распался, а событие стоит на России), планировщик смотрит на группу типа события. Группы из `engine.handover.retarget` (в v0 — `nature`) перенаправляются владельцу территории — ближайшему активному предшественнику, а если его нет, преемнику — и применяются `forward` с записью `retargeted {from, to}` (в интерфейсе — «в реальности: …»); остальные группы не срабатывают и не вычитаются (у неактивной страны нет состояния), запись `diverged` («история пошла иначе»). Передача проверяется на каждом тике заново, поэтому отложенное событие при «рождении» страны пойдёт своим путём.

**Files:**
- Create: `packages/engine/src/events/catalog.ts`, `packages/engine/src/events/impact.ts`, `packages/engine/src/events/schedule.ts`, `packages/engine/src/transitions.ts`; Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/catalog.test.ts`, `packages/engine/test/impact.test.ts`, `packages/engine/test/schedule.test.ts`, `packages/engine/test/transitions.test.ts`

**Interfaces:**
- Consumes: `WorldState`, `applyShock`, `DynParams`, `LinkGraph`, `Journal`, `IndicatorStore`, `chance`, схемы событий.
- Produces:
  - `interface ScoreContext { t: number; countries: number[] }`, `interface Scorer { def(typeId): EventTypeDef; score(ev: ScheduledEvent, ctx: ScoreContext): ChannelPoints }` — шов для будущих оценщиков (Jev, ансамбль LLM): они читают страны, текст и контекст, каталог их игнорирует. Оценщик обязан быть чистой функцией своих входов при фиксированной версии (ADR 0002).
  - `class CatalogScorer implements Scorer { constructor(defs: EventTypeDef[]); def(typeId): EventTypeDef; points(typeId, magnitude): ChannelPoints; score(ev, ctx): ChannelPoints }` — очки = `impact × magnitude / 3`; `score` делегирует в `points`.
  - `type ApplyMode = 'embedded' | 'forward' | 'inverse'`.
  - `interface ActiveEvent { id; typeId; countries: number[]; global: boolean; points: Record<Channel, number>; startAbs; shockMonths; persistMonths; persistRatio; mode: ApplyMode; spreadBias }`.
  - `makeActiveEvent(ev: ScheduledEvent, countries: number[], scorer: Scorer, mode, startAbs): ActiveEvent`, `monthlyFactor(ev, t)`, `isExpired(ev, t)`.
  - `interface ImpactContext { state; params; meta; countries: Country[]; indicatorIndex; channels: ChannelMap; graph; spill: EngineConfig['spill']; journal; todayAbs }`, `insideData(ctx, i, c, t)` (ряд страны `c` ещё несёт реальный эффект: `t ≤ min(realUntil(i), todayAbs)` и страна не пережила свой реальный конец), `appliesTo(mode, inside)`, `applyActiveEvents(active, t, ctx)`.
  - `interface HandoverContext { countries: Country[]; transitions: Map<string, Transition>; groupOf(type): EventGroup; retarget: ReadonlySet<EventGroup> }` (только мир игрока; событие с переходом «якорится» на первой стране `from` перехода, иначе на первой стране списка), `interface SchedulerContext { t; state; baselineX?: Float32Array; countryIndex; indicatorIndex; graph; mirror?: Map<string, ScheduledEvent>; handover?: HandoverContext }`.
  - `interface Firing { event: ScheduledEvent; mode: ApplyMode }`, `interface TickResult { firings: Firing[]; delayed: string[]; cancelled: string[]; retargeted: Array<{ id; from: string; to: string }>; diverged: string[] }`.
  - `class Scheduler { constructor(events, opts: { isBaseline: boolean; seed: number }); add(event); firedAt(t): Map<string, ScheduledEvent>; readonly fired: Set<string>; tick(ctx): TickResult }`. Id хука = `${parentId}#h${index}`, одинаков в обоих мирах.
  - `applyTransition(tr: Transition, state, real: RealSource, countryIndex, t): void` — активирует преемников: индексы берут собственное реальное значение преемника на месяц `t`, если оно есть, иначе наследуют значение предшественника; `offset` наследуется (при слиянии — взвешенно по населению); счётчики берут реальный ряд или долю предшественника; предшественник деактивируется (кроме `secede`).

- [ ] **Step 1: Тесты**

`packages/engine/test/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ScheduledEvent } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { CatalogScorer } from '@ripple/engine';

describe('CatalogScorer', () => {
  const s = new CatalogScorer(loadContent().eventTypes);
  it('scales catalog points by magnitude/3', () => {
    expect(s.points('war', 3).safety).toBeCloseTo(-15, 6);
    expect(s.points('war', 5).safety).toBeCloseTo(-25, 6);
    expect(s.points('war', 1).info).toBe(0);
    expect(s.points('investment', 3).econ).toBeCloseTo(6, 6);
  });
  it('scores an event from its type and magnitude only', () => {
    const ev: ScheduledEvent = { id: 'x', type: 'war', origin: 'player', year: 1990, month: 1, countries: ['A'], scope: 'list', magnitude: 5, preconditions: [], delayMaxYears: 0, hooks: [] };
    expect(s.score(ev, { t: 0, countries: [0] })).toEqual(s.points('war', 5));
  });
  it('throws on unknown type', () => {
    expect(() => s.points('nope', 3)).toThrow(/unknown event type/);
  });
});
```

`packages/engine/test/impact.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import {
  CatalogScorer, IndicatorStore, Journal, LinkGraph, applyActiveEvents, dynParamsFromMeta, initState, makeActiveEvent,
  monthlyFactor, type ImpactContext,
} from '@ripple/engine';
import { buildFixture, FIXTURE_EVENTS } from './fixtures/world.js';

function setup() {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const scorer = new CatalogScorer(content.eventTypes);
  const journal = new Journal(content.engine.journal);
  const ctx: ImpactContext = {
    state, params: dynParamsFromMeta(dataset.meta), meta: dataset.meta, countries: dataset.countries, indicatorIndex: store.indicatorIndex,
    channels: content.channels, graph: new LinkGraph(dataset.graph, store.countryIndex), spill: content.engine.spill, journal,
    todayAbs: dataset.meta.todayAbs,
  };
  return { dataset, content, store, state, scorer, journal, ctx };
}
const war = FIXTURE_EVENTS.find((e) => e.id === 'fx-war-1985')!;

describe('impact', () => {
  it('spreads shock over shockMonths then persists', () => {
    const { scorer } = setup();
    const ev = makeActiveEvent(war, [1], scorer, 'forward', 100); // war: shock 3, persist 24, ratio 1
    expect(monthlyFactor(ev, 100)).toBeCloseTo(1 / 3, 6);
    expect(monthlyFactor(ev, 102)).toBeCloseTo(1 / 3, 6);
    expect(monthlyFactor(ev, 103)).toBeCloseTo(1 / 24, 6);
    expect(monthlyFactor(ev, 126)).toBeCloseTo(1 / 24, 6);
    expect(monthlyFactor(ev, 127)).toBe(0);
  });

  it('applies forward shocks to the country and spills to neighbours', () => {
    const { store, state, scorer, ctx, journal } = setup();
    const b = store.countryIndex.get('B')!, a = store.countryIndex.get('A')!, stab = store.indicatorIndex.get('stability')!;
    const before = state.x[state.idx(stab, b)]!;
    const t = absMonth(1985, 3);
    journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'forward', t)], t, ctx);
    journal.commit();
    // safety −15 × 1/3 × weight 1.0 = −5, plus econ −6 × 1/3 × (econ→stability 0.3) = −0.6
    expect(state.x[state.idx(stab, b)]).toBeCloseTo(before - 5 - 0.6, 4);
    // A is ring 1 (factor 0.25): −5 × 0.25 = −1.25 via safety, −2 × 0.25 × 0.3 = −0.15 via econ
    expect(state.x[state.idx(stab, a)]).toBeCloseTo(85 - 1.25 - 0.15, 4);
    const why = journal.why(stab, a, t);
    expect(why[0]!.cause).toBe('fx-war-1985');
    expect(why[0]!.from).toBe(b);
  });

  it('skips embedded shocks while real data exist, applies them after realUntil', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, econ = store.indicatorIndex.get('economy')!, stab = store.indicatorIndex.get('stability')!;
    const x0 = state.x[state.idx(econ, b)]!, s0 = state.x[state.idx(stab, b)]!;
    const t1 = absMonth(1985, 3);
    ctx.journal.begin(t1);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t1)], t1, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeCloseTo(x0, 6); // economy has real data until 1995 → embedded
    expect(state.x[state.idx(stab, b)]).toBeLessThan(s0); // stability is a prior → never embedded
    const t2 = absMonth(1997, 6);
    ctx.journal.begin(t2);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t2)], t2, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeLessThan(x0);
  });

  it('inverse applies with opposite sign only inside the real-data horizon', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, stab = store.indicatorIndex.get('stability')!, econ = store.indicatorIndex.get('economy')!;
    const s0 = state.x[state.idx(stab, b)]!, x0 = state.x[state.idx(econ, b)]!;
    const t = absMonth(1985, 3);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'inverse', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(stab, b)]).toBeCloseTo(s0, 6); // prior: realUntil < t → inverse skipped
    expect(state.x[state.idx(econ, b)]).toBeGreaterThan(x0); // war harms econ; inverse raises it
  });

  it('after «today» embedded shocks apply even where the series is a projection', () => {
    const { store, state, scorer, ctx } = setup();
    const b = store.countryIndex.get('B')!, econ = store.indicatorIndex.get('economy')!;
    const x0 = state.x[state.idx(econ, b)]!;
    const t = absMonth(1992, 6); // inside economy's realUntil (1995-12) but past a dataset whose «today» is 1990-12
    const early = { ...ctx, todayAbs: absMonth(1990, 12) };
    early.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [b], scorer, 'embedded', t)], t, early);
    early.journal.commit();
    expect(state.x[state.idx(econ, b)]).toBeLessThan(x0);
  });

  it('does not subtract from a country that outlived its real end: its series is synthetic, nothing is embedded there', () => {
    const { store, state, scorer, ctx } = setup();
    const u = store.countryIndex.get('U')!, econ = store.indicatorIndex.get('economy')!;
    const x0 = state.x[state.idx(econ, u)]!; // U is still active in this unstepped state, but 1990-06 is past its real end (1989-12)
    const t = absMonth(1990, 6);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [u], scorer, 'inverse', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, u)]).toBeCloseTo(x0, 6);
    ctx.journal.begin(t);
    applyActiveEvents([makeActiveEvent(war, [u], scorer, 'forward', t)], t, ctx);
    ctx.journal.commit();
    expect(state.x[state.idx(econ, u)]).toBeLessThan(x0);
  });
});
```

`packages/engine/test/schedule.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, type ScheduledEvent } from '@ripple/schema';
import { CatalogScorer, IndicatorStore, LinkGraph, Scheduler, initState, type HandoverContext, type SchedulerContext } from '@ripple/engine';
import { buildFixture, FIXTURE_EVENTS } from './fixtures/world.js';

function setup(isBaseline: boolean) {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const graph = new LinkGraph(dataset.graph, store.countryIndex);
  const scheduler = new Scheduler(FIXTURE_EVENTS, { isBaseline, seed: 1 });
  const scorer = new CatalogScorer(content.eventTypes);
  const handover: HandoverContext = {
    countries: dataset.countries, transitions: new Map(content.transitions.map((tr) => [tr.id, tr])),
    groupOf: (type) => scorer.def(type).group, retarget: new Set(content.engine.handover.retarget),
  };
  const ctx = (t: number, extra: Partial<SchedulerContext> = {}): SchedulerContext => ({
    t, state, countryIndex: store.countryIndex, indicatorIndex: store.indicatorIndex, graph, ...extra,
  });
  return { store, state, scheduler, ctx, handover };
}
const T_SPLIT = absMonth(1990, 1);

describe('Scheduler', () => {
  it('baseline fires on schedule as embedded and spawns hooks', () => {
    const { scheduler, ctx } = setup(true);
    const r = scheduler.tick(ctx(T_SPLIT));
    expect(r.firings.map((f) => f.event.id)).toEqual(['fx-u-split-1990']);
    expect(r.firings[0]!.mode).toBe('embedded');
    const next = scheduler.tick(ctx(T_SPLIT + 1));
    expect(next.firings.map((f) => f.event.id)).toEqual(['fx-u-split-1990#h0']);
    expect(next.firings[0]!.event.countries).toEqual(['U1', 'U2']);
    expect(scheduler.firedAt(T_SPLIT).has('fx-u-split-1990')).toBe(true);
  });

  it('player world: passing preconditions → embedded when mirrored, forward when not', () => {
    const base = setup(true);
    const player = setup(false);
    base.scheduler.tick(base.ctx(T_SPLIT));
    const r = player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990', 'embedded']]);
    const extra: ScheduledEvent = { id: 'player-1', type: 'investment', origin: 'player', year: 1990, month: 2, countries: ['A'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 0, hooks: [] };
    player.scheduler.add(extra);
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r2.firings.map((f) => [f.event.id, f.mode]).sort()).toEqual([['fx-u-split-1990#h0', 'embedded'], ['player-1', 'forward']]);
  });

  it('player world: failing precondition → inverse now, delayed, then cancelled after the window', () => {
    const base = setup(true);
    const player = setup(false);
    const u = player.store.countryIndex.get('U')!, stab = player.store.indicatorIndex.get('stability')!;
    player.state.x[player.state.idx(stab, u)] = 90; // propped up: 90 ≥ baseline 60 + 15
    base.scheduler.tick(base.ctx(T_SPLIT));
    const r = player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990', 'inverse']]);
    expect(r.delayed).toEqual(['fx-u-split-1990']);
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r2.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990#h0', 'inverse']]); // baseline's hook, player never spawned it
    let cancelled: string[] = [];
    for (let t = T_SPLIT + 2; t <= T_SPLIT + 61; t++) {
      base.scheduler.tick(base.ctx(t));
      cancelled = cancelled.concat(player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t) })).cancelled);
    }
    expect(cancelled).toEqual(['fx-u-split-1990']);
    expect(player.scheduler.fired.has('fx-u-split-1990')).toBe(false);
  });

  it('player world: delayed event fires forward once the precondition clears', () => {
    const base = setup(true);
    const player = setup(false);
    const u = player.store.countryIndex.get('U')!, stab = player.store.indicatorIndex.get('stability')!;
    player.state.x[player.state.idx(stab, u)] = 90;
    base.scheduler.tick(base.ctx(T_SPLIT));
    player.scheduler.tick(player.ctx(T_SPLIT, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT) }));
    player.state.x[player.state.idx(stab, u)] = 60;
    base.scheduler.tick(base.ctx(T_SPLIT + 1));
    const r = player.scheduler.tick(player.ctx(T_SPLIT + 1, { baselineX: base.state.x, mirror: base.scheduler.firedAt(T_SPLIT + 1) }));
    expect(r.firings.map((f) => [f.event.id, f.mode]).sort()).toEqual([['fx-u-split-1990', 'forward'], ['fx-u-split-1990#h0', 'inverse']]);
    const r2 = player.scheduler.tick(player.ctx(T_SPLIT + 2, { baselineX: base.state.x, mirror: new Map() }));
    expect(r2.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-u-split-1990#h0', 'forward']]);
  });

  it('player world: real events on a country that exists only in the baseline move to the holder (nature) or diverge (the rest)', () => {
    const base = setup(true);
    const player = setup(false); // state as of 1980: U active, U1 not born
    const quake: ScheduledEvent = { id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] };
    const crash: ScheduledEvent = { ...quake, id: 'crash-u1', type: 'banking_crisis' };
    for (const s of [base.scheduler, player.scheduler]) { s.add(quake); s.add(crash); }
    const t = absMonth(1990, 6);
    base.scheduler.tick(base.ctx(t));
    const r = player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t), handover: player.handover }));
    expect(r.firings.map((f) => [f.event.id, f.event.countries.join(), f.mode])).toEqual([['quake-u1', 'U', 'forward']]);
    expect(r.retargeted).toEqual([{ id: 'quake-u1', from: 'U1', to: 'U' }]);
    expect(r.diverged).toEqual(['crash-u1']);
    expect(r.firings.some((f) => f.mode === 'inverse')).toBe(false); // nothing to subtract: U1 has no state in this world
    expect(player.scheduler.fired.has('quake-u1')).toBe(true);
    const again = player.scheduler.tick(player.ctx(t + 1, { baselineX: base.state.x, mirror: new Map(), handover: player.handover }));
    expect(again.diverged).toEqual([]); // a diverged event is gone, not pending
  });

  it('player world: an independence event is anchored on the parent, not on the newborn', () => {
    const base = setup(true);
    const player = setup(false); // E is not born yet, D is active
    const t = absMonth(1992, 1);
    base.scheduler.tick(base.ctx(t));
    const r = player.scheduler.tick(player.ctx(t, { baselineX: base.state.x, mirror: base.scheduler.firedAt(t), handover: player.handover }));
    expect(r.firings.map((f) => [f.event.id, f.mode])).toEqual([['fx-e-secede-1992', 'embedded']]);
    expect(r.diverged).toEqual([]);
  });

  it('evaluates eventFired predicates', () => {
    const { scheduler, ctx, state } = setup(false);
    scheduler.add({ id: 'dep', type: 'protests', origin: 'real-A', year: 1980, month: 6, countries: ['A'], scope: 'list', magnitude: 2, preconditions: [{ kind: 'eventFired', event: 'root', fired: true }], delayMaxYears: 1, hooks: [] });
    const t = absMonth(1980, 6);
    expect(scheduler.tick(ctx(t, { baselineX: state.x, mirror: new Map() })).delayed).toEqual(['dep']);
    scheduler.add({ id: 'root', type: 'protests', origin: 'real-A', year: 1980, month: 7, countries: ['A'], scope: 'list', magnitude: 2, preconditions: [], delayMaxYears: 1, hooks: [] });
    const r = scheduler.tick(ctx(t + 1, { baselineX: state.x, mirror: new Map() }));
    expect(r.firings.map((f) => f.event.id).sort()).toEqual(['dep', 'root']);
  });
});
```

`packages/engine/test/transitions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, applyTransition, initState } from '@ripple/engine';
import { buildFixture, FIXTURE_TRANSITIONS } from './fixtures/world.js';

function setup() {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const id = (s: string) => store.countryIndex.get(s)!;
  const ind = (s: string) => store.indicatorIndex.get(s)!;
  return { store, state, id, ind };
}

describe('transitions', () => {
  it('split: successors take their own real values where data exist, inherit the offset, predecessor deactivates', () => {
    const { store, state, id, ind } = setup();
    state.offset[state.idx(ind('economy'), id('U'))] = 3;
    state.x[state.idx(ind('economy'), id('U'))] = 48;
    applyTransition(FIXTURE_TRANSITIONS[0]!, state, store, store.countryIndex, absMonth(1990, 1));
    expect(state.active[id('U')]).toBe(0);
    expect(state.active[id('U1')]).toBe(1);
    expect(state.x[state.idx(ind('economy'), id('U1'))]).toBeCloseTo(49, 1); // U1 real series: 44 + 0.5/yr × 10 years
    expect(state.offset[state.idx(ind('economy'), id('U2'))]).toBeCloseTo(3, 5); // counterfactual deviation carries over
    expect(state.x[state.idx(ind('population'), id('U1'))]).toBeCloseTo(7.7, 3); // own real series
  });

  it('secede: child activates on its own real values, parent stays', () => {
    const { store, state, id, ind } = setup();
    applyTransition(FIXTURE_TRANSITIONS[1]!, state, store, store.countryIndex, absMonth(1992, 1));
    expect(state.active[id('D')]).toBe(1);
    expect(state.active[id('E')]).toBe(1);
    expect(state.x[state.idx(ind('economy'), id('E'))]).toBeCloseTo(35, 3);
  });

  it('merge: real value for the survivor, population-weighted offsets, log-summed counts, absorbed country deactivates', () => {
    const { store, state, id, ind } = setup();
    const f = id('F'), g = id('G'), econ = ind('economy'), pop = ind('population');
    state.offset[state.idx(econ, f)] = 2;
    state.offset[state.idx(econ, g)] = 4;
    state.x[state.idx(pop, f)] = 7; // 10M
    state.x[state.idx(pop, g)] = 7; // 10M → equal weights
    applyTransition(FIXTURE_TRANSITIONS[2]!, state, store, store.countryIndex, absMonth(1994, 1));
    expect(state.active[g]).toBe(0);
    expect(state.x[state.idx(econ, f)]).toBeCloseTo(60, 3); // F's real series
    expect(state.offset[state.idx(econ, f)]).toBeCloseTo(3, 5);
    expect(state.x[state.idx(pop, f)]).toBeCloseTo(Math.log10(2e7), 5);
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Оценщик каталога**

`packages/engine/src/events/catalog.ts`:
```ts
import { CHANNELS, type Channel, type EventTypeDef, type ScheduledEvent } from '@ripple/schema';

export type ChannelPoints = Record<Channel, number>;

export interface ScoreContext {
  t: number;
  countries: number[]; // resolved indexes of the event's countries
}

/** Where an event's channel points come from. The catalog reads only type and magnitude; a model scorer (Jev, an LLM ensemble)
 *  may read the countries, the text and the context. Any scorer must be a pure function of its inputs for a fixed version:
 *  no network and no hidden state inside the tick (ADR 0002). Timing and spread stay catalog-driven via def(). */
export interface Scorer {
  def(typeId: string): EventTypeDef;
  score(ev: ScheduledEvent, ctx: ScoreContext): ChannelPoints;
}

export class CatalogScorer implements Scorer {
  private readonly types: Map<string, EventTypeDef>;
  constructor(defs: EventTypeDef[]) {
    this.types = new Map(defs.map((d) => [d.id, d]));
  }
  def(typeId: string): EventTypeDef {
    const d = this.types.get(typeId);
    if (!d) throw new Error(`unknown event type: ${typeId}`);
    return d;
  }
  points(typeId: string, magnitude: number): ChannelPoints {
    const d = this.def(typeId);
    const out = { econ: 0, safety: 0, health: 0, info: 0 } as ChannelPoints;
    for (const ch of CHANNELS) out[ch] = (d.impact[ch] ?? 0) * (magnitude / 3);
    return out;
  }
  score(ev: ScheduledEvent, _ctx: ScoreContext): ChannelPoints {
    return this.points(ev.type, ev.magnitude);
  }
}
```

- [ ] **Step 3: Применение воздействия**

`packages/engine/src/events/impact.ts`:
```ts
import { CHANNELS, type ChannelMap, type Country, type EngineConfig, type IndicatorsMeta, type LinkType, type ScheduledEvent } from '@ripple/schema';
import { applyShock, type DynParams } from '../dynamics.js';
import type { LinkGraph } from '../graph.js';
import type { Journal } from '../journal.js';
import type { WorldState } from '../state.js';
import type { ChannelPoints, Scorer } from './catalog.js';

export type ApplyMode = 'embedded' | 'forward' | 'inverse';

export interface ActiveEvent {
  id: string;
  typeId: string;
  countries: number[];
  global: boolean;
  points: ChannelPoints;
  startAbs: number;
  shockMonths: number;
  persistMonths: number;
  persistRatio: number;
  mode: ApplyMode;
  spreadBias: Partial<Record<LinkType, number>>;
}

export function makeActiveEvent(
  ev: ScheduledEvent, countries: number[], scorer: Scorer, mode: ApplyMode, startAbs: number,
): ActiveEvent {
  const def = scorer.def(ev.type);
  return {
    id: ev.id,
    typeId: ev.type,
    countries,
    global: ev.scope === 'global',
    points: scorer.score(ev, { t: startAbs, countries }),
    startAbs,
    shockMonths: ev.shockMonths ?? def.shockMonths,
    persistMonths: ev.persistMonths ?? def.persistMonths,
    persistRatio: def.persistRatio,
    mode,
    spreadBias: def.spreadBias,
  };
}

/** Share of the total points delivered in month t. Shock phase delivers 1 in total; persist phase delivers persistRatio in total. */
export function monthlyFactor(ev: ActiveEvent, t: number): number {
  const age = t - ev.startAbs;
  if (age < 0) return 0;
  if (age < ev.shockMonths) return 1 / ev.shockMonths;
  if (age < ev.shockMonths + ev.persistMonths) return ev.persistMonths === 0 ? 0 : ev.persistRatio / ev.persistMonths;
  return 0;
}

export function isExpired(ev: ActiveEvent, t: number): boolean {
  return t - ev.startAbs >= ev.shockMonths + ev.persistMonths;
}

export interface ImpactContext {
  state: WorldState;
  params: DynParams[];
  meta: IndicatorsMeta;
  countries: Country[];
  indicatorIndex: Map<string, number>;
  channels: ChannelMap;
  graph: LinkGraph;
  spill: EngineConfig['spill'];
  journal: Journal;
  todayAbs: number;
}

/** True while the series of country c still carries the real effect of events at t: the indicator is observed up to t,
 *  t is not past «today» (after today every series is a projection), and the country has not outlived its real end
 *  (after that its series is synthetic, see trend.ts). */
export function insideData(ctx: ImpactContext, i: number, c: number, t: number): boolean {
  const end = ctx.countries[c]!.to;
  return t <= Math.min(ctx.meta.indicators[i]!.realUntil, ctx.todayAbs) && (end === null || t <= end);
}

export function appliesTo(mode: ApplyMode, inside: boolean): boolean {
  if (mode === 'embedded') return !inside;
  if (mode === 'inverse') return inside;
  return true;
}

export function applyActiveEvents(active: ActiveEvent[], t: number, ctx: ImpactContext): void {
  const { state, journal } = ctx;
  for (const ev of active) {
    const f = monthlyFactor(ev, t);
    if (f === 0) continue;
    const sign = ev.mode === 'inverse' ? -1 : 1;
    const origins = ev.countries.filter((c) => state.active[c] === 1);
    if (origins.length === 0) continue;
    for (const ch of CHANNELS) {
      const pts = ev.points[ch] * f;
      if (pts === 0) continue;
      const targets = ev.global
        ? new Map<number, number>()
        : ctx.graph.spillTargets(origins, ctx.spill.rings[ch] ?? 0, ctx.spill.ringFactor, ev.spreadBias, state.active);
      for (const [code, weight] of Object.entries(ctx.channels[ch] ?? {})) {
        const i = ctx.indicatorIndex.get(code);
        if (i === undefined) continue;
        const delta = pts * weight * sign;
        const p = ctx.params[i]!;
        for (const c of origins) {
          if (!appliesTo(ev.mode, insideData(ctx, i, c, t))) continue;
          applyShock(state, i, c, delta, p);
          journal.record({ t, i, c, amount: delta, cause: ev.id, channel: ch });
        }
        for (const [c, factor] of targets) {
          if (!appliesTo(ev.mode, insideData(ctx, i, c, t))) continue;
          applyShock(state, i, c, delta * factor, p);
          journal.record({ t, i, c, amount: delta * factor, cause: ev.id, from: origins[0], channel: ch });
        }
      }
    }
  }
}
```

- [ ] **Step 4: Планировщик**

`packages/engine/src/events/schedule.ts`:
```ts
import { absMonth, fromAbs, type Country, type EventGroup, type FollowUp, type Predicate, type ScheduledEvent, type Transition } from '@ripple/schema';
import type { LinkGraph } from '../graph.js';
import { chance } from '../rng.js';
import type { WorldState } from '../state.js';
import type { ApplyMode } from './impact.js';

/** Player world only: what to do with a real event whose country does not exist in this world (ADR 0005). */
export interface HandoverContext {
  countries: Country[]; // same order as countryIndex
  transitions: Map<string, Transition>; // an event that carries a transition is anchored on the transition's first `from` country
  groupOf: (type: string) => EventGroup;
  retarget: ReadonlySet<EventGroup>; // groups that move to the territory holder; all other groups diverge
}

export interface SchedulerContext {
  t: number;
  state: WorldState;
  baselineX?: Float32Array;
  countryIndex: Map<string, number>;
  indicatorIndex: Map<string, number>;
  graph: LinkGraph;
  mirror?: Map<string, ScheduledEvent>; // what the baseline fired this tick (player world only)
  handover?: HandoverContext;
}

export interface Firing {
  event: ScheduledEvent;
  mode: ApplyMode;
}
export interface Retarget {
  id: string;
  from: string;
  to: string;
}
export interface TickResult {
  firings: Firing[];
  delayed: string[];
  cancelled: string[];
  retargeted: Retarget[]; // «в реальности: …»
  diverged: string[]; // «история пошла иначе»
}

export const eventAbs = (e: ScheduledEvent): number => absMonth(e.year, e.month);

export class Scheduler {
  private readonly byMonth = new Map<number, ScheduledEvent[]>();
  private pending: ScheduledEvent[] = [];
  private readonly firedByTick = new Map<number, Map<string, ScheduledEvent>>();
  readonly fired = new Set<string>();

  constructor(events: ScheduledEvent[], private readonly opts: { isBaseline: boolean; seed: number }) {
    for (const e of events) this.add(e);
  }

  add(e: ScheduledEvent): void {
    const abs = eventAbs(e);
    const list = this.byMonth.get(abs);
    if (list) list.push(e);
    else this.byMonth.set(abs, [e]);
  }

  firedAt(t: number): Map<string, ScheduledEvent> {
    return this.firedByTick.get(t) ?? new Map();
  }

  tick(ctx: SchedulerContext): TickResult {
    const t = ctx.t;
    const firedNow = new Map<string, ScheduledEvent>();
    this.firedByTick.set(t, firedNow);
    const result: TickResult = { firings: [], delayed: [], cancelled: [], retargeted: [], diverged: [] };
    const diverged = new Set<string>();
    // New events first (in file order), then re-checked pending ones: lets same-month dependencies resolve.
    const due = [...(this.byMonth.get(t) ?? []), ...this.pending];
    this.pending = [];

    for (const e of due) {
      const moved = this.opts.isBaseline ? null : this.handover(e, ctx);
      if (moved === 'diverged') {
        diverged.add(e.id);
        result.diverged.push(e.id);
        continue;
      }
      const ev = moved ?? e;
      if (this.opts.isBaseline || this.passes(ev, ctx)) {
        this.fire(ev, ctx, firedNow, result, moved ? 'forward' : undefined);
        if (moved) result.retargeted.push({ id: e.id, from: e.countries[0]!, to: moved.countries[0]! });
      } else if (t - eventAbs(e) >= e.delayMaxYears * 12) {
        result.cancelled.push(e.id);
      } else {
        this.pending.push(e); // the original: handover is decided afresh on every tick
        result.delayed.push(e.id);
      }
    }

    if (!this.opts.isBaseline && ctx.mirror) {
      for (const [id, e] of ctx.mirror) {
        if (!firedNow.has(id) && !diverged.has(id)) result.firings.push({ event: e, mode: 'inverse' });
      }
    }
    return result;
  }

  /** null = fire as is; 'diverged' = drop; otherwise the same event re-addressed to the territory holders. */
  private handover(e: ScheduledEvent, ctx: SchedulerContext): ScheduledEvent | 'diverged' | null {
    const h = ctx.handover;
    if (!h || e.scope === 'global') return null;
    // Independence events list the newborn first; what must exist is the country it leaves, i.e. the transition's `from`.
    const anchorId = (e.transition ? h.transitions.get(e.transition)?.from[0] : undefined) ?? e.countries[0]!;
    const anchor = ctx.countryIndex.get(anchorId);
    if (anchor === undefined || ctx.state.active[anchor] === 1) return null;
    if (!h.retarget.has(h.groupOf(e.type))) return 'diverged';
    const holders = [...new Set(e.countries.map((id) => this.holderOf(id, ctx, h)).filter((id): id is string => id !== null))];
    return holders.length === 0 ? 'diverged' : { ...e, countries: holders };
  }

  /** The active country that holds `id`'s territory in this world: itself, else the nearest active predecessor, else successor. */
  private holderOf(id: string, ctx: SchedulerContext, h: HandoverContext): string | null {
    const seen = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const c = ctx.countryIndex.get(cur);
      if (c === undefined) continue;
      if (ctx.state.active[c] === 1) return cur;
      const country = h.countries[c]!;
      queue.push(...country.predecessors, ...country.successors);
    }
    return null;
  }

  private fire(e: ScheduledEvent, ctx: SchedulerContext, firedNow: Map<string, ScheduledEvent>, result: TickResult, forced?: ApplyMode): void {
    this.fired.add(e.id);
    firedNow.set(e.id, e);
    const mirrored = this.opts.isBaseline || (ctx.mirror?.has(e.id) ?? false);
    result.firings.push({ event: e, mode: forced ?? (mirrored ? 'embedded' : 'forward') });
    e.hooks.forEach((h, idx) => {
      if (!chance(h.probability, this.opts.seed, 'hook', e.id, idx)) return;
      const countries = this.resolveTargets(h, e, ctx);
      if (countries.length === 0) return;
      const { year, month } = fromAbs(ctx.t + h.delayMonths);
      this.add({
        id: `${e.id}#h${idx}`, type: h.type, origin: 'hook', year, month, countries, scope: 'list',
        magnitude: h.magnitude, persistMonths: h.persistMonths, preconditions: [], delayMaxYears: 0, hooks: [],
      });
    });
  }

  private resolveTargets(h: FollowUp, e: ScheduledEvent, ctx: SchedulerContext): string[] {
    if (h.target === 'self') return e.countries;
    if (Array.isArray(h.target)) return h.target;
    const primary = ctx.countryIndex.get(e.countries[0]!);
    if (primary === undefined) return [];
    const ids = [...ctx.countryIndex.entries()];
    return ctx.graph.neighbors(primary, 'border', ctx.state.active).map((n) => ids.find(([, k]) => k === n.c)![0]);
  }

  private passes(e: ScheduledEvent, ctx: SchedulerContext): boolean {
    return e.preconditions.every((p) => this.evaluate(p, e, ctx));
  }

  private evaluate(p: Predicate, e: ScheduledEvent, ctx: SchedulerContext): boolean {
    if (p.kind === 'eventFired') return this.fired.has(p.event) === p.fired;
    const c = ctx.countryIndex.get(p.country ?? e.countries[0]!);
    const i = ctx.indicatorIndex.get(p.indicator);
    if (c === undefined || i === undefined || ctx.state.active[c] === 0) return false;
    const k = ctx.state.idx(i, c);
    const lhs = ctx.state.x[k]!;
    const rhs = typeof p.rhs === 'number' ? p.rhs : (ctx.baselineX?.[k] ?? lhs) + p.rhs.baselinePlus;
    return p.op === '<' ? lhs < rhs : lhs > rhs;
  }
}
```

- [ ] **Step 5: Переходы границ**

`packages/engine/src/transitions.ts`:
```ts
import type { Transition } from '@ripple/schema';
import type { WorldState } from './state.js';
import type { RealSource } from './store.js';

function weightsOf(state: WorldState, real: RealSource, ids: number[]): number[] {
  const pop = real.indicatorIndex.get('population');
  if (pop === undefined) return ids.map(() => 1);
  return ids.map((c) => Math.pow(10, state.x[state.idx(pop, c)]!));
}

export function applyTransition(tr: Transition, state: WorldState, real: RealSource, countryIndex: Map<string, number>, t: number): void {
  const idx = (id: string): number => {
    const k = countryIndex.get(id);
    if (k === undefined) throw new Error(`transition ${tr.id}: unknown country ${id}`);
    return k;
  };
  const from = tr.from.map(idx);
  const to = tr.to.map(idx);
  const kinds = real.meta.indicators.map((m) => m.kind);

  if (tr.kind === 'split' || tr.kind === 'secede') {
    const src = from[0]!;
    for (const dst of to) {
      state.active[dst] = 1;
      for (let i = 0; i < state.nI; i++) {
        const ks = state.idx(i, src), kd = state.idx(i, dst);
        const own = real.real(i, dst, t);
        if (kinds[i] === 'log10count') {
          state.x[kd] = Number.isNaN(own) ? state.x[ks]! - Math.log10(to.length + (tr.kind === 'secede' ? 9 : 0)) : own;
          state.offset[kd] = 0;
        } else {
          // Prefer the successor's own observed value so the baseline stays on real data; carry the deviation over.
          state.x[kd] = Number.isNaN(own) ? state.x[ks]! : own;
          state.offset[kd] = state.offset[ks]!;
        }
      }
    }
    if (tr.kind === 'split') state.active[src] = 0;
    return;
  }

  // merge
  const dst = to[0]!;
  const w = weightsOf(state, real, from);
  const wSum = w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < state.nI; i++) {
    const kd = state.idx(i, dst);
    if (kinds[i] === 'log10count') {
      state.x[kd] = Math.log10(from.reduce((acc, c) => acc + Math.pow(10, state.x[state.idx(i, c)]!), 0));
      state.offset[kd] = 0;
    } else {
      const own = real.real(i, dst, t);
      const weighted = from.reduce((acc, c, k) => acc + (w[k]! / wSum) * state.x[state.idx(i, c)]!, 0);
      state.x[kd] = Number.isNaN(own) ? weighted : own;
      state.offset[kd] = from.reduce((acc, c, k) => acc + (w[k]! / wSum) * state.offset[state.idx(i, c)]!, 0);
    }
  }
  for (const c of from) if (c !== dst) state.active[c] = 0;
}
```

Добавить в `packages/engine/src/index.ts`:
```ts
export * from './events/catalog.js';
export * from './events/impact.js';
export * from './events/schedule.js';
export * from './transitions.js';
```

- [ ] **Step 6: Прогнать и закоммитить**

Run: `pnpm test packages/engine && pnpm typecheck` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): catalog scorer, embedded/forward/inverse impact, mirrored scheduler with handover, border transitions"
```

---

### Task 10: Симуляция — тренд с аналогом, каркас функций риска, два мира, вмешательства, расхождение, сериализация

**Files:**
- Create: `packages/engine/src/trend.ts`, `packages/engine/src/hazards.ts`, `packages/engine/src/world.ts`, `packages/engine/src/sim.ts`; Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/trend.test.ts`, `packages/engine/test/hazards.test.ts`, `packages/engine/test/sim.test.ts`

**Interfaces:**
- Consumes: всё из задач 5–9, `Content` из `@ripple/content`, `RunRecord`, `PlayerEvent`, `Analogs`.
- Produces:
  - `class Trend implements RealSource { constructor(store, countries, analogs) }` — внутри срока жизни страны отдаёт данные как есть; после `country.to` синтезирует `real[end] + scale × (analog[t − shift] − analog[end − shift])` по записи из `analogs`, а без записи — по медиане приращений стран того же субрегиона, существующих в оба месяца (ADR 0005). Синтетические значения кэшируются по `(i, c)`; считаются только для стран, которые в каком-то мире пережили свой конец.
  - `interface Hazard { id; type; magnitude; rate(ctx: HazardContext, c): number }` (месячная вероятность до ворот), `interface HazardContext { t; state; countries; indicatorIndex }`, `interface GenerationGate { isBaseline; todayAbs; liveHistory; gamma; divergence?: Float32Array }`, `gateFactor(gate, c, t)` = `1` после «сегодня», `0` в базовой линии до «сегодня», иначе `max(liveHistory, divergence[c]^gamma)` (ADR 0004), `generateEvents(hazards, ctx, gate, seed): ScheduledEvent[]` — id `gen-<hazard>-<country>-<t>`, `origin: 'generated'`, монета `chance(rate × gate, seed, 'gen', hazard, country, t)`. В этапе 0 список функций риска пуст: тесты проверяют ворота и детерминизм на заглушках.
  - `interface WorldShared { store; trend: Trend; countries: Country[]; params; graph; scorer; channels; engine; transitions: Map<string, Transition>; countryIndex; indicatorIndex; hazards: Hazard[]; liveHistory; todayAbs; seed }`.
  - `interface LogEntry { t: number; kind: 'fired' | 'inverse' | 'delayed' | 'cancelled' | 'transition' | 'retargeted' | 'diverged'; id: string; mode?: ApplyMode; from?: string; to?: string }`.
  - `class SimWorld { state: WorldState; scheduler: Scheduler; journal: Journal; active: ActiveEvent[]; log: LogEntry[]; step(t, mirror?: Mirror) }`, `interface Mirror { x: Float32Array; fired: Map<string, ScheduledEvent>; divergence: Float32Array }`. Мир игрока получает контекст передачи модели; базовая линия — нет.
  - `interface SimOptions { dataset: Dataset; content: Content; seed: number; startYear: number; endYear?: number; liveHistory?: number; hazards?: Hazard[]; scorer?: Scorer }` (endYear по умолчанию 2050, liveHistory 0, hazards пусто, scorer — каталог контента).
  - `class Simulation { t; startAbs; endAbs; todayAbs; baseline: SimWorld; player: SimWorld; interventions: PlayerEvent[]; static create(opts); step(): boolean; runTo(abs); run(); apply(ev: PlayerEvent): string; divergence(): { world: number; byCountry: Float32Array }; snapshot(): Snapshot; stateHash(): { baseline: number; player: number }; serializeRun(): RunRecord; static restoreRun(dataset, content, run, hazards?): Simulation }`.
  - Расхождение страны: RMS разницы индексов через `1 − exp(−rms/σ)`, если страна активна в обоих мирах; `1`, если только в одном (ADR 0005; вес — население того мира, где она есть); страны, которых нет нигде, не считаются.
  - `interface CountrySnapshot { id; active: { baseline: boolean; player: boolean }; values: Record<string, { baseline: number; player: number; real: number }> }` (log10count переводится в абсолют), `interface Snapshot { t; year; month; divergence: { world; byCountry: Record<string, number> }; countries: CountrySnapshot[]; log: { baseline: LogEntry[]; player: LogEntry[] } }`.
  - Порядок внутри тика: `Simulation` считает расхождение по странам на начало тика; базовый мир шагает первым; мир игрока получает копию `x` базового мира до шага, `firedAt(t)` базового планировщика и расхождение. Внутри шага мира: генерация событий → планировщик → переходы → воздействие → динамика.

- [ ] **Step 1: Тесты**

`packages/engine/test/trend.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, Trend } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

describe('Trend', () => {
  const { dataset, content } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const trend = new Trend(store, dataset.countries, content.analogs);
  const econ = store.indicatorIndex.get('economy')!;
  const id = (s: string) => store.countryIndex.get(s)!;

  it('serves the data as they are inside a country lifetime', () => {
    expect(trend.real(econ, id('U'), absMonth(1989, 12))).toBe(store.real(econ, id('U'), absMonth(1989, 12)));
    expect(trend.real(econ, id('A'), absMonth(2000, 1))).toBe(store.real(econ, id('A'), absMonth(2000, 1)));
    expect(trend.realUntil(econ)).toBe(store.realUntil(econ));
  });

  it('continues a dissolved country by its analog, scaled', () => {
    // U ends 1989-12 at 45; analog A climbs 1.25/year; scale 0.5 → +0.625 after 12 months
    expect(Number.isNaN(store.real(econ, id('U'), absMonth(1990, 12)))).toBe(true);
    expect(trend.real(econ, id('U'), absMonth(1990, 12))).toBeCloseTo(45 + 0.5 * 1.25, 3);
    expect(trend.real(econ, id('U'), absMonth(1990, 1))).toBeCloseTo(45 + (0.5 * 1.25) / 12, 3);
  });

  it('falls back to the median move of the subregion', () => {
    // G ends 1993-12 at 50; peer moves over the next year: A 1.25, C 1, U1/U2 0.5, B/D/E/F 0 (U is gone) → median 0.25
    expect(trend.real(econ, id('G'), absMonth(1994, 12))).toBeCloseTo(50.25, 3);
  });

  it('goes flat once the analog is flat and never serves NaN inside the grid', () => {
    expect(trend.real(econ, id('U'), absMonth(2004, 12))).toBeCloseTo(trend.real(econ, id('U'), absMonth(1995, 12)), 3);
    expect(Number.isNaN(trend.real(econ, id('U'), absMonth(2004, 12)))).toBe(false);
    expect(Number.isNaN(trend.real(econ, id('U'), absMonth(2005, 1)))).toBe(true); // outside the dataset range
  });
});
```

`packages/engine/test/hazards.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { IndicatorStore, gateFactor, generateEvents, initState, type Hazard, type HazardContext } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

const always: Hazard = { id: 'always', type: 'protests', magnitude: 2, rate: () => 1 };
const never: Hazard = { ...always, id: 'never', rate: () => 0 };
const half: Hazard = { ...always, id: 'half', rate: () => 0.5 };

describe('hazards', () => {
  const { dataset } = buildFixture();
  const store = new IndicatorStore(dataset.meta, dataset.values);
  const state = initState(store, dataset.countries, dataset.meta.firstAbs);
  const ctx = (t: number): HazardContext => ({ t, state, countries: dataset.countries, indicatorIndex: store.indicatorIndex });
  const today = dataset.meta.todayAbs;
  const before = absMonth(1985, 1), after = today + 1;
  const gate = (isBaseline: boolean, liveHistory: number, divergence?: Float32Array) => ({ isBaseline, todayAbs: today, liveHistory, gamma: 1.5, divergence });

  it('gates: nothing in the baseline before today; liveHistory or divergence^gamma in the player world; everything after today', () => {
    expect(gateFactor(gate(true, 1), 0, before)).toBe(0);
    expect(gateFactor(gate(false, 0), 0, before)).toBe(0);
    expect(gateFactor(gate(false, 0.3), 0, before)).toBe(0.3);
    const div = new Float32Array([0.5]);
    expect(gateFactor(gate(false, 0, div), 0, before)).toBeCloseTo(Math.pow(0.5, 1.5), 6);
    expect(gateFactor(gate(false, 0.3, div), 0, before)).toBeCloseTo(Math.pow(0.5, 1.5), 6);
    expect(gateFactor(gate(true, 0), 0, after)).toBe(1);
    expect(gateFactor(gate(false, 0), 0, after)).toBe(1);
  });

  it('generates one event per active country per hazard at gated probability 1, with stable ids', () => {
    const events = generateEvents([always, never], ctx(before), gate(false, 1), 1);
    const active = dataset.countries.filter((_, c) => state.active[c] === 1);
    expect(events.length).toBe(active.length);
    expect(events[0]).toMatchObject({ id: `gen-always-${active[0]!.id}-${before}`, type: 'protests', origin: 'generated', countries: [active[0]!.id], year: 1985, month: 1, magnitude: 2 });
    expect(generateEvents([always], ctx(before), gate(true, 1), 1)).toEqual([]);
    expect(generateEvents([always], ctx(before), gate(false, 0), 1)).toEqual([]);
    expect(generateEvents([], ctx(after), gate(false, 1), 1)).toEqual([]);
  });

  it('is a seeded coin flip: both worlds draw the same events after today, other seeds draw differently', () => {
    const a = generateEvents([half], ctx(after), gate(true, 0), 3);
    const b = generateEvents([half], ctx(after), gate(false, 0), 3);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0); // 7 active countries at p = 0.5; if seed 3 happens to draw none or all, pick another seed here and below
    expect(a.length).toBeLessThan(dataset.countries.length);
    expect(generateEvents([half], ctx(after), gate(true, 0), 4)).not.toEqual(a);
  });
});
```

`packages/engine/test/sim.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { CatalogScorer, Simulation, type Hazard, type Scorer } from '@ripple/engine';
import { buildFixture } from './fixtures/world.js';

const make = (seed = 1, startYear = 1980, endYear = 2004, extra: { liveHistory?: number; hazards?: Hazard[]; scorer?: Scorer } = {}) => {
  const { dataset, content } = buildFixture();
  return Simulation.create({ dataset, content, seed, startYear, endYear, ...extra });
};
const propUp = (s: Simulation, id: string, abs: number) => {
  s.runTo(abs);
  const c = s.player.shared.countryIndex.get(id)!, stab = s.player.shared.indicatorIndex.get('stability')!;
  s.player.state.x[s.player.state.idx(stab, c)] = 95;
  s.player.state.offset[s.player.state.idx(stab, c)] = 35;
};

describe('Simulation', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = make(1), b = make(1), c = make(2);
    a.run(); b.run(); c.run();
    expect(a.stateHash()).toEqual(b.stateHash());
    expect(a.stateHash().player).not.toBe(c.stateHash().player);
    expect(a.t).toBe(a.endAbs);
  });

  it('without interventions the player world equals the baseline at every year', () => {
    const s = make(5);
    for (let y = 1981; y <= 2004; y++) {
      s.runTo(absMonth(y, 1));
      expect(s.stateHash().player).toBe(s.stateHash().baseline);
    }
    expect(s.divergence().world).toBe(0);
    expect(s.player.log.filter((l) => l.kind === 'inverse' || l.kind === 'delayed')).toEqual([]);
  });

  it('applies transitions in both worlds on schedule', () => {
    const s = make(1);
    s.runTo(absMonth(1990, 2));
    const u = s.baseline.shared.countryIndex.get('U')!, u1 = s.baseline.shared.countryIndex.get('U1')!;
    expect(s.baseline.state.active[u]).toBe(0);
    expect(s.player.state.active[u1]).toBe(1);
    expect(s.baseline.log.some((l) => l.kind === 'transition' && l.id === 'fx-u-1990')).toBe(true);
    s.runTo(absMonth(1994, 2));
    expect(s.player.state.active[s.player.shared.countryIndex.get('G')!]).toBe(0);
  });

  it('an intervention moves only the player world and shows up as divergence', () => {
    const clean = make(3);
    clean.run();
    const s = make(3);
    const id = s.apply({ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 });
    expect(id).toBe('player-1');
    s.run();
    expect(s.stateHash().baseline).toBe(clean.stateHash().baseline);
    expect(s.stateHash().player).not.toBe(clean.stateHash().player);
    const snap = s.snapshot();
    const a = snap.countries.find((c) => c.id === 'A')!;
    expect(a.values.economy!.player).toBeGreaterThan(a.values.economy!.baseline);
    expect(snap.divergence.world).toBeGreaterThan(0);
    expect(snap.divergence.byCountry.A).toBeGreaterThan(snap.divergence.byCountry.C!);
    expect(s.player.log.find((l) => l.id === 'player-1')?.mode).toBe('forward');
  });

  it('propping up U delays its dissolution only in the player world', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    const u = s.player.shared.countryIndex.get('U')!;
    s.runTo(absMonth(1990, 3));
    expect(s.baseline.state.active[u]).toBe(0);
    expect(s.player.state.active[u]).toBe(1);
    expect(s.player.log.some((l) => l.kind === 'delayed' && l.id === 'fx-u-split-1990')).toBe(true);
    expect(s.player.log.some((l) => l.kind === 'inverse' && l.id === 'fx-u-split-1990')).toBe(true);
  });

  it('a country alive in one world only counts as fully diverged, weighted by its own population', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.runTo(absMonth(1990, 3));
    const idx = (id: string) => s.shared.countryIndex.get(id)!;
    const div = s.divergence();
    expect(div.byCountry[idx('U')]).toBe(1); // player only
    expect(div.byCountry[idx('U1')]).toBe(1); // baseline only
    expect(div.byCountry[idx('E')]).toBe(0); // born in 1992: in neither world yet
    expect(div.byCountry[idx('A')]).toBeLessThan(0.5);
    expect(div.world).toBeGreaterThan(0.5); // U, U1, U2 hold 175M of ~250M people
  });

  it('a country that outlives its real end follows its analog trend and is never subtracted from', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.runTo(absMonth(1991, 1));
    const u = s.shared.countryIndex.get('U')!, econ = s.shared.indicatorIndex.get('economy')!;
    expect(s.player.state.active[u]).toBe(1);
    // U's economy stood at 45 when its series ends (1989-12); analog A climbs 1.25/year, scale 0.5 → 13 months later
    expect(s.player.state.x[s.player.state.idx(econ, u)]).toBeCloseTo(45 + 0.5 * 1.25 * (13 / 12), 0);
  });

  it('real events on a country that exists only in the baseline move to the holder or diverge', () => {
    const s = make(1);
    propUp(s, 'U', absMonth(1989, 12));
    s.player.scheduler.add({ id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.baseline.scheduler.add({ id: 'quake-u1', type: 'earthquake', origin: 'real-A', year: 1990, month: 6, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.player.scheduler.add({ id: 'crash-u1', type: 'banking_crisis', origin: 'real-A', year: 1990, month: 7, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.baseline.scheduler.add({ id: 'crash-u1', type: 'banking_crisis', origin: 'real-A', year: 1990, month: 7, countries: ['U1'], scope: 'list', magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] });
    s.runTo(absMonth(1990, 8));
    expect(s.player.log.find((l) => l.kind === 'retargeted')).toMatchObject({ id: 'quake-u1', from: 'U1', to: 'U' });
    expect(s.player.log.find((l) => l.id === 'quake-u1' && l.kind === 'fired')?.mode).toBe('forward');
    expect(s.player.log.some((l) => l.kind === 'diverged' && l.id === 'crash-u1')).toBe(true);
    expect(s.baseline.log.filter((l) => l.kind === 'retargeted' || l.kind === 'diverged')).toEqual([]);
  });

  it('live history: hazards fire only in the player world before today, and in both worlds after', () => {
    const always: Hazard = { id: 'always', type: 'protests', magnitude: 2, rate: () => 1 };
    const strict = make(2, 1980, 2004, { hazards: [always] });
    strict.runTo(absMonth(1990, 1));
    expect(strict.player.log.filter((l) => l.id.startsWith('gen-'))).toEqual([]); // liveHistory 0 and no divergence → silent
    expect(strict.stateHash().player).toBe(strict.stateHash().baseline);
    const live = make(2, 1980, 2004, { liveHistory: 1, hazards: [always] });
    live.runTo(absMonth(1981, 1));
    expect(live.baseline.log.filter((l) => l.id.startsWith('gen-'))).toEqual([]);
    expect(live.player.log.filter((l) => l.id.startsWith('gen-') && l.kind === 'fired' && l.mode === 'forward').length).toBeGreaterThan(0);
    expect(live.divergence().world).toBeGreaterThan(0);
    strict.run();
    const after = (w: { log: Array<{ t: number; id: string }> }) => w.log.filter((l) => l.id.startsWith('gen-') && l.t > strict.todayAbs).map((l) => l.id);
    expect(after(strict.baseline).length).toBeGreaterThan(0);
    expect(after(strict.player)).toEqual(after(strict.baseline));
  });

  it('takes channel points from a pluggable scorer', () => {
    const catalog = new CatalogScorer(buildFixture().content.eventTypes);
    const doubled: Scorer = {
      def: (id) => catalog.def(id),
      score: (ev, ctx) => { const p = catalog.score(ev, ctx); return { ...p, econ: p.econ * 2 }; },
    };
    const econA = (s: Simulation) => {
      s.apply({ type: 'investment', country: 'A', magnitude: 3, year: 1983, month: 1 });
      s.run();
      return s.snapshot().countries.find((c) => c.id === 'A')!.values.economy!.player;
    };
    expect(econA(make(3, 1980, 2004, { scorer: doubled }))).toBeGreaterThan(econA(make(3)));
  });

  it('rejects unknown types, non-player types and unknown countries', () => {
    const s = make(1);
    expect(() => s.apply({ type: 'nope', country: 'A', magnitude: 3, year: 1981, month: 1 })).toThrow();
    expect(() => s.apply({ type: 'dissolution', country: 'A', magnitude: 3, year: 1981, month: 1 })).toThrow(/not allowed/);
    expect(() => s.apply({ type: 'investment', country: 'ZZZ', magnitude: 3, year: 1981, month: 1 })).toThrow(/unknown country/);
  });

  it('serialises and restores a run bit-for-bit, live history included', () => {
    const s = make(9, 1980, 2004, { liveHistory: 0.3 });
    s.apply({ type: 'war', country: 'B', magnitude: 4, year: 1986, month: 5 });
    s.apply({ type: 'investment', country: 'C', magnitude: 2, year: 1990, month: 7 });
    s.run();
    const run = s.serializeRun();
    expect(run.interventions.length).toBe(2);
    expect(run.liveHistory).toBe(0.3);
    const { dataset, content } = buildFixture();
    const r = Simulation.restoreRun(dataset, content, run);
    r.run();
    expect(r.stateHash()).toEqual(s.stateHash());
    expect(() => make(1, 1980, 2004, { liveHistory: 2 })).toThrow(/liveHistory/);
  });

  it('snapshot converts log10 counts to absolute values', () => {
    const s = make(1);
    s.runTo(absMonth(1981, 1));
    const a = s.snapshot().countries.find((c) => c.id === 'A')!;
    expect(a.values.population!.real).toBeCloseTo(Math.pow(10, 7.5), -3);
  });
});
```

Run: `pnpm test packages/engine` → FAIL.

- [ ] **Step 2: Тренд с аналогом и каркас функций риска**

`packages/engine/src/trend.ts`:
```ts
import { existsAt, type Analogs, type Country, type IndicatorsMeta } from '@ripple/schema';
import type { IndicatorStore, RealSource } from './store.js';

interface Rule {
  analog: number;
  shift: number; // months
  scale: number;
}

/** Real series that continue past a country's real end (ADR 0005):
 *  real[t] = real[end] + scale × (analog[t − shift] − analog[end − shift]),
 *  the analog coming from content or, without a record, from the median move of the country's subregion peers. */
export class Trend implements RealSource {
  readonly meta: IndicatorsMeta;
  readonly indicatorIndex: Map<string, number>;
  private readonly rules: Array<Rule | null>;
  private readonly peers: number[][]; // same subregion, other countries
  private readonly cache = new Map<number, Float32Array>(); // (i * nC + c) → synthetic values by month

  constructor(private readonly store: IndicatorStore, private readonly countries: Country[], analogs: Analogs) {
    this.meta = store.meta;
    this.indicatorIndex = store.indicatorIndex;
    this.rules = countries.map((k) => {
      const r = analogs[k.id];
      if (!r) return null;
      const analog = store.countryIndex.get(r.analog);
      if (analog === undefined) throw new Error(`analog ${r.analog} of ${k.id}: unknown country`);
      return { analog, shift: r.shiftYears * 12, scale: r.scale };
    });
    this.peers = countries.map((k, c) => countries.map((p, j) => (j !== c && p.subregion === k.subregion ? j : -1)).filter((j) => j >= 0));
  }

  realUntil(i: number): number {
    return this.store.realUntil(i);
  }

  real(i: number, c: number, abs: number): number {
    const end = this.countries[c]!.to;
    if (end === null || abs <= end) return this.store.real(i, c, abs);
    return this.synth(i, c, abs, end);
  }

  private synth(i: number, c: number, abs: number, end: number): number {
    const m = abs - this.meta.firstAbs;
    if (m < 0 || m >= this.store.nM) return NaN;
    const key = i * this.store.nC + c;
    let row = this.cache.get(key);
    if (!row) {
      row = new Float32Array(this.store.nM).fill(NaN);
      this.cache.set(key, row);
    }
    if (!Number.isNaN(row[m]!)) return row[m]!;
    const base = this.store.real(i, c, end);
    const rule = this.rules[c];
    const move = rule ? rule.scale * this.move(i, rule.analog, abs - rule.shift, end - rule.shift) : this.medianMove(i, c, abs, end);
    const v = Number.isNaN(move) ? base : base + move;
    row[m] = v;
    return v;
  }

  private move(i: number, c: number, abs: number, end: number): number {
    return this.store.real(i, c, abs) - this.store.real(i, c, end);
  }

  private medianMove(i: number, c: number, abs: number, end: number): number {
    const moves = this.peers[c]!
      .filter((p) => existsAt(this.countries[p]!, abs) && existsAt(this.countries[p]!, end))
      .map((p) => this.move(i, p, abs, end))
      .filter((d) => !Number.isNaN(d))
      .sort((a, b) => a - b);
    if (moves.length === 0) return NaN;
    const mid = moves.length >> 1;
    return moves.length % 2 === 1 ? moves[mid]! : (moves[mid - 1]! + moves[mid]!) / 2;
  }
}
```

`packages/engine/src/hazards.ts`:
```ts
import { fromAbs, type Country, type ScheduledEvent } from '@ripple/schema';
import { chance } from './rng.js';
import type { WorldState } from './state.js';

export interface HazardContext {
  t: number;
  state: WorldState;
  countries: Country[];
  indicatorIndex: Map<string, number>;
}

/** Turns one country's state into a monthly probability of one event type. Stage 0 ships none; stage 1 adds the first 6–8. */
export interface Hazard {
  id: string;
  type: string;
  magnitude: number;
  rate(ctx: HazardContext, c: number): number; // 0..1, before gating
}

export interface GenerationGate {
  isBaseline: boolean;
  todayAbs: number;
  liveHistory: number; // 0..1, «живая история»
  gamma: number;
  divergence?: Float32Array; // by country, as of the start of the tick (player world)
}

/** Before «today» the baseline generates nothing and the player world plays hazards at hazard × max(liveHistory, divergence^gamma);
 *  after «today» both worlds play them in full on shared random numbers, so without interventions they draw the same future (ADR 0004). */
export function gateFactor(gate: GenerationGate, c: number, t: number): number {
  if (t > gate.todayAbs) return 1;
  if (gate.isBaseline) return 0;
  return Math.max(gate.liveHistory, Math.pow(gate.divergence?.[c] ?? 0, gate.gamma));
}

export function generateEvents(hazards: Hazard[], ctx: HazardContext, gate: GenerationGate, seed: number): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  if (hazards.length === 0) return out;
  const { year, month } = fromAbs(ctx.t);
  for (const h of hazards) {
    for (let c = 0; c < ctx.countries.length; c++) {
      if (ctx.state.active[c] === 0) continue;
      const g = gateFactor(gate, c, ctx.t);
      if (g === 0) continue;
      const p = h.rate(ctx, c) * g;
      if (p <= 0) continue;
      const id = ctx.countries[c]!.id;
      if (!chance(p, seed, 'gen', h.id, id, ctx.t)) continue;
      out.push({
        id: `gen-${h.id}-${id}-${ctx.t}`, type: h.type, origin: 'generated', year, month, countries: [id], scope: 'list',
        magnitude: h.magnitude, preconditions: [], delayMaxYears: 0, hooks: [],
      });
    }
  }
  return out;
}
```

- [ ] **Step 3: Мир**

`packages/engine/src/world.ts`:
```ts
import type { ChannelMap, Country, EngineConfig, ScheduledEvent, Transition } from '@ripple/schema';
import { stepIndicators, type DynParams } from './dynamics.js';
import type { Scorer } from './events/catalog.js';
import { applyActiveEvents, isExpired, makeActiveEvent, type ActiveEvent, type ApplyMode } from './events/impact.js';
import { Scheduler, type HandoverContext } from './events/schedule.js';
import type { LinkGraph } from './graph.js';
import { generateEvents, type Hazard } from './hazards.js';
import { Journal } from './journal.js';
import type { WorldState } from './state.js';
import type { IndicatorStore } from './store.js';
import { applyTransition } from './transitions.js';
import type { Trend } from './trend.js';

export interface WorldShared {
  store: IndicatorStore;
  trend: Trend;
  countries: Country[];
  params: DynParams[];
  graph: LinkGraph;
  scorer: Scorer;
  channels: ChannelMap;
  engine: EngineConfig;
  transitions: Map<string, Transition>;
  countryIndex: Map<string, number>;
  indicatorIndex: Map<string, number>;
  hazards: Hazard[];
  liveHistory: number;
  todayAbs: number;
  seed: number;
}

export interface LogEntry {
  t: number;
  kind: 'fired' | 'inverse' | 'delayed' | 'cancelled' | 'transition' | 'retargeted' | 'diverged';
  id: string;
  mode?: ApplyMode;
  from?: string; // retargeted: where the event stood in reality («в реальности: …»)
  to?: string; // retargeted: the holder it moved to
}

export interface Mirror {
  x: Float32Array;
  fired: Map<string, ScheduledEvent>;
  divergence: Float32Array;
}

export class SimWorld {
  readonly scheduler: Scheduler;
  readonly journal: Journal;
  private readonly handover: HandoverContext | undefined;
  active: ActiveEvent[] = [];
  readonly log: LogEntry[] = [];

  constructor(readonly shared: WorldShared, readonly state: WorldState, events: ScheduledEvent[], readonly isBaseline: boolean) {
    this.scheduler = new Scheduler(events, { isBaseline, seed: shared.seed });
    this.journal = new Journal(shared.engine.journal);
    this.handover = isBaseline
      ? undefined
      : { countries: shared.countries, transitions: shared.transitions, groupOf: (type) => shared.scorer.def(type).group, retarget: new Set(shared.engine.handover.retarget) };
  }

  step(t: number, mirror?: Mirror): void {
    const sh = this.shared;
    this.journal.begin(t);
    const generated = generateEvents(
      sh.hazards,
      { t, state: this.state, countries: sh.countries, indicatorIndex: sh.indicatorIndex },
      { isBaseline: this.isBaseline, todayAbs: sh.todayAbs, liveHistory: sh.liveHistory, gamma: sh.engine.generation.gamma, divergence: mirror?.divergence },
      sh.seed,
    );
    for (const e of generated) this.scheduler.add(e);
    const res = this.scheduler.tick({
      t, state: this.state, baselineX: mirror?.x, countryIndex: sh.countryIndex, indicatorIndex: sh.indicatorIndex,
      graph: sh.graph, mirror: mirror?.fired, handover: this.handover,
    });
    for (const id of res.delayed) this.log.push({ t, kind: 'delayed', id });
    for (const id of res.cancelled) this.log.push({ t, kind: 'cancelled', id });
    for (const id of res.diverged) this.log.push({ t, kind: 'diverged', id });
    for (const r of res.retargeted) this.log.push({ t, kind: 'retargeted', id: r.id, from: r.from, to: r.to });
    for (const { event, mode } of res.firings) {
      if (mode !== 'inverse' && event.transition) {
        const tr = sh.transitions.get(event.transition);
        if (!tr) throw new Error(`event ${event.id}: unknown transition ${event.transition}`);
        applyTransition(tr, this.state, sh.trend, sh.countryIndex, t);
        this.log.push({ t, kind: 'transition', id: tr.id });
      }
      const countries = event.scope === 'global'
        ? Array.from(this.state.active, (a, c) => (a === 1 ? c : -1)).filter((c) => c >= 0)
        : event.countries.map((id) => sh.countryIndex.get(id)).filter((c): c is number => c !== undefined);
      this.active.push(makeActiveEvent(event, countries, sh.scorer, mode, t));
      this.log.push({ t, kind: mode === 'inverse' ? 'inverse' : 'fired', id: event.id, mode });
    }
    applyActiveEvents(this.active, t, {
      state: this.state, params: sh.params, meta: sh.store.meta, countries: sh.countries, indicatorIndex: sh.indicatorIndex,
      channels: sh.channels, graph: sh.graph, spill: sh.engine.spill, journal: this.journal, todayAbs: sh.todayAbs,
    });
    this.active = this.active.filter((ev) => !isExpired(ev, t + 1));
    stepIndicators(this.state, sh.trend, sh.params, t, sh.seed);
    this.journal.commit();
  }
}
```

- [ ] **Step 4: Симуляция**

`packages/engine/src/sim.ts`:
```ts
import { absMonth, fromAbs, type PlayerEvent, type RunRecord, type ScheduledEvent } from '@ripple/schema';
import type { Content } from '@ripple/content';
import { dynParamsFromMeta } from './dynamics.js';
import { CatalogScorer, type Scorer } from './events/catalog.js';
import { LinkGraph } from './graph.js';
import type { Hazard } from './hazards.js';
import { initState } from './state.js';
import { IndicatorStore } from './store.js';
import { Trend } from './trend.js';
import type { Dataset } from './types.js';
import { SimWorld, type LogEntry, type WorldShared } from './world.js';

export interface SimOptions {
  dataset: Dataset;
  content: Content;
  seed: number;
  startYear: number;
  endYear?: number;
  liveHistory?: number; // 0..1, default 0 («Строгая»); UI presets: 0 / 0.3 / 1
  hazards?: Hazard[]; // default none (stage 0)
  scorer?: Scorer; // default: the content catalog; the seam for model scorers (version 2.0)
}

export interface CountrySnapshot {
  id: string;
  active: { baseline: boolean; player: boolean };
  values: Record<string, { baseline: number; player: number; real: number }>;
}
export interface Snapshot {
  t: number;
  year: number;
  month: number;
  divergence: { world: number; byCountry: Record<string, number> };
  countries: CountrySnapshot[];
  log: { baseline: LogEntry[]; player: LogEntry[] };
}

export class Simulation {
  t: number;
  readonly todayAbs: number;
  readonly interventions: PlayerEvent[] = [];
  private counter = 0;

  private constructor(
    readonly dataset: Dataset,
    readonly content: Content,
    readonly shared: WorldShared,
    readonly startAbs: number,
    readonly endAbs: number,
    readonly baseline: SimWorld,
    readonly player: SimWorld,
    private readonly startYear: number,
    private readonly endYear: number,
  ) {
    this.t = startAbs;
    this.todayAbs = shared.todayAbs;
  }

  static create(opts: SimOptions): Simulation {
    const { dataset, content } = opts;
    const endYear = opts.endYear ?? 2050;
    const liveHistory = opts.liveHistory ?? 0;
    const startAbs = absMonth(opts.startYear, 1);
    const endAbs = absMonth(endYear, 12);
    if (startAbs < dataset.meta.firstAbs || endAbs > dataset.meta.lastAbs) {
      throw new Error(`run ${opts.startYear}–${endYear} outside dataset range`);
    }
    if (!(liveHistory >= 0 && liveHistory <= 1)) throw new Error(`liveHistory must be within 0..1, got ${liveHistory}`);
    const store = new IndicatorStore(dataset.meta, dataset.values);
    const shared: WorldShared = {
      store,
      trend: new Trend(store, dataset.countries, content.analogs),
      countries: dataset.countries,
      params: dynParamsFromMeta(dataset.meta),
      graph: new LinkGraph(dataset.graph, store.countryIndex),
      scorer: opts.scorer ?? new CatalogScorer(content.eventTypes),
      channels: content.channels,
      engine: content.engine,
      transitions: new Map(content.transitions.map((tr) => [tr.id, tr])),
      countryIndex: store.countryIndex,
      indicatorIndex: store.indicatorIndex,
      hazards: opts.hazards ?? [],
      liveHistory,
      todayAbs: dataset.meta.todayAbs,
      seed: opts.seed,
    };
    const events = content.events.filter((e) => absMonth(e.year, e.month) >= startAbs);
    const baseline = new SimWorld(shared, initState(store, dataset.countries, startAbs), events, true);
    const player = new SimWorld(shared, initState(store, dataset.countries, startAbs), events, false);
    return new Simulation(dataset, content, shared, startAbs, endAbs, baseline, player, opts.startYear, endYear);
  }

  step(): boolean {
    if (this.t >= this.endAbs) return false;
    const divergence = this.divergence().byCountry; // as of the start of the tick, for the hazard gate
    const mirrorX = this.baseline.state.x.slice();
    this.baseline.step(this.t);
    this.player.step(this.t, { x: mirrorX, fired: this.baseline.scheduler.firedAt(this.t), divergence });
    this.t += 1;
    return true;
  }

  runTo(abs: number): void {
    while (this.t < Math.min(abs, this.endAbs)) this.step();
  }

  run(): void {
    this.runTo(this.endAbs);
  }

  apply(ev: PlayerEvent): string {
    const def = this.shared.scorer.def(ev.type);
    if (!def.playerAllowed) throw new Error(`event type ${ev.type} is not allowed for the player`);
    if (!this.shared.countryIndex.has(ev.country)) throw new Error(`unknown country ${ev.country}`);
    const abs = Math.max(absMonth(ev.year, ev.month), this.t);
    const { year, month } = fromAbs(abs);
    const id = `player-${++this.counter}`;
    const scheduled: ScheduledEvent = {
      id, type: ev.type, origin: 'player', year, month, countries: [ev.country], scope: 'list', magnitude: ev.magnitude,
      preconditions: [], delayMaxYears: 0, hooks: [],
    };
    this.player.scheduler.add(scheduled);
    this.interventions.push({ ...ev, year, month });
    return id;
  }

  /** Per country: 1 − exp(−rms/σ) over index indicators where both worlds have it; 1 where only one world has it (ADR 0005).
   *  World: population-weighted mean, each country weighed by its population in the world where it exists. */
  divergence(): { world: number; byCountry: Float32Array } {
    const { store, engine } = this.shared;
    const b = this.baseline.state, p = this.player.state;
    const idx = store.meta.indicators.map((m, i) => (m.kind === 'index' ? i : -1)).filter((i) => i >= 0);
    const pop = store.indicatorIndex.get('population');
    const byCountry = new Float32Array(store.nC);
    let wSum = 0, acc = 0;
    for (let c = 0; c < store.nC; c++) {
      const inB = b.active[c] === 1, inP = p.active[c] === 1;
      if (!inB && !inP) continue;
      let value: number;
      if (inB !== inP) {
        value = 1;
      } else {
        let sq = 0;
        for (const i of idx) {
          const d = p.x[p.idx(i, c)]! - b.x[b.idx(i, c)]!;
          sq += d * d;
        }
        value = 1 - Math.exp(-Math.sqrt(sq / Math.max(1, idx.length)) / engine.divergenceSigma);
      }
      const s = inP ? p : b;
      const w = pop === undefined ? 1 : Math.pow(10, s.x[s.idx(pop, c)]!);
      byCountry[c] = value;
      acc += w * value;
      wSum += w;
    }
    return { world: wSum === 0 ? 0 : acc / wSum, byCountry };
  }

  snapshot(): Snapshot {
    const { store } = this.shared;
    const div = this.divergence();
    const { year, month } = fromAbs(this.t);
    const display = (kind: string, v: number) => (kind === 'log10count' ? Math.pow(10, v) : v);
    const countries = this.dataset.countries.map((country, c) => {
      const values: CountrySnapshot['values'] = {};
      store.meta.indicators.forEach((m, i) => {
        values[m.code] = {
          baseline: display(m.kind, this.baseline.state.x[this.baseline.state.idx(i, c)]!),
          player: display(m.kind, this.player.state.x[this.player.state.idx(i, c)]!),
          real: display(m.kind, store.real(i, c, Math.min(this.t, store.meta.lastAbs))),
        };
      });
      return { id: country.id, active: { baseline: this.baseline.state.active[c] === 1, player: this.player.state.active[c] === 1 }, values };
    });
    const byCountry: Record<string, number> = {};
    this.dataset.countries.forEach((k, c) => (byCountry[k.id] = div.byCountry[c]!));
    return { t: this.t, year, month, divergence: { world: div.world, byCountry }, countries, log: { baseline: this.baseline.log, player: this.player.log } };
  }

  stateHash(): { baseline: number; player: number } {
    return { baseline: this.baseline.state.hash(), player: this.player.state.hash() };
  }

  serializeRun(): RunRecord {
    return {
      v: 1, dataVersion: this.dataset.meta.dataVersion, seed: this.shared.seed, startYear: this.startYear, endYear: this.endYear,
      liveHistory: this.shared.liveHistory, interventions: [...this.interventions],
    };
  }

  static restoreRun(dataset: Dataset, content: Content, run: RunRecord, hazards: Hazard[] = []): Simulation {
    if (run.dataVersion !== dataset.meta.dataVersion) throw new Error(`run data ${run.dataVersion} != dataset ${dataset.meta.dataVersion}`);
    const sim = Simulation.create({ dataset, content, seed: run.seed, startYear: run.startYear, endYear: run.endYear, liveHistory: run.liveHistory, hazards });
    for (const iv of run.interventions) sim.apply(iv);
    return sim;
  }
}
```

Добавить в `packages/engine/src/index.ts`:
```ts
export * from './trend.js';
export * from './hazards.js';
export * from './world.js';
export * from './sim.js';
```

- [ ] **Step 5: Прогнать и закоммитить**

Run: `pnpm test packages/engine && pnpm typecheck` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): analog trend, hazard skeleton with live history, Simulation with baseline/player worlds, divergence, run (de)serialisation"
```

---

### Task 11: CLI `ripple run` и `ripple validate` на фикстурах

**Files:**
- Create: `apps/cli/src/main.ts`, `apps/cli/src/load.ts`, `apps/cli/src/run.ts`, `apps/cli/src/validate.ts`
- Test: `apps/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: `Simulation`, `IndicatorStore.assemble`, `loadContent`, схемы.
- Produces:
  - `loadDataset(dir: string): Dataset` — читает `countries.json`, `graph.json`, `indicators/meta.json`, `indicators/{decade}.bin`.
  - `runCommand(opts: { data: string; from: number; to: number; seed: number; live?: number; events: PlayerEvent[]; out?: string }): Report` (`live` — «живая история» 0..1, по умолчанию 0; в этапе 0 без функций риска она ничего не меняет, но уже хранится в ссылке-повторе).
  - `validateCommand(opts: { data: string }): { errors: string[]; warnings: string[] }`.
  - `interface Report { run: RunRecord; elapsedMs: number; divergence: { world: number; top: Array<{ id: string; value: number }> }; log: { baseline: LogEntry[]; player: LogEntry[] }; final: CountrySnapshot[] }`.
  - Бинарник: `pnpm ripple run --data <dir> --from 1980 --to 2025 --seed 1 [--live 0.3] [--event '<json>']... [--out report.json]`, `pnpm ripple validate --data <dir>`.

- [ ] **Step 1: Тест**

`apps/cli/test/cli.test.ts`:
```ts
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

  it('works as a binary', () => {
    const tsx = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const stdout = execFileSync(process.execPath, [tsx, 'apps/cli/src/main.ts', 'run', '--data', dir, '--from', '1980', '--to', '1990', '--seed', '1', '--live', '0'], { cwd: ROOT, encoding: 'utf8' });
    const report = JSON.parse(stdout);
    expect(report.run.startYear).toBe(1980);
    expect(report.run.liveHistory).toBe(0);
    expect(report.divergence.world).toBe(0);
  });
});
```

Run: `pnpm test apps/cli` → FAIL.

- [ ] **Step 2: Загрузчик и команды**

`apps/cli/src/load.ts`:
```ts
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
```

`apps/cli/src/run.ts`:
```ts
import { writeFileSync } from 'node:fs';
import { loadContent } from '@ripple/content';
import { Simulation, type CountrySnapshot, type LogEntry } from '@ripple/engine';
import type { PlayerEvent, RunRecord } from '@ripple/schema';
import { loadDataset } from './load.js';

export interface Report {
  run: RunRecord;
  elapsedMs: number;
  divergence: { world: number; top: Array<{ id: string; value: number }> };
  log: { baseline: LogEntry[]; player: LogEntry[] };
  final: CountrySnapshot[];
}

export function runCommand(opts: { data: string; from: number; to: number; seed: number; live?: number; events: PlayerEvent[]; out?: string }): Report {
  const dataset = loadDataset(opts.data);
  const content = loadContent();
  const sim = Simulation.create({ dataset, content, seed: opts.seed, startYear: opts.from, endYear: opts.to, liveHistory: opts.live ?? 0 });
  for (const e of opts.events) sim.apply(e);
  const started = performance.now();
  sim.run();
  const elapsedMs = performance.now() - started;
  const snap = sim.snapshot();
  const top = Object.entries(snap.divergence.byCountry)
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const report: Report = { run: sim.serializeRun(), elapsedMs, divergence: { world: snap.divergence.world, top }, log: snap.log, final: snap.countries };
  if (opts.out) writeFileSync(opts.out, JSON.stringify(report, null, 2));
  return report;
}
```

`apps/cli/src/validate.ts`:
```ts
import { existsAt } from '@ripple/schema';
import { IndicatorStore } from '@ripple/engine';
import { loadDataset } from './load.js';

export function validateCommand(opts: { data: string }): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ds = loadDataset(opts.data);
  const store = new IndicatorStore(ds.meta, ds.values);
  const ids = new Set(ds.countries.map((c) => c.id));
  if (ds.meta.countries.join() !== ds.countries.map((c) => c.id).join()) errors.push('meta.countries order differs from countries.json');
  if (ds.meta.todayAbs < ds.meta.firstAbs || ds.meta.todayAbs > ds.meta.lastAbs) errors.push(`todayAbs ${ds.meta.todayAbs} outside the grid`);
  for (const e of ds.graph) {
    if (!ids.has(e.a) || !ids.has(e.b)) errors.push(`graph edge ${e.a}-${e.b} references unknown country`);
  }
  ds.countries.forEach((country, c) => {
    for (let abs = ds.meta.firstAbs; abs <= ds.meta.lastAbs; abs++) {
      if (!existsAt(country, abs)) continue;
      for (let i = 0; i < store.nI; i++) {
        if (Number.isNaN(store.real(i, c, abs))) {
          errors.push(`${country.id}/${ds.meta.indicators[i]!.code}: missing value at abs ${abs}`);
          abs = ds.meta.lastAbs; // one report per country is enough
          break;
        }
      }
    }
  });
  for (const m of ds.meta.indicators) if (m.estimated.length > ds.countries.length / 2) warnings.push(`${m.code}: more than half of countries are estimated`);
  return { errors, warnings };
}
```

`apps/cli/src/main.ts`:
```ts
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
```

- [ ] **Step 3: Прогнать и закоммитить**

Run: `pnpm test apps/cli && pnpm typecheck` → PASS.

```bash
git add apps/cli
git commit -m "feat(cli): ripple run / validate over a dataset directory"
```

---

## Данные

Задачи 12–15 строят `packages/data/out` из открытых источников. Сеть используется только в `pipeline/build.ts` (и в явных шагах «проверить URL»); все тесты работают на строках-фикстурах и на уже закоммиченном `out/`.

### Task 12: Конвейер — источники, кэш загрузок, CSV, запись файлов

**Files:**
- Create: `packages/data/pipeline/sources.ts`, `packages/data/pipeline/fetch.ts`, `packages/data/pipeline/csv.ts`, `packages/data/pipeline/write.ts`
- Test: `packages/data/test/csv.test.ts`, `packages/data/test/fetch.test.ts`

**Interfaces:**
- Produces:
  - `interface Source { id: string; url: string; license: string; attribution: string; binary?: boolean }`, `SOURCES: Record<'naturalEarth' | 'wpp' | 'wdi' | 'owid', Source>`, `wdiUrl(code, page): string`, `owidUrl(slug): string`.
  - `type FetchImpl = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>`; `interface FetchOptions { cacheDir: string; fetchImpl?: FetchImpl; log?: (msg: string) => void }`; `fetchCached(url, opts): Promise<Buffer>` — кэш по sha1(url) в `cacheDir`; `sha1(buf: Buffer): string`; `DEFAULT_CACHE_DIR` = `packages/data/cache` (в `.gitignore`).
  - `parseCsv(text): string[][]` (RFC 4180: кавычки, `""`, CRLF, переносы внутри кавычек), `csvObjects(text): Array<Record<string, string>>` (первая строка — заголовок, BOM срезается).
  - `OUT_DIR` = `packages/data/out`; `writeJson(path, value)`, `writeBin(path, data: Int16Array)`, `dirSizeBytes(dir): number`.

- [ ] **Step 1: Тесты**

`packages/data/test/csv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { csvObjects, parseCsv } from '../pipeline/csv.js';

describe('csv', () => {
  it('parses quoted fields, escaped quotes, CRLF and embedded newlines', () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"multi\nline",\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'multi\nline', ''],
    ]);
  });
  it('keeps a trailing empty field and a last line without newline', () => {
    expect(parseCsv('a,b,\n1,2,3')).toEqual([['a', 'b', ''], ['1', '2', '3']]);
  });
  it('maps rows to objects by header and strips a BOM', () => {
    expect(csvObjects('﻿Entity,Code,Year,v\nFrance,FRA,1990,0.5\n\n')).toEqual([{ Entity: 'France', Code: 'FRA', Year: '1990', v: '0.5' }]);
  });
});
```

`packages/data/test/fetch.test.ts`:
```ts
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
```

Run: `pnpm test packages/data` → FAIL (модули не существуют).

- [ ] **Step 2: Реализация**

`packages/data/pipeline/sources.ts`:
```ts
export interface Source {
  id: string;
  url: string;
  license: string;
  attribution: string;
  binary?: boolean;
}

export const WDI_API = 'https://api.worldbank.org/v2';

export const SOURCES = {
  naturalEarth: {
    id: 'natural-earth-50m-admin0',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    license: 'Public domain',
    attribution: 'Made with Natural Earth (naturalearthdata.com)',
  },
  wpp: {
    id: 'un-wpp-2024-total-population',
    url: 'https://population.un.org/wpp/Download/Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz',
    license: 'CC BY 3.0 IGO',
    attribution: 'United Nations, DESA, Population Division. World Population Prospects 2024',
    binary: true,
  },
  wdi: {
    id: 'world-bank-wdi',
    url: WDI_API,
    license: 'CC BY 4.0',
    attribution: 'World Bank, World Development Indicators',
  },
  owid: {
    id: 'owid-grapher',
    url: 'https://ourworldindata.org/grapher',
    license: 'CC BY 4.0 (data: V-Dem Institute v15; Barro & Lee; processed by Our World in Data)',
    attribution: 'Our World in Data; V-Dem Institute; Barro & Lee',
  },
} satisfies Record<string, Source>;

export function wdiUrl(code: string, page: number): string {
  return `${WDI_API}/country/all/indicator/${code}?format=json&per_page=20000&page=${page}&date=1960:2030`;
}

export function owidUrl(slug: string): string {
  return `${SOURCES.owid.url}/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`;
}
```

`packages/data/pipeline/fetch.ts`:
```ts
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
```

`packages/data/pipeline/csv.ts`:
```ts
/** RFC 4180 parser: quoted fields, doubled quotes, CR/LF/CRLF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[k + 1] === '"') {
          field += '"';
          k++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[k + 1] === '\n') k++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const header = rows[0] ?? [];
  const out: Array<Record<string, string>> = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length === 1 && cells[0] === '') continue;
    const obj: Record<string, string> = {};
    header.forEach((h, k) => {
      obj[h] = cells[k] ?? '';
    });
    out.push(obj);
  }
  return out;
}
```

`packages/data/pipeline/write.ts`:
```ts
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
```

- [ ] **Step 3: Прогнать и закоммитить**

Run: `pnpm test packages/data && pnpm typecheck` → PASS (5 тестов).

```bash
git add packages/data
git commit -m "feat(data): pipeline scaffold — sources, cached fetch, csv parser, writers"
```

---

### Task 13: Natural Earth → страны, геометрия, граф границ

**Files:**
- Create: `packages/data/pipeline/naturalearth.ts`, `packages/data/pipeline/countries.ts`, `packages/data/pipeline/build.ts`, `packages/content/config/geo.json`
- Modify: `packages/schema/src/content.ts` (добавить `GeoConfig`), `packages/content/src/index.ts` (поле `geo`), `packages/data/package.json` (`@types/geojson`)
- Test: `packages/data/test/naturalearth.test.ts`, `packages/data/test/countries.test.ts`

**Interfaces:**
- Consumes: `fetchCached`, `sha1`, `SOURCES`, `writeJson`, `OUT_DIR`, `loadContent`, схемы `Country`, `HistoricalCountry`, `Transition`, `Edge`, `Graph`, `Countries`.
- Produces:
  - `GeoConfig = { principalTypes: string[]; include: string[]; exclude: string[]; idOverrides: Record<string, string> }` в `@ripple/schema`; `Content.geo: GeoConfig`.
  - `interface NeProperties { ADM0_A3; SOV_A3; ISO_A3_EH; TYPE; NAME_EN?; NAME?; NAME_RU?; REGION_UN; SUBREGION }`, `interface NeFeature { type: 'Feature'; properties: NeProperties; geometry: Geometry }`, `interface ModernCountry { id; name: LocalizedText; region; subregion; geometry: Geometry }`, `interface ModernTerritory { id; name: LocalizedText; parent: string; geometry: Geometry }`.
  - `resolveId(p, geo): string`, `isPrincipal(p, geo): boolean`, `selectCountries(features, geo): ModernCountry[]` (отсортировано по id), `selectTerritories(features, geo, countries): { territories: ModernTerritory[]; dropped: string[] }` (территории — всё, что не страна и не в `exclude`, у чего `SOV_A3` совпадает с `SOV_A3` какой-то страны: Гренландия → DNK, Пуэрто-Рико → USA; без такого суверена фича отбрасывается и попадает в `dropped`), `buildTopology(countries, territories): { topology: Topology; borders: Array<[string, string]> }` (объекты `countries` и `territories`; границы считаются только между странами).
  - `assembleCountries(modern, historical, transitions): Country[]` (отсортировано по id; `from/to/successors/predecessors` выводятся из переходов), `deriveEdges(borders, historical, countries): Edge[]`, `missingReferences(countries, content): string[]` (события, переходы, члены исторических стран, ключи и значения `analogs`).
  - `interface BuildContext { cacheDir: string; outDir: string; log: (msg: string) => void; fetchImpl?: FetchImpl }`, `buildGeo(ctx): Promise<GeoResult>` где `GeoResult = { modern: ModernCountry[]; territories: ModernTerritory[]; countries: Country[]; topology: Topology; edges: Edge[]; inputs: Record<string, string> }` (`inputs` — sha1 скачанных файлов, идут в `dataVersion`); `writeGeo` пишет `countries.json`, `territories.json` (`{ id, name, parent }`, без индикаторов — движок их не читает), `geometry.topo.json`, `graph.json`.
  - Правило отбора фичи Natural Earth: не в `exclude`; и (в `include`, или `TYPE === 'Sovereign country'`, или `TYPE === 'Country'` и первые две буквы `SOV_A3` совпадают с `ADM0_A3` — так отсекаются Гренландия/Аруба/о. Мэн при сохранении Дании/Нидерландов/Британии). Id: `ISO_A3_EH`, если это три заглавные буквы, иначе `ADM0_A3`; затем `idOverrides` по `ADM0_A3`.

- [ ] **Step 1: Схема и конфиг**

Добавить в конец `packages/schema/src/content.ts`:
```ts
export const GeoConfig = z.object({
  principalTypes: z.array(z.string()).min(1), // Natural Earth TYPE values that mean "a state of its own"
  include: z.array(z.string()).default([]), // ADM0_A3 codes kept regardless of TYPE
  exclude: z.array(z.string()).default([]), // ADM0_A3 codes dropped regardless of TYPE
  idOverrides: z.record(z.string(), z.string()).default({}), // ADM0_A3 → our id
});
export type GeoConfig = z.infer<typeof GeoConfig>;
```

`packages/content/config/geo.json`:
```json
{
  "principalTypes": ["Sovereign country", "Country"],
  "include": ["KOS", "PSX"],
  "exclude": ["ATA", "CYN", "SOL", "KAS", "SAH"],
  "idOverrides": { "KOS": "XKX", "SDS": "SSD", "PSX": "PSE" }
}
```

`packages/content/src/index.ts` (полностью):
```ts
import {
  Analogs, ChannelMap, EngineConfig, EventTypeDef, GeoConfig, HistoricalCountry, IndicatorConfigs, Priors, ScheduledEvent, Transition,
  type IndicatorConfig,
} from '@ripple/schema';
import { z } from 'zod';
import eventTypesJson from '../catalog/event-types.json';
import channelsJson from '../catalog/channels.json';
import indicatorsJson from '../config/indicators.json';
import engineJson from '../config/engine.json';
import geoJson from '../config/geo.json';
import priorsJson from '../priors/indicators.json';
import historicalJson from '../historical-countries.json';
import analogsJson from '../analogs.json';
import transitionsJson from '../transitions.json';
import tierAJson from '../events/tier-a.json';

export interface Content {
  eventTypes: EventTypeDef[];
  channels: ChannelMap;
  indicatorConfig: Record<string, IndicatorConfig>;
  engine: EngineConfig;
  geo: GeoConfig;
  priors: Priors;
  historicalCountries: HistoricalCountry[];
  analogs: Analogs;
  transitions: Transition[];
  events: ScheduledEvent[];
}

let cached: Content | undefined;

export function loadContent(): Content {
  if (cached) return cached;
  cached = {
    eventTypes: z.array(EventTypeDef).parse(eventTypesJson),
    channels: ChannelMap.parse(channelsJson),
    indicatorConfig: IndicatorConfigs.parse(indicatorsJson),
    engine: EngineConfig.parse(engineJson),
    geo: GeoConfig.parse(geoJson),
    priors: Priors.parse(priorsJson),
    historicalCountries: z.array(HistoricalCountry).parse(historicalJson),
    analogs: Analogs.parse(analogsJson),
    transitions: z.array(Transition).parse(transitionsJson),
    events: z.array(ScheduledEvent).parse(tierAJson),
  };
  return cached;
}
```

Run: `pnpm add -D @types/geojson@^7946.0.16 --filter @ripple/data && pnpm test packages/content` → PASS.

- [ ] **Step 2: Тесты**

`packages/data/test/naturalearth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadContent } from '@ripple/content';
import type { Geometry, Polygon } from 'geojson';
import { buildTopology, isPrincipal, resolveId, selectCountries, selectTerritories, type NeFeature, type NeProperties } from '../pipeline/naturalearth.js';

const geo = loadContent().geo;

function square(x: number, y: number): Polygon {
  return { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] };
}
function feat(p: Partial<NeProperties> & { ADM0_A3: string }, geometry: Geometry = square(0, 0)): NeFeature {
  return {
    type: 'Feature',
    geometry,
    properties: { SOV_A3: p.ADM0_A3, ISO_A3_EH: p.ADM0_A3, TYPE: 'Sovereign country', NAME_EN: p.ADM0_A3, NAME_RU: `${p.ADM0_A3}-ru`, REGION_UN: 'Europe', SUBREGION: 'Western Europe', ...p },
  };
}

describe('natural earth selection', () => {
  it('keeps sovereign states and principal parts of kingdoms, drops dependencies and excluded codes', () => {
    const features = [
      feat({ ADM0_A3: 'DEU' }),
      feat({ ADM0_A3: 'DNK', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'GRL', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'PRI', SOV_A3: 'US1', TYPE: 'Dependency' }),
      feat({ ADM0_A3: 'ATA', TYPE: 'Indeterminate' }),
      feat({ ADM0_A3: 'CYN', TYPE: 'Sovereign country' }),
      feat({ ADM0_A3: 'KOS', ISO_A3_EH: '-99', TYPE: 'Disputed' }),
      feat({ ADM0_A3: 'NOR', SOV_A3: 'NOR', ISO_A3_EH: '-99', TYPE: 'Country' }),
      feat({ ADM0_A3: 'SDS' }),
    ];
    expect(features.map((f) => isPrincipal(f.properties, geo))).toEqual([true, true, false, false, false, false, true, true, true]);
    expect(selectCountries(features, geo).map((c) => c.id)).toEqual(['DEU', 'DNK', 'NOR', 'SSD', 'XKX']);
    expect(resolveId(features[6]!.properties, geo)).toBe('XKX');
  });
  it('uses NAME_RU and NAME_EN, falling back to NAME', () => {
    const [c] = selectCountries([feat({ ADM0_A3: 'FRA', NAME_RU: 'Франция', NAME_EN: 'France' })], geo);
    expect(c!.name).toEqual({ ru: 'Франция', en: 'France' });
    const [d] = selectCountries([feat({ ADM0_A3: 'ITA', NAME_RU: undefined, NAME_EN: undefined, NAME: 'Italy' })], geo);
    expect(d!.name).toEqual({ ru: 'Italy', en: 'Italy' });
  });
  it('throws on duplicate ids', () => {
    expect(() => selectCountries([feat({ ADM0_A3: 'DEU' }), feat({ ADM0_A3: 'DEU' })], geo)).toThrow(/duplicate/);
  });
});

describe('territories', () => {
  it('attaches dependencies and non-principal parts to the country that shares their sovereign, drops orphans', () => {
    const features = [
      feat({ ADM0_A3: 'DNK', SOV_A3: 'DN1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'GRL', SOV_A3: 'DN1', TYPE: 'Country', NAME_EN: 'Greenland', NAME_RU: 'Гренландия' }),
      feat({ ADM0_A3: 'USA', SOV_A3: 'US1', TYPE: 'Country' }),
      feat({ ADM0_A3: 'PRI', SOV_A3: 'US1', TYPE: 'Dependency' }),
      feat({ ADM0_A3: 'ATA', TYPE: 'Indeterminate' }),
      feat({ ADM0_A3: 'XXX', SOV_A3: 'ZZZ', TYPE: 'Dependency' }),
    ];
    const countries = selectCountries(features, geo);
    const { territories, dropped } = selectTerritories(features, geo, countries);
    expect(territories.map((t) => [t.id, t.parent])).toEqual([['GRL', 'DNK'], ['PRI', 'USA']]);
    expect(territories[0]!.name).toEqual({ ru: 'Гренландия', en: 'Greenland' });
    expect(dropped).toEqual(['XXX']); // excluded ATA is silently skipped, an orphan is reported
  });
});

describe('topology', () => {
  it('finds shared borders between countries only and keeps territories as a separate object', () => {
    const features = [
      feat({ ADM0_A3: 'AAA' }, square(0, 0)), feat({ ADM0_A3: 'BBB' }, square(1, 0)), feat({ ADM0_A3: 'CCC' }, square(0, 1)), feat({ ADM0_A3: 'DDD' }, square(5, 5)),
      feat({ ADM0_A3: 'TTT', SOV_A3: 'AAA', TYPE: 'Dependency' }, square(2, 0)), // touches BBB, but territories do not border
    ];
    const countries = selectCountries(features, geo);
    const { territories } = selectTerritories(features, geo, countries);
    const { topology, borders } = buildTopology(countries, territories);
    expect(borders.map((b) => b.join('-')).sort()).toEqual(['AAA-BBB', 'AAA-CCC']);
    expect(topology.type).toBe('Topology');
    expect((topology.objects.countries as { geometries: unknown[] }).geometries.length).toBe(4);
    expect((topology.objects.territories as { geometries: Array<{ id: string }> }).geometries.map((g) => g.id)).toEqual(['TTT']);
  });
});
```

`packages/data/test/countries.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, type HistoricalCountry, type Transition } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { assembleCountries, deriveEdges, missingReferences } from '../pipeline/countries.js';

const name = (id: string) => ({ ru: id, en: id });
const modern = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((id) => ({ id, name: name(id), region: 'R', subregion: 'S' }));
const T_SPLIT = absMonth(1991, 12), T_MERGE = absMonth(1990, 10), T_SECEDE = absMonth(1993, 5);
const historical: HistoricalCountry[] = [
  { id: 'UUU', name: name('UUU'), region: 'R', subregion: 'S', members: ['AAA', 'BBB'], from: null, to: T_SPLIT - 1 },
  { id: 'GGG', name: name('GGG'), region: 'R', subregion: 'S', members: ['CCC'], from: null, to: T_MERGE - 1 },
];
const transitions: Transition[] = [
  { id: 'u', abs: T_SPLIT, kind: 'split', from: ['UUU'], to: ['AAA', 'BBB'], eventId: 'e-u' },
  { id: 'g', abs: T_MERGE, kind: 'merge', from: ['CCC', 'GGG'], to: ['CCC'], eventId: 'e-g' },
  { id: 'e', abs: T_SECEDE, kind: 'secede', from: ['DDD'], to: ['EEE'], eventId: 'e-e' },
];

describe('assembleCountries', () => {
  const countries = assembleCountries(modern, historical, transitions);
  const by = (id: string) => countries.find((c) => c.id === id)!;
  it('is sorted by id and marks historical historical', () => {
    expect(countries.map((c) => c.id)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'GGG', 'UUU']);
    expect(by('UUU').historical).toBe(true);
    expect(by('AAA').historical).toBe(false);
  });
  it('derives lifetimes and links from transitions', () => {
    expect(by('UUU')).toMatchObject({ from: null, to: T_SPLIT - 1, successors: ['AAA', 'BBB'] });
    expect(by('AAA')).toMatchObject({ from: T_SPLIT, to: null, predecessors: ['UUU'] });
    expect(by('GGG')).toMatchObject({ to: T_MERGE - 1, successors: ['CCC'] });
    expect(by('CCC')).toMatchObject({ from: null, to: null, predecessors: ['GGG'], successors: [] });
    expect(by('DDD')).toMatchObject({ from: null, to: null, successors: ['EEE'] });
    expect(by('EEE')).toMatchObject({ from: T_SECEDE, predecessors: ['DDD'] });
  });
  it('rejects unknown ids and inconsistent lifetimes', () => {
    expect(() => assembleCountries(modern, historical, [{ id: 'x', abs: 1, kind: 'secede', from: ['DDD'], to: ['ZZZ'] }])).toThrow(/unknown country ZZZ/);
    const bad: HistoricalCountry[] = [{ ...historical[0]!, to: T_SPLIT + 5 }];
    expect(() => assembleCountries(modern, bad, transitions)).toThrow(/UUU.*to/);
  });
});

describe('deriveEdges', () => {
  it('lifts member borders to historical, links coexisting members, drops pairs that never coexist', () => {
    const countries = assembleCountries(modern, historical, transitions);
    const borders: Array<[string, string]> = [['AAA', 'BBB'], ['BBB', 'CCC'], ['CCC', 'DDD']];
    const edges = deriveEdges(borders, historical, countries).map((e) => `${e.a}-${e.b}`).sort();
    // UUU: outer border BBB-CCC → UUU-CCC; historical countries UUU and GGG touch via BBB-CCC → GGG-UUU; members AAA/BBB appear only after UUU ends → no edge.
    // GGG: CCC-DDD → GGG-DDD; member CCC coexists → CCC-GGG; BBB-CCC would give BBB-GGG, but BBB starts after GGG ends → dropped.
    expect(edges).toEqual(['AAA-BBB', 'BBB-CCC', 'CCC-DDD', 'CCC-GGG', 'CCC-UUU', 'DDD-GGG', 'GGG-UUU']);
  });
});

describe('missingReferences', () => {
  it('lists ids used by content that the dataset lacks, analogs included', () => {
    const content = loadContent();
    const countries = assembleCountries(modern, historical, transitions);
    const missing = missingReferences(countries, content);
    expect(missing).toContain('USA');
    expect(missing).toContain('RUS');
    expect(missing).toContain('CHN'); // analog of SUN
    expect(missing).not.toContain('AAA');
  });
});
```

Run: `pnpm test packages/data` → FAIL.

- [ ] **Step 3: Реализация**

`packages/data/pipeline/naturalearth.ts`:
```ts
import type { GeoConfig, LocalizedText } from '@ripple/schema';
import type { FeatureCollection, Geometry } from 'geojson';
import { neighbors } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';

export interface NeProperties {
  ADM0_A3: string;
  SOV_A3: string;
  ISO_A3_EH: string;
  TYPE: string;
  NAME_EN?: string;
  NAME?: string;
  NAME_RU?: string;
  REGION_UN: string;
  SUBREGION: string;
}

export interface NeFeature {
  type: 'Feature';
  properties: NeProperties;
  geometry: Geometry;
}

export interface ModernCountry {
  id: string;
  name: LocalizedText;
  region: string;
  subregion: string;
  geometry: Geometry;
}

export interface ModernTerritory {
  id: string;
  name: LocalizedText;
  parent: string;
  geometry: Geometry;
}

const ISO3 = /^[A-Z]{3}$/;
const QUANTIZATION = 1e4;
const KEEP_POINTS_QUANTILE = 0.5;

export function resolveId(p: NeProperties, geo: GeoConfig): string {
  const base = ISO3.test(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3;
  return geo.idOverrides[p.ADM0_A3] ?? base;
}

export function isPrincipal(p: NeProperties, geo: GeoConfig): boolean {
  if (geo.exclude.includes(p.ADM0_A3)) return false;
  if (geo.include.includes(p.ADM0_A3)) return true;
  if (!geo.principalTypes.includes(p.TYPE)) return false;
  if (p.TYPE === 'Country') return p.SOV_A3.slice(0, 2) === p.ADM0_A3.slice(0, 2);
  return true;
}

export function selectCountries(features: NeFeature[], geo: GeoConfig): ModernCountry[] {
  const out = new Map<string, ModernCountry>();
  for (const f of features) {
    const p = f.properties;
    if (!isPrincipal(p, geo)) continue;
    const id = resolveId(p, geo);
    if (!ISO3.test(id)) throw new Error(`no ISO3 id for feature ${p.ADM0_A3} (${p.NAME_EN ?? p.NAME ?? '?'})`);
    if (out.has(id)) throw new Error(`duplicate id ${id} (feature ${p.ADM0_A3})`);
    const en = p.NAME_EN || p.NAME || id;
    out.set(id, { id, name: { ru: p.NAME_RU || en, en }, region: p.REGION_UN, subregion: p.SUBREGION, geometry: f.geometry });
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Everything that is not a country of its own but belongs to one: drawn in the parent's colour, never simulated. */
export function selectTerritories(features: NeFeature[], geo: GeoConfig, countries: ModernCountry[]): { territories: ModernTerritory[]; dropped: string[] } {
  const ids = new Set(countries.map((c) => c.id));
  const bySovereign = new Map<string, string>();
  for (const f of features) if (isPrincipal(f.properties, geo)) bySovereign.set(f.properties.SOV_A3, resolveId(f.properties, geo));
  const out = new Map<string, ModernTerritory>();
  const dropped: string[] = [];
  for (const f of features) {
    const p = f.properties;
    if (isPrincipal(p, geo) || geo.exclude.includes(p.ADM0_A3)) continue;
    const parent = bySovereign.get(p.SOV_A3);
    if (parent === undefined || !ids.has(parent)) {
      dropped.push(p.ADM0_A3);
      continue;
    }
    const resolved = resolveId(p, geo);
    const id = ISO3.test(resolved) ? resolved : p.ADM0_A3;
    if (ids.has(id) || out.has(id)) throw new Error(`territory id ${id} clashes (feature ${p.ADM0_A3})`);
    const en = p.NAME_EN || p.NAME || id;
    out.set(id, { id, name: { ru: p.NAME_RU || en, en }, parent, geometry: f.geometry });
  }
  return { territories: [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), dropped: dropped.sort() };
}

function collectionOf(items: Array<{ id: string; geometry: Geometry }>): FeatureCollection {
  return { type: 'FeatureCollection', features: items.map((c) => ({ type: 'Feature', id: c.id, properties: { id: c.id }, geometry: c.geometry })) };
}

export function buildTopology(countries: ModernCountry[], territories: ModernTerritory[]): { topology: Topology; borders: Array<[string, string]> } {
  const topo = topology({ countries: collectionOf(countries), territories: collectionOf(territories) }, QUANTIZATION);
  const geometries = (topo.objects.countries as GeometryCollection).geometries;
  const borders: Array<[string, string]> = [];
  neighbors(geometries).forEach((list, k) => {
    for (const j of list) if (j > k) borders.push([countries[k]!.id, countries[j]!.id]);
  });
  const weighted = presimplify(topo);
  const simplified = simplify(weighted, quantile(weighted, KEEP_POINTS_QUANTILE));
  return { topology: simplified, borders };
}
```

`packages/data/pipeline/countries.ts`:
```ts
import type { Country, Edge, HistoricalCountry, LocalizedText, Transition } from '@ripple/schema';
import type { Content } from '@ripple/content';

export interface ModernSummary {
  id: string;
  name: LocalizedText;
  region: string;
  subregion: string;
}

export function assembleCountries(modern: ModernSummary[], historical: HistoricalCountry[], transitions: Transition[]): Country[] {
  const map = new Map<string, Country>();
  for (const m of modern) {
    map.set(m.id, { id: m.id, name: m.name, region: m.region, subregion: m.subregion, from: null, to: null, successors: [], predecessors: [], historical: false });
  }
  for (const e of historical) {
    if (map.has(e.id)) throw new Error(`historical country ${e.id} clashes with a modern country id`);
    map.set(e.id, { id: e.id, name: e.name, region: e.region, subregion: e.subregion, from: e.from, to: e.to, successors: [], predecessors: [], historical: true });
  }
  const declared = new Map(historical.map((e) => [e.id, e]));
  for (const tr of transitions) {
    for (const id of [...tr.from, ...tr.to]) if (!map.has(id)) throw new Error(`transition ${tr.id} references unknown country ${id}`);
    const survivors = tr.kind === 'merge' ? tr.to : tr.kind === 'secede' ? tr.from : [];
    for (const id of tr.from) {
      const c = map.get(id)!;
      for (const s of tr.to) if (s !== id && !c.successors.includes(s)) c.successors.push(s);
      if (!survivors.includes(id)) {
        const d = declared.get(id);
        if (d && d.to !== tr.abs - 1) throw new Error(`historical country ${id}: declared to=${d.to} but transition ${tr.id} ends it at ${tr.abs - 1}`);
        c.to = tr.abs - 1;
      }
    }
    for (const id of tr.to) {
      const c = map.get(id)!;
      for (const p of tr.from) if (p !== id && !c.predecessors.includes(p)) c.predecessors.push(p);
      if (!survivors.includes(id)) {
        const d = declared.get(id);
        if (d && d.from !== null && d.from !== tr.abs) throw new Error(`historical country ${id}: declared from=${d.from} but transition ${tr.id} starts it at ${tr.abs}`);
        c.from = tr.abs;
      }
    }
  }
  return [...map.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Border edges for modern countries plus historical countries: a historical country borders whatever its members border outside it,
 *  other historical countries whose members touch, and its own members (West Germany next to East Germany).
 *  An edge is kept only if both ends exist at the same time for at least one month. */
export function deriveEdges(borders: Array<[string, string]>, historical: HistoricalCountry[], countries: Country[]): Edge[] {
  const life = new Map(countries.map((c) => [c.id, { from: c.from ?? -Infinity, to: c.to ?? Infinity }]));
  const coexist = (x: string, y: string): boolean => {
    const p = life.get(x), q = life.get(y);
    if (!p || !q) throw new Error(`deriveEdges: unknown country ${p ? y : x}`);
    return Math.max(p.from, q.from) <= Math.min(p.to, q.to);
  };
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const add = (x: string, y: string): void => {
    if (x === y || !coexist(x, y)) return;
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${a}|${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b, type: 'border', weight: 1 });
  };
  for (const [a, b] of borders) add(a, b);
  const memberSets = historical.map((e) => ({ e, members: new Set(e.members) }));
  for (const { e, members } of memberSets) {
    for (const [a, b] of borders) {
      if (members.has(a) && !members.has(b)) add(e.id, b);
      if (members.has(b) && !members.has(a)) add(e.id, a);
    }
    for (const other of memberSets) {
      if (other.e.id === e.id) continue;
      if (borders.some(([a, b]) => (members.has(a) && other.members.has(b)) || (members.has(b) && other.members.has(a)))) add(e.id, other.e.id);
    }
    for (const m of e.members) add(e.id, m);
  }
  return edges.sort((p, q) => (p.a === q.a ? (p.b < q.b ? -1 : 1) : p.a < q.a ? -1 : 1));
}

/** Country ids that content refers to but the dataset lacks. */
export function missingReferences(countries: Country[], content: Content): string[] {
  const have = new Set(countries.map((c) => c.id));
  const refs = new Set<string>();
  for (const e of content.events) {
    for (const c of e.countries) refs.add(c);
    for (const h of e.hooks) if (Array.isArray(h.target)) for (const c of h.target) refs.add(c);
    for (const p of e.preconditions) if (p.kind === 'indicator' && p.country) refs.add(p.country);
  }
  for (const t of content.transitions) for (const c of [...t.from, ...t.to]) refs.add(c);
  for (const h of content.historicalCountries) for (const c of h.members) refs.add(c);
  for (const [id, rule] of Object.entries(content.analogs)) {
    refs.add(id);
    refs.add(rule.analog);
  }
  return [...refs].filter((id) => !have.has(id)).sort();
}
```

`packages/data/pipeline/build.ts` (первая версия; задача 15 дополняет её индикаторами):
```ts
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, type Content } from '@ripple/content';
import { Countries, Graph, Territories, type Country, type Edge } from '@ripple/schema';
import type { Topology } from 'topojson-specification';
import { assembleCountries, deriveEdges, missingReferences } from './countries.js';
import { DEFAULT_CACHE_DIR, fetchCached, sha1, type FetchImpl } from './fetch.js';
import { buildTopology, selectCountries, selectTerritories, type ModernCountry, type ModernTerritory, type NeFeature } from './naturalearth.js';
import { SOURCES } from './sources.js';
import { OUT_DIR, writeJson } from './write.js';

export interface BuildContext {
  cacheDir: string;
  outDir: string;
  log: (msg: string) => void;
  fetchImpl?: FetchImpl;
}

export interface GeoResult {
  modern: ModernCountry[];
  territories: ModernTerritory[];
  countries: Country[];
  topology: Topology;
  edges: Edge[];
  inputs: Record<string, string>;
}

export async function buildGeo(ctx: BuildContext, content: Content = loadContent()): Promise<GeoResult> {
  const raw = await fetchCached(SOURCES.naturalEarth.url, { cacheDir: ctx.cacheDir, log: ctx.log, fetchImpl: ctx.fetchImpl });
  const collection = JSON.parse(raw.toString('utf8')) as { features: NeFeature[] };
  const modern = selectCountries(collection.features, content.geo);
  const { territories, dropped } = selectTerritories(collection.features, content.geo, modern);
  if (dropped.length > 0) ctx.log(`geo: dropped features without a principal sovereign: ${dropped.join(' ')}`);
  const { topology, borders } = buildTopology(modern, territories);
  const countries = assembleCountries(modern, content.historicalCountries, content.transitions);
  const missing = missingReferences(countries, content);
  if (missing.length > 0) {
    throw new Error(`content references unknown countries: ${missing.join(', ')} — find their ADM0_A3 in the Natural Earth file and add to packages/content/config/geo.json include/idOverrides`);
  }
  const edges = deriveEdges(borders, content.historicalCountries, countries);
  ctx.log(`geo: ${modern.length} modern + ${content.historicalCountries.length} historical countries + ${territories.length} territories, ${edges.length} border edges`);
  return { modern, territories, countries, topology, edges, inputs: { [SOURCES.naturalEarth.id]: sha1(raw) } };
}

export function dataVersionOf(inputs: Record<string, string>, content: Content): string {
  return createHash('sha1').update(JSON.stringify({ inputs, content })).digest('hex').slice(0, 12);
}

export function writeGeo(ctx: BuildContext, geo: GeoResult, dataVersion: string): void {
  writeJson(join(ctx.outDir, 'countries.json'), Countries.parse(geo.countries));
  writeJson(join(ctx.outDir, 'territories.json'), Territories.parse(geo.territories.map(({ id, name, parent }) => ({ id, name, parent }))));
  writeJson(join(ctx.outDir, 'geometry.topo.json'), geo.topology);
  writeJson(join(ctx.outDir, 'graph.json'), Graph.parse({ dataVersion, edges: geo.edges }));
}

export async function build(ctx: BuildContext): Promise<void> {
  const content = loadContent();
  const geo = await buildGeo(ctx, content);
  const dataVersion = dataVersionOf(geo.inputs, content);
  writeGeo(ctx, geo, dataVersion);
  ctx.log(`dataVersion ${dataVersion} → ${ctx.outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build({ cacheDir: DEFAULT_CACHE_DIR, outDir: OUT_DIR, log: (m) => console.error(m) }).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
```

Run: `pnpm test packages/data && pnpm typecheck` → PASS.

- [ ] **Step 4: Собрать геометрию по настоящим данным (сеть)**

Run: `curl -sIL "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson" | grep -i '^HTTP'`
Expected: последняя строка `HTTP/2 200`. Если 404 — открыть https://github.com/nvkelso/natural-earth-vector/tree/master/geojson, взять актуальное имя файла `ne_50m_admin_0_countries*.geojson` и поправить `SOURCES.naturalEarth.url`.

Run: `pnpm data:build`
Expected: строки `GET …geojson`, возможно `geo: dropped features without a principal sovereign: …` (спорные земли без суверена из набора — это нормально), затем `geo: N modern + 6 historical countries + K territories, M border edges` где N в пределах 190–200, K в пределах 30–80, M ≥ 300, затем `dataVersion …`. Если бросается `content references unknown countries: …` — найти фичу в файле (`grep -o '"ADM0_A3": *"[A-Z]*"' packages/data/cache/<sha1> | sort -u` плюс `NAME_EN`) и добавить её `ADM0_A3` в `include` / `idOverrides` в `geo.json`; повторить.

Run: `node -e "const c=require('./packages/data/out/countries.json'); console.log(c.length, c.filter(x=>x.historical).map(x=>x.id).join(','), c.find(x=>x.id==='RUS'))"`
Expected: число стран, список `CSK,DDR,SCG,SUN,YMD,YUG`, у `RUS` поле `from: 23903` и `predecessors: ['SUN']`.

Run: `node -e "const t=require('./packages/data/out/territories.json'); console.log(t.length, t.find(x=>x.id==='GRL'), t.find(x=>x.id==='PRI'))"`
Expected: число территорий; `GRL` с `parent: 'DNK'`, `PRI` с `parent: 'USA'`.

Run: `ls -la packages/data/out && du -sh packages/data/out`
Expected: `countries.json`, `territories.json`, `geometry.topo.json` (≤ 2.5 МБ), `graph.json`; всего ≤ 3 МБ.

- [ ] **Step 5: Закоммитить**

```bash
printf '*.bin binary\n*.topo.json -diff\n' > .gitattributes
git add .gitattributes packages/schema packages/content packages/data pnpm-lock.yaml
git commit -m "feat(data): countries, topology and border graph from Natural Earth"
```

---

### Task 14: Парсеры источников — WDI, OWID, UN WPP

**Files:**
- Create: `packages/data/pipeline/series.ts`, `packages/data/pipeline/wdi.ts`, `packages/data/pipeline/owid.ts`, `packages/data/pipeline/wpp.ts`
- Test: `packages/data/test/wdi.test.ts`, `packages/data/test/owid.test.ts`, `packages/data/test/wpp.test.ts`

**Interfaces:**
- Consumes: `fetchCached`, `sha1`, `FetchOptions`, `wdiUrl`, `owidUrl`, `csvObjects`.
- Produces:
  - `type Yearly = Map<number, number>` (год → значение в исходных единицах), `type Series = Map<string, Yearly>` (id страны → годовой ряд), `setPoint(series, id, year, value)`.
  - `parseWdiPage(json: unknown): { pages: number; rows: WdiRow[] }`, `wdiToSeries(rows, into?): Series`, `fetchWdi(code, opts, inputs?): Promise<Series>` (листает страницы, пишет sha1 страниц в `inputs['wdi:<code>:p<n>']`).
  - `OWID_ENTITY_MAP: Record<string, string>` (имена локаций OWID без ISO-кода → наши id), `resolveOwidId(entity, code): string | null`, `parseOwidCsv(text): Series` — ровно один столбец значений помимо `Entity, Code, Year`, иначе ошибка с перечислением столбцов.
  - `parseWppCsv(text): Series` (варианты `Estimates` и `Medium`, `Estimates` приоритетнее; `PopTotal` в тысячах → люди), `gunzipText(buf): string`.

- [ ] **Step 1: Тесты**

`packages/data/test/wdi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fetchWdi, parseWdiPage, wdiToSeries } from '../pipeline/wdi.js';
import { wdiUrl } from '../pipeline/sources.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page = (pages: number, rows: Array<[string, string, number | null]>) => [
  { page: 1, pages, per_page: 20000, total: rows.length },
  rows.map(([iso, date, value]) => ({ indicator: { id: 'X', value: 'x' }, country: { id: iso.slice(0, 2), value: iso }, countryiso3code: iso, date, value, unit: '', obs_status: '', decimal: 0 })),
];

describe('wdi', () => {
  it('parses a page and skips nulls, aggregates without iso3 and non-year dates', () => {
    const { pages, rows } = parseWdiPage(page(1, [['FRA', '1990', 2.5], ['FRA', '1991', null], ['', '1990', 1], ['DEU', '2000Q1', 3]]));
    expect(pages).toBe(1);
    const s = wdiToSeries(rows);
    expect([...s.keys()]).toEqual(['FRA']);
    expect(s.get('FRA')!.get(1990)).toBe(2.5);
  });
  it('rejects API error payloads', () => {
    expect(() => parseWdiPage([{ message: [{ id: '120', value: 'Invalid indicator' }] }])).toThrow(/WDI/);
  });
  it('follows pagination and records input hashes', async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'ripple-wdi-'));
    const bodies: Record<string, unknown> = {
      [wdiUrl('X', 1)]: page(2, [['FRA', '1990', 1]]),
      [wdiUrl('X', 2)]: [{ page: 2, pages: 2 }, [{ countryiso3code: 'DEU', date: '1990', value: 2 }]],
    };
    const inputs: Record<string, string> = {};
    const s = await fetchWdi('X', {
      cacheDir,
      fetchImpl: async (url) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(bodies[url])).buffer as ArrayBuffer }),
    }, inputs);
    expect(s.get('FRA')!.get(1990)).toBe(1);
    expect(s.get('DEU')!.get(1990)).toBe(2);
    expect(Object.keys(inputs).sort()).toEqual(['wdi:X:p1', 'wdi:X:p2']);
  });
});
```

`packages/data/test/owid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseOwidCsv, resolveOwidId } from '../pipeline/owid.js';

describe('owid', () => {
  it('reads Entity/Code/Year plus one value column, maps named locations without a code, skips regions and blanks', () => {
    const text = [
      'Entity,Code,Year,libdem',
      'France,FRA,1990,0.75',
      'France,FRA,1991,',
      'USSR,OWID_USS,1985,0.1',
      'Kosovo,OWID_KOS,2010,0.4',
      'World,OWID_WRL,1990,0.5',
      'Europe,,1990,0.6',
    ].join('\n');
    const s = parseOwidCsv(text);
    expect([...s.keys()].sort()).toEqual(['FRA', 'SUN', 'XKX']);
    expect(s.get('FRA')!.get(1990)).toBe(0.75);
    expect(s.get('FRA')!.has(1991)).toBe(false);
    expect(s.get('SUN')!.get(1985)).toBe(0.1);
  });
  it('fails loudly when the column layout is unexpected', () => {
    expect(() => parseOwidCsv('Entity,Code,Year,a,b\nX,XXX,1,2,3')).toThrow(/expected one value column.*a, b/);
  });
  it('resolves ids', () => {
    expect(resolveOwidId('Yugoslavia', '')).toBe('YUG');
    expect(resolveOwidId('Germany', 'DEU')).toBe('DEU');
    expect(resolveOwidId('Africa', '')).toBeNull();
  });
});
```

`packages/data/test/wpp.test.ts`:
```ts
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gunzipText, parseWppCsv } from '../pipeline/wpp.js';

describe('wpp', () => {
  const header = 'SortOrder,LocID,Notes,ISO3_code,ISO2_code,SDMX_code,LocTypeID,LocTypeName,ParentID,Location,VarID,Variant,Time,PopMale,PopFemale,PopTotal,PopDensity';
  const row = (iso: string, variant: string, year: number, pop: number) => `1,1,,${iso},,,4,Country/Area,1,${iso},2,${variant},${year},1,1,${pop},1`;
  it('keeps Estimates and Medium, prefers Estimates, converts thousands to people, skips regions', () => {
    const text = [header, row('FRA', 'Estimates', 1990, 56000.5), row('FRA', 'Medium', 1990, 1), row('FRA', 'Medium', 2050, 60000), row('FRA', 'High', 2050, 70000), row('', 'Estimates', 1990, 5000000)].join('\n');
    const s = parseWppCsv(text);
    expect([...s.keys()]).toEqual(['FRA']);
    expect(s.get('FRA')!.get(1990)).toBe(56000500);
    expect(s.get('FRA')!.get(2050)).toBe(60000000);
  });
  it('gunzips and complains about missing columns', () => {
    expect(gunzipText(gzipSync(Buffer.from('a,b\n1,2')))).toBe('a,b\n1,2');
    expect(() => parseWppCsv('a,b\n1,2')).toThrow(/missing column ISO3_code/);
  });
});
```

Run: `pnpm test packages/data` → FAIL.

- [ ] **Step 2: Реализация**

`packages/data/pipeline/series.ts`:
```ts
export type Yearly = Map<number, number>;
export type Series = Map<string, Yearly>;

export function setPoint(series: Series, id: string, year: number, value: number): void {
  let y = series.get(id);
  if (!y) {
    y = new Map();
    series.set(id, y);
  }
  y.set(year, value);
}
```

`packages/data/pipeline/wdi.ts`:
```ts
import { fetchCached, sha1, type FetchOptions } from './fetch.js';
import { setPoint, type Series } from './series.js';
import { wdiUrl } from './sources.js';

export interface WdiRow {
  countryiso3code: string;
  date: string;
  value: number | null;
}

const YEAR = /^\d{4}$/;

export function parseWdiPage(json: unknown): { pages: number; rows: WdiRow[] } {
  if (!Array.isArray(json) || json.length === 0 || typeof json[0] !== 'object' || json[0] === null) {
    throw new Error(`WDI: unexpected payload ${JSON.stringify(json).slice(0, 200)}`);
  }
  const header = json[0] as { pages?: number; message?: unknown };
  if (header.message) throw new Error(`WDI: API error ${JSON.stringify(header.message)}`);
  return { pages: header.pages ?? 1, rows: (json[1] ?? []) as WdiRow[] };
}

export function wdiToSeries(rows: WdiRow[], into: Series = new Map()): Series {
  for (const r of rows) {
    if (!r.countryiso3code || r.value === null || !YEAR.test(r.date)) continue;
    setPoint(into, r.countryiso3code, Number(r.date), r.value);
  }
  return into;
}

export async function fetchWdi(code: string, opts: FetchOptions, inputs: Record<string, string> = {}): Promise<Series> {
  const series: Series = new Map();
  let page = 1;
  let pages = 1;
  do {
    const buf = await fetchCached(wdiUrl(code, page), opts);
    inputs[`wdi:${code}:p${page}`] = sha1(buf);
    const parsed = parseWdiPage(JSON.parse(buf.toString('utf8')));
    pages = parsed.pages;
    wdiToSeries(parsed.rows, series);
    page++;
  } while (page <= pages);
  return series;
}
```

`packages/data/pipeline/owid.ts`:
```ts
import { csvObjects } from './csv.js';
import { setPoint, type Series } from './series.js';

/** OWID historical without a plain ISO3 code that we model as countries. */
export const OWID_ENTITY_MAP: Record<string, string> = {
  Kosovo: 'XKX',
  USSR: 'SUN',
  Yugoslavia: 'YUG',
  Czechoslovakia: 'CSK',
  'East Germany': 'DDR',
  'South Yemen': 'YMD',
  'Serbia and Montenegro': 'SCG',
};

const ISO3 = /^[A-Z]{3}$/;
const FIXED = ['Entity', 'Code', 'Year'];

export function resolveOwidId(entity: string, code: string): string | null {
  const mapped = OWID_ENTITY_MAP[entity];
  if (mapped) return mapped;
  return ISO3.test(code) ? code : null;
}

export function parseOwidCsv(text: string): Series {
  const rows = csvObjects(text);
  const header = Object.keys(rows[0] ?? {});
  const valueCols = header.filter((h) => !FIXED.includes(h));
  if (valueCols.length !== 1) throw new Error(`OWID csv: expected one value column besides Entity/Code/Year, got ${valueCols.join(', ')}`);
  const col = valueCols[0]!;
  const out: Series = new Map();
  for (const r of rows) {
    const id = resolveOwidId(r.Entity ?? '', r.Code ?? '');
    if (!id) continue;
    const cell = r[col] ?? '';
    const year = Number(r.Year);
    const v = Number(cell);
    if (cell === '' || !Number.isFinite(v) || !Number.isInteger(year)) continue;
    setPoint(out, id, year, v);
  }
  return out;
}
```

`packages/data/pipeline/wpp.ts`:
```ts
import { gunzipSync } from 'node:zlib';
import { csvObjects } from './csv.js';
import { setPoint, type Series } from './series.js';

const ISO3 = /^[A-Z]{3}$/;
const REQUIRED = ['ISO3_code', 'Variant', 'Time', 'PopTotal'];
const THOUSANDS = 1000;

export function gunzipText(buf: Buffer): string {
  return gunzipSync(buf).toString('utf8');
}

export function parseWppCsv(text: string): Series {
  const rows = csvObjects(text);
  const header = Object.keys(rows[0] ?? {});
  for (const col of REQUIRED) if (!header.includes(col)) throw new Error(`WPP csv: missing column ${col}; columns: ${header.join(', ')}`);
  const out: Series = new Map();
  const variantOf = new Map<string, string>();
  for (const r of rows) {
    const id = r.ISO3_code ?? '';
    const variant = r.Variant ?? '';
    if (!ISO3.test(id) || (variant !== 'Estimates' && variant !== 'Medium')) continue;
    const year = Number(r.Time);
    const pop = Number(r.PopTotal) * THOUSANDS;
    if (!Number.isInteger(year) || !(pop > 0)) continue;
    const key = `${id}:${year}`;
    if (variantOf.get(key) === 'Estimates') continue;
    variantOf.set(key, variant);
    setPoint(out, id, year, pop);
  }
  return out;
}
```

Run: `pnpm test packages/data && pnpm typecheck` → PASS.

- [ ] **Step 3: Проверить живые ответы источников (сеть, без записи в репозиторий)**

Run: `curl -s "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.KD?format=json&per_page=3&page=1&date=1960:2030" | head -c 400`
Expected: JSON вида `[{"page":1,"pages":…},[{"indicator":…,"countryiso3code":"AFE","date":"2024","value":…}]]`.

Run: `curl -sL "https://ourworldindata.org/grapher/liberal-democracy-index.csv?v=1&csvType=full&useColumnShortNames=true" | head -3` и то же для `political-corruption-index` и `mean-years-of-schooling-long-run`.
Expected: первая строка — `Entity,Code,Year,<один столбец>`. Если столбцов больше одного — заменить slug на грэфер с одним показателем (искать на https://ourworldindata.org/grapher/<slug> → «Download → Full data (CSV)») и записать выбранный slug в `normalization.json` задачи 15.

Run: `curl -sIL "https://population.un.org/wpp/Download/Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz" | grep -i '^HTTP'`
Expected: `200`. Если нет — на https://population.un.org/wpp/downloads (раздел «CSV format → Population → Total Population by sex») взять актуальную ссылку и поправить `SOURCES.wpp.url`.

Run: `curl -sL "<url WPP>" | gunzip | head -2`
Expected: заголовок содержит `ISO3_code`, `Variant`, `Time`, `PopTotal`; если колонки названы иначе — поправить `REQUIRED` и чтение полей в `wpp.ts` и тест.

- [ ] **Step 4: Закоммитить**

```bash
git add packages/data
git commit -m "feat(data): WDI, OWID and UN WPP parsers"
```

---

### Task 15: Сетка индикаторов — нормализация, интерполяция, дыры, сборка `out/`

**Files:**
- Create: `packages/content/config/normalization.json`, `packages/data/pipeline/indicators.ts`
- Modify: `packages/schema/src/content.ts` (добавить `Normalization`, поле `horizon` в `EngineConfig`), `packages/content/config/engine.json` (`horizon`), `packages/content/src/index.ts` (поле `normalization`), `packages/data/pipeline/series.ts` (интерполяция, агрегация), `packages/data/pipeline/build.ts` (полная сборка)
- Create (результат сборки, коммитится): `packages/data/out/manifest.json`, `packages/data/out/indicators/meta.json`, `packages/data/out/indicators/{1980..2100}.bin`
- Test: `packages/data/test/series.test.ts`, `packages/data/test/indicators.test.ts`

**Interfaces:**
- Consumes: `Series/Yearly/setPoint`, парсеры задачи 14, `buildGeo/writeGeo/dataVersionOf` задачи 13, `encodeDecade`, `decadesOf`, `IndicatorsMeta`, `IndicatorConfig`, `Priors`.
- Produces:
  - `NormalizationRule` (discriminated union по `kind`): `identity {source, projection?}`, `linear {lo, hi, source, projection?}`, `log {lo, hi, source, projection?}`, `log10 {source, projection?}`, `prior`, `derived {terms: Array<{indicator, weight, invert?}>}`; `Normalization = Record<string, NormalizationRule>`; `Content.normalization`. `source` — строка `wdi:<код>` | `owid:<slug>` | `wpp:PopTotal`; `projection: true` помечает ряд, который за «сегодня» продолжается прогнозом источника (население по WPP до 2100).
  - «Сегодня» набора данных (ADR 0001): `todayAbs` = максимум `realUntil` по индикаторам с источником без `projection`; пишется в `indicators/meta.json` и `manifest.json`, одинаков для всех забегов на этом наборе и воспроизводим из кэша. После «сегодня» ряды без проекции держатся плоско (так уже делает `fillMonthly`), население идёт по среднему варианту WPP.
  - Ряды исторической страны обрезаются после её `to` (NaN): дальше их продолжает движок по аналогу (`Trend`, задача 10), а не плоская полка.
  - `EngineConfig.horizon: { firstYear: number; lastYear: number }`.
  - `transformValue(rule, raw): number` (NaN для неприменимых значений), `fillMonthly(points: Yearly, firstAbs, lastAbs, target: Float32Array): { firstYear; lastYear } | null` (якорь в июле, линейно между якорями, плоско до первого и после последнего), `aggregateYearly(members, series, weights, mode: 'sum' | 'weightedMean'): Yearly` (нужны данные хотя бы у половины членов).
  - `interface GridInputs { countries: Country[]; historical: HistoricalCountry[]; config: Record<string, IndicatorConfig>; normalization: Normalization; priors: Priors; raw: Record<string, Series>; population: Series; firstAbs; lastAbs }`, `buildGrid(inp): { meta: Omit<IndicatorsMeta, 'dataVersion'>; values: Float32Array }` — порядок индикаторов = порядок ключей `indicators.json`; порядок стран = `inp.countries`; `meta.todayAbs` по правилу выше.
  - `build(ctx)` пишет `countries.json`, `territories.json`, `geometry.topo.json`, `graph.json`, `indicators/meta.json`, `indicators/<decade>.bin`, `manifest.json` (`{ dataVersion, sources, inputs, countries, territories, indicators, firstAbs, lastAbs, todayAbs }`).
  - Правила дыр: `realUntil(i)` = декабрь последнего наблюдённого года по всем странам (не позже `lastAbs`); у страны без единой точки — помесячная медиана стран того же субрегиона, иначе региона, иначе всех (`estimated`); значения обрезаются в `[min, max]` конфига; исторические страны берут собственный ряд источника, если он есть, иначе агрегат членов (счётчики — сумма, индексы — среднее с весом населения).

- [ ] **Step 1: Схемы и контент**

Добавить в конец `packages/schema/src/content.ts`:
```ts
const Sourced = { source: z.string(), projection: z.boolean().optional() }; // projection: the source continues past «today» with a forecast
export const NormalizationRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('identity'), ...Sourced }),
  z.object({ kind: z.literal('linear'), lo: z.number(), hi: z.number(), ...Sourced }),
  z.object({ kind: z.literal('log'), lo: z.number().positive(), hi: z.number().positive(), ...Sourced }),
  z.object({ kind: z.literal('log10'), ...Sourced }),
  z.object({ kind: z.literal('prior') }),
  z.object({
    kind: z.literal('derived'),
    terms: z.array(z.object({ indicator: z.string(), weight: z.number(), invert: z.boolean().default(false) })).min(1),
  }),
]);
export type NormalizationRule = z.infer<typeof NormalizationRule>;
export const Normalization = z.record(z.string(), NormalizationRule);
export type Normalization = z.infer<typeof Normalization>;
```

В `EngineConfig` (тот же файл) добавить поле перед `divergenceSigma`:
```ts
  horizon: z.object({ firstYear: z.number().int(), lastYear: z.number().int() }),
```

`packages/content/config/engine.json` (полностью):
```json
{
  "journal": { "maxTicks": 1200, "topPerTick": 400, "minAbs": 0.01 },
  "spill": { "ringFactor": 0.25, "rings": { "econ": 2, "safety": 1, "health": 1, "info": 1 } },
  "horizon": { "firstYear": 1980, "lastYear": 2100 },
  "divergenceSigma": 40
}
```

`packages/content/config/normalization.json`:
```json
{
  "economy":      { "kind": "log",      "lo": 300, "hi": 150000, "source": "wdi:NY.GDP.PCAP.PP.KD" },
  "inequality":   { "kind": "identity", "source": "wdi:SI.POV.GINI" },
  "health":       { "kind": "linear",   "lo": 30, "hi": 90, "source": "wdi:SP.DYN.LE00.IN" },
  "education":    { "kind": "linear",   "lo": 0, "hi": 15, "source": "owid:mean-years-of-schooling-long-run" },
  "inflation":    { "kind": "identity", "source": "wdi:FP.CPI.TOTL.ZG" },
  "information":  { "kind": "identity", "source": "wdi:IT.NET.USER.ZS" },
  "freedom":      { "kind": "linear",   "lo": 0, "hi": 1, "source": "owid:liberal-democracy-index" },
  "institutions": { "kind": "linear",   "lo": 1, "hi": 0, "source": "owid:political-corruption-index" },
  "stability":    { "kind": "prior" },
  "happiness":    { "kind": "derived", "terms": [
    { "indicator": "economy", "weight": 0.4 },
    { "indicator": "health", "weight": 0.3 },
    { "indicator": "freedom", "weight": 0.2 },
    { "indicator": "inequality", "weight": 0.1, "invert": true }
  ] },
  "population":   { "kind": "log10",    "source": "wpp:PopTotal", "projection": true },
  "gdp":          { "kind": "log10",    "source": "wdi:NY.GDP.MKTP.PP.KD" }
}
```

`packages/content/src/index.ts` — добавить импорт и поле (полный файл):
```ts
import {
  Analogs, ChannelMap, EngineConfig, EventTypeDef, GeoConfig, HistoricalCountry, IndicatorConfigs, Normalization, Priors, ScheduledEvent,
  Transition, type IndicatorConfig,
} from '@ripple/schema';
import { z } from 'zod';
import eventTypesJson from '../catalog/event-types.json';
import channelsJson from '../catalog/channels.json';
import indicatorsJson from '../config/indicators.json';
import engineJson from '../config/engine.json';
import geoJson from '../config/geo.json';
import normalizationJson from '../config/normalization.json';
import priorsJson from '../priors/indicators.json';
import historicalJson from '../historical-countries.json';
import analogsJson from '../analogs.json';
import transitionsJson from '../transitions.json';
import tierAJson from '../events/tier-a.json';

export interface Content {
  eventTypes: EventTypeDef[];
  channels: ChannelMap;
  indicatorConfig: Record<string, IndicatorConfig>;
  engine: EngineConfig;
  geo: GeoConfig;
  normalization: Normalization;
  priors: Priors;
  historicalCountries: HistoricalCountry[];
  analogs: Analogs;
  transitions: Transition[];
  events: ScheduledEvent[];
}

let cached: Content | undefined;

export function loadContent(): Content {
  if (cached) return cached;
  const indicatorConfig = IndicatorConfigs.parse(indicatorsJson);
  const normalization = Normalization.parse(normalizationJson);
  for (const code of Object.keys(indicatorConfig)) if (!normalization[code]) throw new Error(`normalization.json: no rule for indicator ${code}`);
  cached = {
    eventTypes: z.array(EventTypeDef).parse(eventTypesJson),
    channels: ChannelMap.parse(channelsJson),
    indicatorConfig,
    engine: EngineConfig.parse(engineJson),
    geo: GeoConfig.parse(geoJson),
    normalization,
    priors: Priors.parse(priorsJson),
    historicalCountries: z.array(HistoricalCountry).parse(historicalJson),
    analogs: Analogs.parse(analogsJson),
    transitions: z.array(Transition).parse(transitionsJson),
    events: z.array(ScheduledEvent).parse(tierAJson),
  };
  return cached;
}
```

Run: `pnpm test && pnpm typecheck` → PASS (ничего не сломалось: фикстура распаковывает `loadContent()` целиком).

- [ ] **Step 2: Тесты рядов и сетки**

`packages/data/test/series.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { aggregateYearly, fillMonthly, type Series } from '../pipeline/series.js';
import { transformValue } from '../pipeline/indicators.js';

describe('fillMonthly', () => {
  const first = absMonth(1980, 1), last = absMonth(1989, 12);
  it('anchors years at July, interpolates between, holds flat outside', () => {
    const target = new Float32Array(last - first + 1);
    const r = fillMonthly(new Map([[1982, 10], [1984, 30]]), first, last, target);
    expect(r).toEqual({ firstYear: 1982, lastYear: 1984 });
    expect(target[absMonth(1980, 1) - first]).toBe(10);
    expect(target[absMonth(1982, 7) - first]).toBe(10);
    expect(target[absMonth(1983, 7) - first]).toBeCloseTo(20, 5);
    expect(target[absMonth(1984, 7) - first]).toBe(30);
    expect(target[absMonth(1989, 12) - first]).toBe(30);
  });
  it('returns null and leaves the target untouched without points', () => {
    const target = new Float32Array(3).fill(NaN);
    expect(fillMonthly(new Map(), first, first + 2, target)).toBeNull();
    expect(Number.isNaN(target[0])).toBe(true);
  });
});

describe('aggregateYearly', () => {
  const series: Series = new Map([
    ['A', new Map([[1990, 10], [2000, 20]])],
    ['B', new Map([[1990, 30]])],
  ]);
  const weights: Series = new Map([
    ['A', new Map([[1990, 1_000_000], [2000, 1_000_000]])],
    ['B', new Map([[1990, 3_000_000]])],
  ]);
  it('sums counts and weights indices by population', () => {
    expect(aggregateYearly(['A', 'B'], series, weights, 'sum').get(1990)).toBe(40);
    expect(aggregateYearly(['A', 'B'], series, weights, 'weightedMean').get(1990)).toBeCloseTo(25, 5);
  });
  it('needs at least half of the members', () => {
    expect(aggregateYearly(['A', 'B'], series, weights, 'sum').get(2000)).toBe(20);
    expect(aggregateYearly(['A', 'B', 'C'], series, weights, 'sum').has(2000)).toBe(false);
  });
});

describe('transformValue', () => {
  it('applies each rule kind and clamps indices to 0..100', () => {
    expect(transformValue({ kind: 'identity', source: 's' }, 42)).toBe(42);
    expect(transformValue({ kind: 'linear', lo: 30, hi: 90, source: 's' }, 60)).toBe(50);
    expect(transformValue({ kind: 'linear', lo: 30, hi: 90, source: 's' }, 100)).toBe(100);
    expect(transformValue({ kind: 'linear', lo: 1, hi: 0, source: 's' }, 0.25)).toBe(75);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 300)).toBe(0);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 150000)).toBe(100);
    expect(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, Math.sqrt(300 * 150000))).toBeCloseTo(50, 5);
    expect(Number.isNaN(transformValue({ kind: 'log', lo: 300, hi: 150000, source: 's' }, 0))).toBe(true);
    expect(transformValue({ kind: 'log10', source: 's' }, 1e6)).toBe(6);
    expect(Number.isNaN(transformValue({ kind: 'prior' }, 1))).toBe(true);
  });
});
```

`packages/data/test/indicators.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { absMonth, type Country, type HistoricalCountry, type Normalization } from '@ripple/schema';
import { buildGrid, type GridInputs } from '../pipeline/indicators.js';
import type { Series } from '../pipeline/series.js';

const FIRST = absMonth(1980, 1), LAST = absMonth(2009, 12);
const country = (id: string, subregion: string, extra: Partial<Country> = {}): Country => ({
  id, name: { ru: id, en: id }, region: 'R', subregion, from: null, to: null, successors: [], predecessors: [], historical: false, ...extra,
});
const historical: HistoricalCountry[] = [{ id: 'UUU', name: { ru: 'U', en: 'U' }, region: 'R', subregion: 'S1', members: ['AAA', 'BBB'], from: null, to: absMonth(1991, 12) - 1 }];
const countries: Country[] = [
  country('AAA', 'S1'), country('BBB', 'S1'), country('CCC', 'S2'),
  country('UUU', 'S1', { historical: true, to: absMonth(1991, 12) - 1, successors: ['AAA', 'BBB'] }),
];
const normalization: Normalization = {
  economy: { kind: 'log', lo: 300, hi: 150000, source: 'wdi:X' },
  stability: { kind: 'prior' },
  happiness: { kind: 'derived', terms: [{ indicator: 'economy', weight: 0.8, invert: false }, { indicator: 'economy', weight: 0.2, invert: true }] },
  population: { kind: 'log10', source: 'wpp:PopTotal', projection: true },
};
const cfg = {
  economy: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.1, offsetHalflifeYears: 10, noiseAmp: 0 },
  stability: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.3, offsetHalflifeYears: 5, noiseAmp: 0 },
  happiness: { kind: 'index' as const, min: 0, max: 100, stickiness: 0.2, offsetHalflifeYears: 8, noiseAmp: 0 },
  population: { kind: 'log10count' as const, min: 0, max: 13, stickiness: 0.5, offsetHalflifeYears: 30, noiseAmp: 0 },
};
const population: Series = new Map([
  ['AAA', new Map([[1990, 1_000_000], [2000, 2_000_000], [2005, 2_200_000]])], // 2005 is a projection point
  ['BBB', new Map([[1990, 1_000_000]])],
  ['CCC', new Map([[1985, 500_000]])],
]);
const economy: Series = new Map([
  ['AAA', new Map([[1990, 3000], [2000, 30000]])],
  ['CCC', new Map([[1985, 100]])],
]);
const inputs: GridInputs = {
  countries, historical, config: cfg, normalization, priors: { stability: { default: 50, bySubregion: { S1: 70 } } },
  raw: { economy, population }, population, firstAbs: FIRST, lastAbs: LAST,
};
const econ = (v: number) => (100 * Math.log(v / 300)) / Math.log(150000 / 300);

describe('buildGrid', () => {
  const { meta, values } = buildGrid(inputs);
  const nC = countries.length, nM = LAST - FIRST + 1;
  const at = (code: string, id: string, year: number, month: number) => {
    const i = meta.indicators.findIndex((m) => m.code === code), c = countries.findIndex((k) => k.id === id);
    return values[(i * nC + c) * nM + (absMonth(year, month) - FIRST)]!;
  };
  it('keeps indicator order from the config and country order from the input', () => {
    expect(meta.indicators.map((m) => m.code)).toEqual(['economy', 'stability', 'happiness', 'population']);
    expect(meta.countries).toEqual(['AAA', 'BBB', 'CCC', 'UUU']);
    expect(meta.firstAbs).toBe(FIRST);
    expect(meta.lastAbs).toBe(LAST);
  });
  it('transforms then interpolates, holds flat outside observations', () => {
    expect(at('economy', 'AAA', 1990, 7)).toBeCloseTo(econ(3000), 3);
    expect(at('economy', 'AAA', 1995, 7)).toBeCloseTo((econ(3000) + econ(30000)) / 2, 3);
    expect(at('economy', 'AAA', 1980, 1)).toBeCloseTo(econ(3000), 3);
    expect(at('economy', 'AAA', 2009, 12)).toBeCloseTo(econ(30000), 3);
    expect(at('population', 'AAA', 1995, 7)).toBeCloseTo((6 + Math.log10(2e6)) / 2, 4);
  });
  it('clamps to the config range and sets realUntil to the last observed December', () => {
    expect(at('economy', 'CCC', 1985, 7)).toBe(0);
    expect(meta.indicators[0]!.realUntil).toBe(absMonth(2000, 12));
    expect(meta.indicators[3]!.realUntil).toBe(absMonth(2005, 12));
  });
  it('sets «today» from observed sources only, ignoring projections', () => {
    expect(meta.todayAbs).toBe(absMonth(2000, 12)); // economy ends 2000; population runs to 2005 but is a projection
  });
  it('estimates missing countries from subregion peers and records them', () => {
    expect(meta.indicators[0]!.estimated).toEqual(['BBB']);
    expect(at('economy', 'BBB', 1995, 7)).toBeCloseTo(at('economy', 'AAA', 1995, 7), 5);
    expect(meta.indicators[3]!.estimated).toEqual([]);
  });
  it('aggregates historical historical from members: sums counts, weights indices', () => {
    expect(at('population', 'UUU', 1990, 7)).toBeCloseTo(Math.log10(2e6), 5);
    expect(at('economy', 'UUU', 1990, 7)).toBeCloseTo(econ(3000), 3);
  });
  it('fills priors by subregion and derives happiness', () => {
    expect(at('stability', 'AAA', 1985, 1)).toBe(70);
    expect(at('stability', 'CCC', 1985, 1)).toBe(50);
    expect(meta.indicators[1]).toMatchObject({ prior: true, realUntil: FIRST - 1, source: 'prior' });
    const e = at('economy', 'AAA', 1995, 7);
    expect(at('happiness', 'AAA', 1995, 7)).toBeCloseTo(0.8 * e + 0.2 * (100 - e), 3);
    expect(meta.indicators[2]).toMatchObject({ source: 'derived', realUntil: absMonth(2000, 12) });
  });
  it('leaves no NaN inside a lifetime and nothing but NaN after a historical country ends', () => {
    const u = countries.findIndex((k) => k.id === 'UUU');
    let nan = 0;
    meta.indicators.forEach((_, i) => {
      for (let c = 0; c < nC; c++) {
        for (let m = 0; m < nM; m++) {
          const v = values[(i * nC + c) * nM + m]!;
          const alive = c !== u || FIRST + m <= absMonth(1991, 12) - 1;
          if (alive && Number.isNaN(v)) nan++;
          if (!alive && !Number.isNaN(v)) nan++;
        }
      }
    });
    expect(nan).toBe(0);
    expect(Number.isNaN(at('economy', 'UUU', 1991, 12))).toBe(true);
    expect(Number.isNaN(at('economy', 'UUU', 1991, 11))).toBe(false);
  });
});
```

Run: `pnpm test packages/data` → FAIL.

- [ ] **Step 3: Реализация рядов и сетки**

`packages/data/pipeline/series.ts` (полностью):
```ts
import { absMonth } from '@ripple/schema';

export type Yearly = Map<number, number>;
export type Series = Map<string, Yearly>;

export function setPoint(series: Series, id: string, year: number, value: number): void {
  let y = series.get(id);
  if (!y) {
    y = new Map();
    series.set(id, y);
  }
  y.set(year, value);
}

const ANCHOR_MONTH = 7;

/** Yearly points → monthly values in `target` (index = abs − firstAbs). Linear between July anchors, flat outside. */
export function fillMonthly(points: Yearly, firstAbs: number, lastAbs: number, target: Float32Array): { firstYear: number; lastYear: number } | null {
  const years = [...points.keys()].sort((a, b) => a - b);
  if (years.length === 0) return null;
  const anchors = years.map((y) => ({ abs: absMonth(y, ANCHOR_MONTH), v: points.get(y)! }));
  let a = 0;
  for (let abs = firstAbs; abs <= lastAbs; abs++) {
    while (a + 1 < anchors.length && anchors[a + 1]!.abs <= abs) a++;
    const cur = anchors[a]!;
    let v: number;
    if (abs <= anchors[0]!.abs) v = anchors[0]!.v;
    else if (a === anchors.length - 1) v = cur.v;
    else {
      const nxt = anchors[a + 1]!;
      v = cur.v + ((nxt.v - cur.v) * (abs - cur.abs)) / (nxt.abs - cur.abs);
    }
    target[abs - firstAbs] = v;
  }
  return { firstYear: years[0]!, lastYear: years[years.length - 1]! };
}

/** Combine member series into one: `sum` for counts, population-weighted mean for indices. A year needs data from at least half of the members. */
export function aggregateYearly(members: string[], series: Series, weights: Series, mode: 'sum' | 'weightedMean'): Yearly {
  const years = new Set<number>();
  for (const m of members) for (const y of series.get(m)?.keys() ?? []) years.add(y);
  const out: Yearly = new Map();
  for (const y of [...years].sort((p, q) => p - q)) {
    let acc = 0, wSum = 0, n = 0;
    for (const m of members) {
      const v = series.get(m)?.get(y);
      if (v === undefined) continue;
      const w = mode === 'sum' ? 1 : (weights.get(m)?.get(y) ?? 1);
      acc += mode === 'sum' ? v : v * w;
      wSum += w;
      n++;
    }
    if (n === 0 || n * 2 < members.length) continue;
    out.set(y, mode === 'sum' ? acc : acc / wSum);
  }
  return out;
}
```

`packages/data/pipeline/indicators.ts`:
```ts
import { absMonth, type Country, type HistoricalCountry, type IndicatorConfig, type IndicatorMeta, type IndicatorsMeta, type Normalization, type NormalizationRule, type Priors } from '@ripple/schema';
import { aggregateYearly, fillMonthly, type Series, type Yearly } from './series.js';

export interface GridInputs {
  countries: Country[];
  historical: HistoricalCountry[];
  config: Record<string, IndicatorConfig>;
  normalization: Normalization;
  priors: Priors;
  raw: Record<string, Series>;
  population: Series;
  firstAbs: number;
  lastAbs: number;
}

export interface GridResult {
  meta: Omit<IndicatorsMeta, 'dataVersion'>;
  values: Float32Array;
}

const INDEX_MIN = 0;
const INDEX_MAX = 100;

export function transformValue(rule: NormalizationRule, raw: number): number {
  switch (rule.kind) {
    case 'identity':
      return raw;
    case 'linear':
      return clamp((INDEX_MAX * (raw - rule.lo)) / (rule.hi - rule.lo), INDEX_MIN, INDEX_MAX);
    case 'log':
      return raw > 0 ? clamp((INDEX_MAX * Math.log(raw / rule.lo)) / Math.log(rule.hi / rule.lo), INDEX_MIN, INDEX_MAX) : NaN;
    case 'log10':
      return raw > 0 ? Math.log10(raw) : NaN;
    default:
      return NaN;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(xs: number[]): number {
  const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function buildGrid(inp: GridInputs): GridResult {
  const codes = Object.keys(inp.config);
  const nC = inp.countries.length;
  const nM = inp.lastAbs - inp.firstAbs + 1;
  const values = new Float32Array(codes.length * nC * nM).fill(NaN);
  const metas: IndicatorMeta[] = new Array<IndicatorMeta>(codes.length);
  const slice = (i: number, c: number): Float32Array => values.subarray((i * nC + c) * nM, (i * nC + c + 1) * nM);
  const historicalById = new Map(inp.historical.map((e) => [e.id, e]));
  const base = (code: string): Omit<IndicatorMeta, 'realUntil' | 'prior' | 'estimated' | 'source'> => ({ code, ...inp.config[code]! });

  // Pass 1: sourced and prior indicators.
  codes.forEach((code, i) => {
    const rule = inp.normalization[code];
    if (!rule) throw new Error(`no normalization rule for ${code}`);
    if (rule.kind === 'derived') return;
    if (rule.kind === 'prior') {
      const p = inp.priors[code];
      if (!p) throw new Error(`indicator ${code} is a prior but priors.json has no entry`);
      inp.countries.forEach((c, k) => slice(i, k).fill(p.bySubregion[c.subregion] ?? p.default));
      metas[i] = { ...base(code), realUntil: inp.firstAbs - 1, prior: true, estimated: [], source: 'prior' };
      return;
    }
    const raw = inp.raw[code];
    if (!raw) throw new Error(`no raw series for ${code} (${rule.source})`);
    const cfg = inp.config[code]!;
    const mode = cfg.kind === 'log10count' ? 'sum' : 'weightedMean';
    const have = new Set<number>();
    let realUntil = inp.firstAbs - 1;
    inp.countries.forEach((c, k) => {
      let yearly: Yearly | undefined = raw.get(c.id);
      const hc = historicalById.get(c.id);
      if (!yearly && hc) yearly = aggregateYearly(hc.members, raw, inp.population, mode);
      if (!yearly || yearly.size === 0) return;
      const transformed: Yearly = new Map();
      for (const [year, v] of yearly) {
        const t = transformValue(rule, v);
        if (Number.isFinite(t)) transformed.set(year, clamp(t, cfg.min, cfg.max));
      }
      const r = fillMonthly(transformed, inp.firstAbs, inp.lastAbs, slice(i, k));
      if (!r) return;
      have.add(k);
      realUntil = Math.max(realUntil, Math.min(absMonth(r.lastYear, 12), inp.lastAbs));
    });
    const estimated: string[] = [];
    inp.countries.forEach((c, k) => {
      if (have.has(k)) return;
      const peers = pickPeers(inp.countries, have, c);
      const target = slice(i, k);
      for (let m = 0; m < nM; m++) target[m] = median(peers.map((p) => slice(i, p)[m]!));
      estimated.push(c.id);
    });
    metas[i] = { ...base(code), realUntil, prior: false, estimated, source: rule.source };
  });

  // Pass 2: derived indicators.
  codes.forEach((code, i) => {
    const rule = inp.normalization[code]!;
    if (rule.kind !== 'derived') return;
    const terms = rule.terms.map((t) => {
      const j = codes.indexOf(t.indicator);
      if (j < 0 || metas[j] === undefined || inp.normalization[t.indicator]!.kind === 'derived') throw new Error(`${code}: term ${t.indicator} must be a sourced or prior indicator`);
      return { j, weight: t.weight, invert: t.invert };
    });
    const cfg = inp.config[code]!;
    for (let k = 0; k < nC; k++) {
      const target = slice(i, k);
      for (let m = 0; m < nM; m++) {
        let acc = 0;
        for (const t of terms) {
          const v = slice(t.j, k)[m]!;
          acc += t.weight * (t.invert ? INDEX_MAX - v : v);
        }
        target[m] = clamp(acc, cfg.min, cfg.max);
      }
    }
    metas[i] = { ...base(code), realUntil: Math.min(...terms.map((t) => metas[t.j]!.realUntil)), prior: false, estimated: [], source: 'derived' };
  });

  // «Today»: the last month any observed (non-projection) source reaches. Same for every run on this dataset (ADR 0001).
  let todayAbs = inp.firstAbs - 1;
  codes.forEach((code, i) => {
    const rule = inp.normalization[code]!;
    if ('source' in rule && !rule.projection) todayAbs = Math.max(todayAbs, metas[i]!.realUntil);
  });
  if (todayAbs < inp.firstAbs) throw new Error('no observed series: cannot place «today»');

  // A historical country's series end with the country; past that the engine continues them by analog (trend.ts), not by a flat shelf.
  inp.countries.forEach((c, k) => {
    if (c.to === null || c.to >= inp.lastAbs) return;
    for (let i = 0; i < codes.length; i++) slice(i, k).fill(NaN, Math.max(0, c.to + 1 - inp.firstAbs));
  });

  return { meta: { countries: inp.countries.map((c) => c.id), indicators: metas, firstAbs: inp.firstAbs, lastAbs: inp.lastAbs, todayAbs }, values };
}

function pickPeers(countries: Country[], have: Set<number>, c: Country): number[] {
  const all = [...have];
  const sub = all.filter((k) => countries[k]!.subregion === c.subregion);
  if (sub.length > 0) return sub;
  const reg = all.filter((k) => countries[k]!.region === c.region);
  if (reg.length > 0) return reg;
  if (all.length === 0) throw new Error(`no data at all to estimate ${c.id}`);
  return all;
}
```

Run: `pnpm test packages/data && pnpm typecheck` → PASS.

- [ ] **Step 4: Полная сборка**

`packages/data/pipeline/build.ts` (полностью, заменяет версию задачи 13):
```ts
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent, type Content } from '@ripple/content';
import { absMonth, fromAbs, Countries, Graph, IndicatorsMeta, Territories, decadesOf, encodeDecade, type Country, type Edge } from '@ripple/schema';
import type { Topology } from 'topojson-specification';
import { assembleCountries, deriveEdges, missingReferences } from './countries.js';
import { DEFAULT_CACHE_DIR, fetchCached, sha1, type FetchImpl, type FetchOptions } from './fetch.js';
import { buildGrid } from './indicators.js';
import { buildTopology, selectCountries, selectTerritories, type ModernCountry, type ModernTerritory, type NeFeature } from './naturalearth.js';
import { parseOwidCsv } from './owid.js';
import type { Series } from './series.js';
import { owidUrl, SOURCES } from './sources.js';
import { fetchWdi } from './wdi.js';
import { gunzipText, parseWppCsv } from './wpp.js';
import { dirSizeBytes, OUT_DIR, writeBin, writeJson } from './write.js';

export interface BuildContext {
  cacheDir: string;
  outDir: string;
  log: (msg: string) => void;
  fetchImpl?: FetchImpl;
}

export interface GeoResult {
  modern: ModernCountry[];
  territories: ModernTerritory[];
  countries: Country[];
  topology: Topology;
  edges: Edge[];
  inputs: Record<string, string>;
}

export interface RawResult {
  raw: Record<string, Series>;
  population: Series;
  inputs: Record<string, string>;
}

function fetchOpts(ctx: BuildContext): FetchOptions {
  return { cacheDir: ctx.cacheDir, log: ctx.log, fetchImpl: ctx.fetchImpl };
}

export async function buildGeo(ctx: BuildContext, content: Content = loadContent()): Promise<GeoResult> {
  const raw = await fetchCached(SOURCES.naturalEarth.url, fetchOpts(ctx));
  const collection = JSON.parse(raw.toString('utf8')) as { features: NeFeature[] };
  const modern = selectCountries(collection.features, content.geo);
  const { territories, dropped } = selectTerritories(collection.features, content.geo, modern);
  if (dropped.length > 0) ctx.log(`geo: dropped features without a principal sovereign: ${dropped.join(' ')}`);
  const { topology, borders } = buildTopology(modern, territories);
  const countries = assembleCountries(modern, content.historicalCountries, content.transitions);
  const missing = missingReferences(countries, content);
  if (missing.length > 0) {
    throw new Error(`content references unknown countries: ${missing.join(', ')} — find their ADM0_A3 in the Natural Earth file and add to packages/content/config/geo.json include/idOverrides`);
  }
  const edges = deriveEdges(borders, content.historicalCountries, countries);
  ctx.log(`geo: ${modern.length} modern + ${content.historicalCountries.length} historical countries + ${territories.length} territories, ${edges.length} border edges`);
  return { modern, territories, countries, topology, edges, inputs: { [SOURCES.naturalEarth.id]: sha1(raw) } };
}

export async function loadRaw(ctx: BuildContext, content: Content = loadContent()): Promise<RawResult> {
  const inputs: Record<string, string> = {};
  const opts = fetchOpts(ctx);
  const wpp = await fetchCached(SOURCES.wpp.url, opts);
  inputs[SOURCES.wpp.id] = sha1(wpp);
  const population = parseWppCsv(gunzipText(wpp));
  ctx.log(`wpp: ${population.size} locations`);
  const raw: Record<string, Series> = {};
  for (const [code, rule] of Object.entries(content.normalization)) {
    if (!('source' in rule)) continue;
    const sep = rule.source.indexOf(':');
    const kind = rule.source.slice(0, sep), ref = rule.source.slice(sep + 1);
    if (kind === 'wdi') raw[code] = await fetchWdi(ref, opts, inputs);
    else if (kind === 'owid') {
      const buf = await fetchCached(owidUrl(ref), opts);
      inputs[`owid:${ref}`] = sha1(buf);
      raw[code] = parseOwidCsv(buf.toString('utf8'));
    } else if (kind === 'wpp') raw[code] = population;
    else throw new Error(`unknown source kind "${kind}" for ${code}`);
    ctx.log(`${code}: ${raw[code]!.size} series from ${rule.source}`);
  }
  return { raw, population, inputs };
}

export function dataVersionOf(inputs: Record<string, string>, content: Content): string {
  return createHash('sha1').update(JSON.stringify({ inputs, content })).digest('hex').slice(0, 12);
}

export function writeGeo(ctx: BuildContext, geo: GeoResult, dataVersion: string): void {
  writeJson(join(ctx.outDir, 'countries.json'), Countries.parse(geo.countries));
  writeJson(join(ctx.outDir, 'territories.json'), Territories.parse(geo.territories.map(({ id, name, parent }) => ({ id, name, parent }))));
  writeJson(join(ctx.outDir, 'geometry.topo.json'), geo.topology);
  writeJson(join(ctx.outDir, 'graph.json'), Graph.parse({ dataVersion, edges: geo.edges }));
}

export async function build(ctx: BuildContext): Promise<void> {
  const content = loadContent();
  const geo = await buildGeo(ctx, content);
  const data = await loadRaw(ctx, content);
  const grid = buildGrid({
    countries: geo.countries,
    historical: content.historicalCountries,
    config: content.indicatorConfig,
    normalization: content.normalization,
    priors: content.priors,
    raw: data.raw,
    population: data.population,
    firstAbs: absMonth(content.engine.horizon.firstYear, 1),
    lastAbs: absMonth(content.engine.horizon.lastYear, 12),
  });
  const inputs = { ...geo.inputs, ...data.inputs };
  const dataVersion = dataVersionOf(inputs, content);
  const meta = IndicatorsMeta.parse({ dataVersion, ...grid.meta });
  writeGeo(ctx, geo, dataVersion);
  writeJson(join(ctx.outDir, 'indicators', 'meta.json'), meta);
  for (const d of decadesOf(meta)) writeBin(join(ctx.outDir, 'indicators', `${d}.bin`), encodeDecade(meta, grid.values, d));
  for (const m of meta.indicators) ctx.log(`${m.code}: realUntil ${m.realUntil}, estimated ${m.estimated.length}: ${m.estimated.join(' ')}`);
  const today = fromAbs(meta.todayAbs);
  ctx.log(`today: ${today.year}-${String(today.month).padStart(2, '0')} (abs ${meta.todayAbs})`);
  writeJson(join(ctx.outDir, 'manifest.json'), {
    dataVersion,
    sources: Object.values(SOURCES),
    inputs,
    countries: meta.countries.length,
    territories: geo.territories.length,
    indicators: meta.indicators.map((m) => m.code),
    firstAbs: meta.firstAbs,
    lastAbs: meta.lastAbs,
    todayAbs: meta.todayAbs,
  });
  ctx.log(`dataVersion ${dataVersion}, ${(dirSizeBytes(ctx.outDir) / 1e6).toFixed(2)} MB → ${ctx.outDir}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build({ cacheDir: DEFAULT_CACHE_DIR, outDir: OUT_DIR, log: (m) => console.error(m) }).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
```

Run: `pnpm typecheck && pnpm test packages/data` → PASS.

- [ ] **Step 5: Собрать данные (сеть) и проверить**

Run: `pnpm data:build`
Expected: строки `GET …` по каждому источнику (при повторе — ни одной, всё из кэша), `wpp: ~240 locations`, по каждому индикатору `…: N series`, затем по каждому индикатору `realUntil …, estimated k: …`, и `dataVersion …, X MB` с X ≤ 12.

Ожидаемые `realUntil` (абсолютные месяцы, 2024-12 = `absMonth(2024,12) = 24299`): для WDI-индикаторов 2023-12…2025-12; для `population` 2100-12 (`25211`); для `stability` 23759 (`1980-01` − 1); для `happiness` — минимум по его слагаемым. Если `realUntil` у какого-то WDI-индикатора меньше 2015-12 — источник вернул не то (проверить `curl` из задачи 14). Строка `today: 2024-12…2025-12` — максимум по WDI/OWID, не 2100 (население помечено `projection`).

Run: `pnpm ripple validate --data packages/data/out`
Expected: `0 errors, W warnings`; предупреждения вида `<code>: more than half of countries are estimated` недопустимы — тогда проверить парсер соответствующего источника.

Run: `pnpm ripple run --data packages/data/out --from 1980 --to 2025 --seed 1 --out /tmp/baseline.json && node -e "const r=require('/tmp/baseline.json'); console.log(r.elapsedMs.toFixed(0)+' ms', r.divergence.world, r.log.baseline.filter(l=>l.kind==='fired').length+' fired', r.log.baseline.filter(l=>l.kind!=='fired').map(l=>l.kind+':'+l.id).join(' '))"`
Expected: время ≤ 3000 мс, `divergence 0`, число `fired` ≥ 57 (все события яруса A до 2025 плюс хуки), среди остальных записей — только `transition:…` (одиннадцать штук), ни `delayed`, ни `cancelled`, ни `diverged`, ни `retargeted`.

- [ ] **Step 6: Закоммитить (вместе с данными)**

```bash
git add packages/schema packages/content packages/data
git commit -m "feat(data): monthly indicator grid 1980–2100 from WDI, OWID and WPP; commit dataset v0"
```

---

### Task 16: Интеграция на реальных данных и README

**Files:**
- Create: `packages/data/test/out.test.ts`, `apps/cli/test/real-data.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `loadDataset`, `validateCommand`, `Simulation`, `missingReferences`, `loadContent`, `decadesOf`, `existsAt`, `absMonth`.
- Produces: тесты верности базовой линии и контрфактического СССР по спеке (раздел 11, «Верность базовой линии» и «Золотые каскады: распад СССР»), бюджет времени, README с командами.

- [ ] **Step 1: Тест набора данных**

`packages/data/test/out.test.ts`:
```ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { absMonth, Countries, Graph, IndicatorsMeta, MISSING, MONTHS_PER_DECADE, Territories, decadesOf, existsAt } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { missingReferences } from '../pipeline/countries.js';
import { dirSizeBytes } from '../pipeline/write.js';

const OUT = resolve(import.meta.dirname, '../out');
const MB = 1e6;
const read = (name: string): unknown => JSON.parse(readFileSync(join(OUT, name), 'utf8'));

describe('packages/data/out', () => {
  const manifest = read('manifest.json') as { dataVersion: string; todayAbs: number; sources: Array<{ license: string }> };
  const countries = Countries.parse(read('countries.json'));
  const territories = Territories.parse(read('territories.json'));
  const graph = Graph.parse(read('graph.json'));
  const meta = IndicatorsMeta.parse(read('indicators/meta.json'));

  it('has one dataVersion everywhere', () => {
    expect(graph.dataVersion).toBe(manifest.dataVersion);
    expect(meta.dataVersion).toBe(manifest.dataVersion);
    expect(manifest.sources.every((s) => s.license.length > 0)).toBe(true);
  });
  it('fixes «today» inside the observed range', () => {
    expect(manifest.todayAbs).toBe(meta.todayAbs);
    expect(meta.todayAbs).toBeGreaterThanOrEqual(absMonth(2022, 12));
    expect(meta.todayAbs).toBeLessThan(absMonth(2030, 1));
    for (const m of meta.indicators) if (m.code !== 'population' && !m.prior) expect(m.realUntil, m.code).toBeLessThanOrEqual(meta.todayAbs);
  });
  it('hangs every territory on a modern country', () => {
    const modern = new Set(countries.filter((c) => !c.historical).map((c) => c.id));
    expect(territories.length).toBeGreaterThan(20);
    for (const t of territories) {
      expect(modern.has(t.parent), `${t.id} → ${t.parent}`).toBe(true);
      expect(modern.has(t.id), `${t.id} is also a country`).toBe(false);
    }
    expect(territories.find((t) => t.id === 'GRL')?.parent).toBe('DNK');
  });
  it('covers every country the content refers to', () => {
    expect(countries.length).toBeGreaterThanOrEqual(180);
    expect(missingReferences(countries, loadContent())).toEqual([]);
    expect(meta.countries).toEqual(countries.map((c) => c.id));
  });
  it('ends a historical country’s series with the country', () => {
    const sun = meta.countries.indexOf('SUN');
    const to = countries.find((c) => c.id === 'SUN')!.to!;
    const decade = Math.floor((to + 1) / MONTHS_PER_DECADE) * 10; // 1990: both `to` (1991-11) and the month after fall in it
    const buf = readFileSync(join(OUT, 'indicators', `${decade}.bin`));
    const raw = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const at = (i: number, abs: number) => raw[(i * meta.countries.length + sun) * MONTHS_PER_DECADE + (abs - decade * 12)]!;
    expect(at(0, to)).not.toBe(MISSING);
    expect(at(0, to + 1)).toBe(MISSING);
  });
  it('has lifetimes consistent with transitions', () => {
    const by = new Map(countries.map((c) => [c.id, c]));
    for (const t of loadContent().transitions) {
      const survivors = t.kind === 'merge' ? t.to : t.kind === 'secede' ? t.from : [];
      for (const id of t.to) expect(existsAt(by.get(id)!, t.abs), `${id} exists at ${t.id}`).toBe(true);
      for (const id of t.from) {
        expect(existsAt(by.get(id)!, t.abs - 1), `${id} exists before ${t.id}`).toBe(true);
        if (!survivors.includes(id)) expect(existsAt(by.get(id)!, t.abs), `${id} gone after ${t.id}`).toBe(false);
      }
    }
  });
  it('has a decade file of the right size for every decade', () => {
    for (const d of decadesOf(meta)) {
      const p = join(OUT, 'indicators', `${d}.bin`);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBe(meta.indicators.length * meta.countries.length * MONTHS_PER_DECADE * 2);
    }
  });
  it('stays inside the size budget', () => {
    expect(dirSizeBytes(OUT)).toBeLessThanOrEqual(12 * MB);
    expect(statSync(join(OUT, 'geometry.topo.json')).size).toBeLessThanOrEqual(2.5 * MB);
  });
  it('only borders between historical that can coexist', () => {
    const by = new Map(countries.map((c) => [c.id, c]));
    for (const e of graph.edges) {
      const a = by.get(e.a)!, b = by.get(e.b)!;
      const start = Math.max(a.from ?? -Infinity, b.from ?? -Infinity);
      const end = Math.min(a.to ?? Infinity, b.to ?? Infinity);
      expect(start <= end, `${e.a}-${e.b} never coexist`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Тест базовой линии и контрфактического СССР**

`apps/cli/test/real-data.test.ts`:
```ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { absMonth } from '@ripple/schema';
import { loadContent } from '@ripple/content';
import { IndicatorStore, Simulation } from '@ripple/engine';
import { loadDataset } from '../src/load.js';
import { validateCommand } from '../src/validate.js';

const OUT = resolve(import.meta.dirname, '../../../packages/data/out');
const TOLERANCE = { index: 5, log10count: 0.02 } as const;
const BUDGET_MS = 3000;
const SUCCESSORS = ['RUS', 'UKR', 'BLR', 'KAZ', 'EST', 'LVA', 'LTU', 'XKX', 'SSD', 'TLS', 'ERI', 'NAM', 'CZE', 'SVK', 'MNE', 'SRB'];
const HISTORICAL = ['SUN', 'YUG', 'SCG', 'CSK', 'DDR', 'YMD'];

describe('real dataset', () => {
  const dataset = loadDataset(OUT);
  const content = loadContent();
  const store = new IndicatorStore(dataset.meta, dataset.values);

  it('validates', () => {
    expect(validateCommand({ data: OUT }).errors).toEqual([]);
  });

  it('runs 1980→2025 within budget, fires all tier-A events and every transition', () => {
    const started = performance.now();
    const sim = Simulation.create({ dataset, content, seed: 1, startYear: 1980, endYear: 2025 });
    sim.run();
    expect(performance.now() - started).toBeLessThanOrEqual(BUDGET_MS);
    const fired = new Set(sim.baseline.log.filter((l) => l.kind === 'fired').map((l) => l.id));
    const due = content.events.filter((e) => e.year < 2025).map((e) => e.id);
    expect(due.filter((id) => !fired.has(id))).toEqual([]);
    expect(sim.baseline.log.filter((l) => l.kind === 'delayed' || l.kind === 'cancelled')).toEqual([]);
    expect(sim.player.log.filter((l) => l.kind === 'delayed' || l.kind === 'cancelled' || l.kind === 'diverged' || l.kind === 'retargeted')).toEqual([]);
    const transitions = sim.baseline.log.filter((l) => l.kind === 'transition').map((l) => l.id).sort();
    expect(transitions).toEqual(content.transitions.map((t) => t.id).sort());
    const idx = (id: string) => sim.baseline.shared.countryIndex.get(id)!;
    for (const id of HISTORICAL) expect(sim.baseline.state.active[idx(id)], id).toBe(0);
    for (const id of SUCCESSORS) expect(sim.baseline.state.active[idx(id)], id).toBe(1);
    expect(sim.divergence().world).toBe(0);
    expect(sim.todayAbs).toBe(dataset.meta.todayAbs);
  });

  it('keeps the baseline within tolerance of the observed series', () => {
    const sim = Simulation.create({ dataset, content, seed: 1, startYear: 1980, endYear: 2025 });
    const violations: string[] = [];
    for (let year = 1981; year <= 2025; year++) {
      const t = absMonth(year, 1);
      sim.runTo(t);
      const st = sim.baseline.state;
      dataset.meta.indicators.forEach((m, i) => {
        if (m.prior || m.source === 'derived' || m.kind === 'rate' || t > m.realUntil) return;
        const tol = TOLERANCE[m.kind];
        for (let c = 0; c < store.nC; c++) {
          if (st.active[c] === 0) continue;
          const diff = Math.abs(st.x[st.idx(i, c)]! - store.real(i, c, t));
          if (diff > tol) violations.push(`${year} ${m.code} ${dataset.meta.countries[c]} off by ${diff.toFixed(2)}`);
        }
      });
    }
    expect(violations.slice(0, 20)).toEqual([]);
  });

  it('propped-up USSR survives 1991 only in the player world, keeps a live trend and takes over its successors’ territory', () => {
    const clean = Simulation.create({ dataset, content, seed: 7, startYear: 1980, endYear: 2025 });
    clean.runTo(absMonth(1992, 6));
    const sim = Simulation.create({ dataset, content, seed: 7, startYear: 1980, endYear: 2025 });
    for (const [year, month] of [[1989, 1], [1989, 7], [1990, 1]] as const) {
      sim.apply({ type: 'reform', country: 'SUN', magnitude: 5, year, month });
    }
    // Two events that in reality stand on Russia after the dissolution: a quake moves to whoever holds the land, a crash does not happen.
    const real = { origin: 'real-A' as const, scope: 'list' as const, countries: ['RUS'], magnitude: 3, preconditions: [], delayMaxYears: 5, hooks: [] };
    sim.player.scheduler.add({ ...real, id: 'test-quake-rus', type: 'earthquake', year: 1992, month: 3 });
    sim.player.scheduler.add({ ...real, id: 'test-crash-rus', type: 'banking_crisis', year: 1992, month: 4 });
    sim.runTo(absMonth(1992, 6));
    const sun = sim.player.shared.countryIndex.get('SUN')!, rus = sim.player.shared.countryIndex.get('RUS')!;
    expect(sim.baseline.state.active[sun]).toBe(0);
    expect(sim.baseline.state.active[rus]).toBe(1);
    expect(sim.player.state.active[sun]).toBe(1);
    expect(sim.player.state.active[rus]).toBe(0);
    expect(sim.player.log.some((l) => l.kind === 'delayed' && l.id === 'ussr-dissolution-1991')).toBe(true);
    expect(sim.player.log.some((l) => l.kind === 'transition' && l.id === 'sun-1991')).toBe(false);
    expect(sim.player.log.find((l) => l.kind === 'retargeted')).toMatchObject({ id: 'test-quake-rus', from: 'RUS', to: 'SUN' });
    expect(sim.player.log.some((l) => l.kind === 'diverged' && l.id === 'test-crash-rus')).toBe(true);
    const econ = sim.player.shared.indicatorIndex.get('economy')!;
    const sunEconomy = sim.player.state.x[sim.player.state.idx(econ, sun)]!;
    expect(Number.isFinite(sunEconomy)).toBe(true); // past SUN's real end the trend is synthetic (analog CHN)
    expect(sunEconomy).toBeGreaterThan(0);
    const div = sim.divergence();
    expect(div.byCountry[sun]).toBe(1);
    expect(div.byCountry[rus]).toBe(1);
    expect(sim.stateHash().baseline).toBe(clean.stateHash().baseline);
    expect(div.world).toBeGreaterThan(0);
  });
});
```

Run: `pnpm test` → все PASS. Если «within tolerance» падает — посмотреть первые нарушения: они укажут индикатор и страну; типичные причины: `realUntil` выставлен позже реальных данных страны (значение держится плоско — это норма и в допуск укладывается) или переход наделил преемника значением предшественника при наличии собственного ряда (ошибка в `applyTransition`, задача 9).

- [ ] **Step 3: README**

`README.md` (полностью):
````markdown
# Рябь (Ripple)

Симуляция мира 1980→2050: подбрось событие и смотри, как расходится рябь. Этап 0 — headless-ядро без UI.
Спека: `docs/superpowers/specs/2026-10-26-ripple-design.md`, план этапа 0: `docs/superpowers/plans/2026-10-26-stage0-skeleton.md`, термины: `GLOSSARY.md`, решения: `docs/adr/`.

## Запуск

```bash
npm i -g pnpm@9
pnpm install
pnpm test                 # все тесты, включая проверки на реальном наборе данных
pnpm typecheck
pnpm ripple run --data packages/data/out --from 1980 --to 2025 --seed 1
pnpm ripple run --data packages/data/out --from 1980 --to 2000 --seed 1 --live 0.3 \
  --event '{"type":"reform","country":"SUN","magnitude":5,"year":1989,"month":1}' --out report.json
pnpm ripple validate --data packages/data/out
pnpm data:build           # пересобрать packages/data/out из источников (сеть; кэш в packages/data/cache)
```

`--live` — «живая история» от 0 до 1: насколько мир игрока до «сегодня» может отклоняться от истории сам по себе. В этапе 0 функций риска ещё нет, поэтому ручка только хранится в ссылке-повторе.

## Пакеты

| Пакет | Что |
|---|---|
| `packages/schema` | типы и zod-схемы данных, контента, забега; кодек int16 |
| `packages/engine` | ядро без DOM: индикаторы с тягой к тренду, тренд по аналогу, граф границ, события с передачей модели, переходы границ, каркас функций риска, журнал причин, два мира |
| `packages/content` | авторские JSON: каталог типов событий, каналы, конфиг динамики, приоры, нормализация, исторические страны, аналоги, переходы, ярус A |
| `packages/data` | конвейер и его выход (`out/`, коммитится) |
| `apps/cli` | `ripple run`, `ripple validate` |

## Данные

| Источник | Что берём | Лицензия |
|---|---|---|
| World Bank WDI | ВВП на душу (ППС), Джини, продолжительность жизни, инфляция, доля интернет-пользователей, ВВП | CC BY 4.0 |
| UN World Population Prospects 2024 | население 1950–2100 (оценки + средний вариант) | CC BY 3.0 IGO |
| Our World in Data (V-Dem, Barro-Lee) | индекс либеральной демократии, индекс коррупции, средние годы обучения | CC BY 4.0 |
| Natural Earth 1:50m | границы современных стран, названия, регионы ООН | public domain |

Исторические страны (СССР, Югославия, СРЮ, Чехословакия, ГДР, Южный Йемен) собираются из современных членов, их ряды кончаются вместе с ними; `stability` — приор по субрегиону; `happiness` — производная. Страны без данных получают медиану субрегиона и помечаются `estimated` в `indicators/meta.json`. «Сегодня» набора (`todayAbs`) — последний месяц, до которого доходит хоть один наблюдённый ряд; население после него идёт по среднему варианту WPP. Территории (Гренландия, Пуэрто-Рико и прочие зависимые земли) лежат в `territories.json` с полем `parent` и в геометрии, но не моделируются.

## Как устроен шаг

Каждый тик — месяц. Для каждой страны и индикатора: `offset` затухает с полураспадом индикатора, приращение реального ряда прибавляется целиком, `k` закрывает остаток зазора до `real + offset`, плюс шум. События дают очки по каналам (`econ/safety/health/info`), очки переводятся в дельты индикаторов и расходятся кольцами по графу границ. В историческом периоде реальные события уже «встроены» в данные и не применяются; в мире игрока событие с не сработавшим предусловием вычитается из тренда и откладывается до пяти лет, а его хуки вычитаются вместе с ним. Если страна в мире игрока пережила свой реальный конец, её ряд продолжается по аналогу (`packages/content/analogs.json`, иначе медиана субрегиона), а реальные события её преемников либо переезжают к ней (природа), либо не случаются (экономика, политика, конфликт). Два мира шагают синхронно на общих хеш-случайных числах; расхождение страны — RMS разницы индексов, а страна, которая есть только в одном мире, расходится на единицу. Функции риска (каркас в `packages/engine/src/hazards.ts`) до «сегодня» молчат в базовой линии и играют в мире игрока с вероятностью `риск × max(живая история, расхождение^γ)`.
````

- [ ] **Step 4: Прогнать всё и закоммитить**

Run: `pnpm typecheck && pnpm test` → PASS; `pnpm ripple run --data packages/data/out --from 1980 --to 2050 --seed 3 | head -c 300` → JSON отчёта.

```bash
git add README.md packages/data/test apps/cli/test
git commit -m "test: baseline fidelity, USSR counterfactual and dataset invariants on real data; README"
```

---

## Критерий готовности этапа 0

- `pnpm test` зелёный без сети; `pnpm ripple run --data packages/data/out --from 1980 --to 2025 --seed 1` отдаёт `divergence 0` за ≤ 3 с.
- Базовая линия в допуске ±5 пунктов (индексы) и ±0.02 (log10-счётчики) от реальных рядов на каждом январе 1981–2025; все события яруса A и все одиннадцать переходов срабатывают; без вмешательств ни одной записи `delayed`, `cancelled`, `diverged`, `retargeted`.
- Три реформы в СССР 1989–1990 откладывают распад в мире игрока; базовый мир не меняется; выживший СССР идёт по аналогу (CHN × 0.6), события на России переезжают к нему (природа) или не случаются (остальное), расхождение СССР и России равно единице.
- Каркас функций риска: ручка `--live` хранится в ссылке-повторе; с пустым списком функций риска ничего не генерируется; тесты на заглушках подтверждают ворота `max(liveHistory, расхождение^γ)` и общие случайные числа после «сегодня».
- «Сегодня» (`todayAbs`) записано в `indicators/meta.json` и `manifest.json`, одинаково для всех забегов; после него встроенные события применяются как обычные.
- `packages/data/out` ≤ 12 МБ, содержит `territories.json` (каждая территория висит на современной стране) и воспроизводится `pnpm data:build` из кэша с тем же `dataVersion`.
