# Eval golden set

Local image fixtures for the quality eval harness (`pnpm -F @lumina/api eval`, see `../eval-run.ts`).
Each case in `../eval-golden.json` names a `room` + `product` file here; the harness EXIF-bakes + aspect-pins
the room (ingest parity), composes through the `AIOrchestrator`, writes the result to `out/<id>.png`, and
scores success / latency / cost broken down by `inputClass`. A case whose files are missing is skipped, so
the set can grow incrementally. The human 👍 rate is filled in by judging the `out/` images.

## Provenance (Generation Engine v3, Phase 0 baseline — 2026-06-18)

These are test fixtures, not product assets:

- **`coverage-slats-wall.*`** — the §3.1 reference case supplied by the owner (a portrait bedroom-wall photo,
  EXIF orientation 6, + the wooden acoustic-panel product). The real non-standard target the brief cares about.
- **`room-bedroom.jpg`, `room-facade.jpg`, `room-livingroom-*.jpg`, `product-lamp.jpg`, `product-tile.jpg`** —
  sourced from **Wikimedia Commons** (freely licensed) and down-scaled. `living-room` is the base for three
  **deterministically derived** non-standard conditions (so those input classes are guaranteed + reproducible):
  - `room-livingroom-tilted.jpg` — rotated 5° then centre-cropped (slanted framing).
  - `room-livingroom-dark.jpg` — under-exposed (`modulate brightness 0.42`).
  - `room-livingroom-blurry.jpg` — `blur(7)` (handheld blur).
  - `product-lamp.jpg` — left-cropped from an in-context Anglepoise photo to favour the lamp.

To strengthen the baseline, drop more real merchant-style `room`/`product` pairs here and add a case to
`../eval-golden.json` (priority: real non-standard rooms and a discrete-unit covering product).
`out/` is regenerated each run.
