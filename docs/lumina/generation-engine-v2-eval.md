# Generation Engine v2 — eval runbook & baseline

The quality regression gate for the [generation-engine-v2 plan](./generation-engine-v2-plan.md). Every
phase must beat (or at least not regress) this baseline on the standard input classes before it ships.

## How to run

```bash
# Offline (deterministic mock provider — proves the harness, NOT quality):
pnpm -F @lumina/api eval

# Real model (quality numbers): set Gateway creds + real golden images, then:
AI_GATEWAY_API_KEY=… pnpm -F @lumina/api eval
```

The golden set lives in [`apps/api/scripts/eval-golden.json`](../../apps/api/scripts/eval-golden.json).
Each case has an `inputClass` (`standard` vs `tilted | ambiguous | dark | blurry | exterior |
messy-product`). `scoreEval` reports `byInputClass` (success / latency / cost / 👍) so we can see whether a
change helps hard inputs **without regressing** the standard ones.

> **The golden URLs are placeholders** (`https://golden.lumina.app/…`). A real eval needs real, hosted
> room+product images for each case — replace the URLs with real assets (e.g. an R2 `golden/` prefix)
> before a real run. The 👍 rate is a **human rating** collected per output; it is not computed
> automatically.

## Baseline (capture before Phase 1 ships) — owner-run

Run the real eval on `master` (pre-Phase-1) and record the numbers here, then compare after each phase.
Latency split by model comes from **Axiom** (the workflow emits cost/latency/model/status per generation).

| Metric | Baseline (master) | After P1 | After P2 | After P3 | After P4 | After P5 |
|---|---|---|---|---|---|---|
| Overall success rate | _tbd_ | | | | | |
| 👍 rate — standard | _tbd_ | | | | | |
| 👍 rate — non-standard (avg) | _tbd_ | | | | | |
| p50 latency (quality model, 2K) | _tbd_ | | | | | |
| p50 latency (fast model) | _tbd_ | | | | | |
| avg cost ¢ / generation | _tbd_ | | | | | |

**Phase 0 status:** harness expanded (by-input-class reporting + non-standard golden cases) and verified
offline. The real baseline capture (numbers above) and the Axiom latency split are **owner-run** — they
need Gateway image credits and real golden assets, which can't be produced offline.
