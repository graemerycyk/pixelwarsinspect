# Pixel Wars — Inspect eval

A [UK AISI Inspect](https://inspect.aisi.org.uk) task: a model plays a fog-of-war turn-based tactics
game against a calibrated classical **Commander** anchor. It targets the failure modes of static
benchmarks by construction:

- **Contamination-proof** — every game is a fresh, procedurally-generated, mirror-symmetric map (the
  dataset is a set of *seeds*, not a fixed board).
- **No LLM judge** — deterministic win/loss plus an objective "boxing-rule" margin score for timeouts.
- **Replay-verified** — a game is a seed + action log the referee re-executes to reproduce the result.

The rules engine is the Pixel Wars server-authoritative core, bundled to a single `referee.mjs` the
Python solver drives over stdio. The Python side never re-implements any rules — it drives the model
and records the seed + action log.

## Requirements

- Python ≥ 3.10, `inspect_ai >= 0.3.244` (the tested floor; `pip install -e .` installs deps).
- **Node.js on PATH** (runs the bundled referee; no standing server).

## Run

```bash
pip install -e .
inspect eval src/pixel_wars/pixel_wars.py --model openai/gpt-4o --limit 2 -T n=4
# or, once installed, via the registered entry point:
inspect eval pixel_wars --model openai/gpt-4o -T n=4
```

Task parameters (`-T key=value`): `n` (games), `seed_base`, `theme` (default `land`), `complexity`
(default `12`), `side` (`red`/`blue`), `turn_cap` (default `200`). The model under test is `--model`
(no BYOK keys in the eval — model-agnostic by construction).

**What the model sees.** The canonical Pixel Wars benchmark scaffold: the engine's own rulebook
(served by the referee — one source of truth), an ASCII board, unit tables (position/HP/fuel/ammo),
property intel, and a numbered list of every legal action. It plans its whole turn as a list of
action numbers in one generation.

**Protocol pins.** Generation runs at `temperature=0`, `max_tokens=1024` — the published
methodology. Override via `-T temperature=… -T max_tokens=…` only for exploration; overridden runs
are not comparable to published numbers.

**Metrics.** The scorer reports the objective `mean`/`stderr` of the boxing-rule margin, the headline
`win_rate` (fraction of games actually won — a turtle-timeout at margin 0.5 is *not* a win),
`calls_per_game` (mean `model.generate()` calls per game — the cost proxy; the per-turn protocol
keeps this to ~one call per turn), and `verified_rate` (fraction of games whose seed+log
replay-verified — the solver re-runs every finished game through the referee and asserts the
reproduced result matches, so every reported score is self-verifying; expect 1.0). Note the margin
floor: a timeout is clamped to `[0.2, 0.8]`, so a totally passive policy that survives to the cap
reads 0.2 — but the anchor closes out passive play, so in practice a null policy simply loses (≈0).

**Validated end-to-end.** The full `@task`/`@solver`/`@scorer` loop runs against keyless
`mockllm/model` runs (`tests/test_smoke.py` — both the fallback path and a scripted mock that plays
real actions); `python tests/test_transport.py` covers the Python↔Node transport, replay
verification (including rejection of a tampered log), and param validation. All pass with no API
key. Real-model *numbers* still need a real `inspect eval` against the model under test.

## Test

```bash
python tests/test_transport.py     # transport + replay verification (no inspect_ai needed)
pytest tests/                      # + a mockllm end-to-end run (needs inspect_ai)
```

## The bundled referee

`referee.mjs` is a **generated artifact** — the Pixel Wars server-authoritative rules core (and the
Commander anchor) compiled to a single ESM file. It ships pre-bundled here, so the eval runs with only
`node` on PATH and no build step. It is regenerated upstream from the Pixel Wars source repo, not
hand-edited in this repo — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Notes

- **Anchor version.** The referee stamps the Commander's version (currently `commander-v1.3`) into every
  game's `anchor` field and each `Score`'s metadata. Because the Commander is periodically re-hardened
  offline, pin/record the anchor version with any published numbers — a version bump is a new eval
  revision, not a silent change.
- **Perf / cost.** This is a per-*turn* protocol: the model plans a whole turn in **one**
  `model.generate()` call (an ordered list of action numbers), matching the upstream Pixel Wars benchmark. That
  collapses cost from ~one call per *action* to ~one call per *turn* — a keyless mock playing one
  action per unit measured ≈2.4–5× fewer calls than actions applied (higher for models that use more
  of their turn; the canonical agent documents ~6–15×). The full board is re-sent each call, so input
  tokens still dominate; the `calls_per_game` and `modelActions` metrics report the real figures per
  run so a reviewer can size a paid run before starting it. Set generous message/token/time limits so
  long games aren't truncated mid-match.
- **Inspect Evals Register.** This repo is the standalone source for the eval; a Register submission
  points at a pinned commit here plus the arXiv methodology paper (in preparation).
