# Рябь (Ripple)

Симуляция мира 1980→2050: подбрось событие и смотри, как расходится рябь. Спека: `docs/superpowers/specs/2026-10-26-ripple-design.md`.

## Разработка

    pnpm install
    pnpm test          # все тесты
    pnpm typecheck
    pnpm data:build    # собрать данные (сеть), результат в packages/data/out
    pnpm ripple run --from 1980 --to 2025 --seed 1 --data packages/data/out
