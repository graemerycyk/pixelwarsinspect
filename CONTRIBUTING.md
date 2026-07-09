# Contributing to pixel-wars-inspect

Thanks for your interest. This repo is the [Inspect](https://inspect.aisi.org.uk) eval task for
Pixel Wars: a model plays a fog-of-war tactics game against a calibrated classical "Commander"
anchor, scored by a deterministic engine. Contributions are welcome under the terms below.

## One thing to know first: `referee.mjs` is generated — do not edit it here

`src/pixel_wars/referee.mjs` is a **build artifact**. It is the Pixel Wars server-authoritative rules
core (and the Commander anchor) compiled to a single ESM file with `esbuild`, from an upstream
source-of-truth repository. It is checked in so the eval runs with only `node` on PATH and no build
step — but it is **regenerated on every release**, so any edit you make to it directly will be
overwritten and lost.

That means:

- **Game rules, the map generator, and the Commander's strategy live upstream**, not here. A change
  to how the game plays, how maps are generated, or how the anchor behaves is an upstream change; it
  reaches this repo only when a new `referee.mjs` is bundled and published.
- **This repo owns the Inspect wrapper** — everything in Python. That is what you can change here.

## What you can contribute here

The Python surface is open to contributions:

- `src/pixel_wars/pixel_wars.py` — the `@task` / `@solver` / `@scorer`, the prompt, the per-turn
  driver loop, and the metrics (`win_rate`, `calls_per_game`, …).
- `src/pixel_wars/referee_client.py` — the stdio transport to the bundled Node referee.
- `tests/` — the transport/replay test and the keyless `mockllm` end-to-end smoke test.
- `README.md`, packaging (`pyproject.toml`), and docs.

Good first contributions: a new metric or breakdown, a cleaner prompt, better error/timeout
handling, packaging or type-checking fixes, more tests.

## How changes flow

The Python-side code here is **mirrored back into the upstream monorepo**, which is the source of
truth. So a merged PR here is cherry-picked upstream (and vice versa). Practically, that is invisible
to you — open a PR, and if it is a Python-side improvement it can be merged and carried upstream.
Engine/anchor changes are the exception: those must be made upstream and will arrive here as a
re-bundled `referee.mjs`.

## Dev setup

```bash
pip install -e '.[dev]'          # Python deps + pytest
# Node.js must be on PATH (runs the bundled referee; no standing server)

python tests/test_transport.py   # transport + seed+log replay verification (no inspect_ai needed)
pytest tests/                    # + a keyless mockllm end-to-end run
inspect eval src/pixel_wars/pixel_wars.py --model mockllm/model --limit 2   # the full loop, no API key
```

A few invariants to preserve:

- **Never hand-construct an action.** The solver picks actions from the referee's `legal` list
  verbatim; the referee is the sole gate and re-validates every one.
- **Per-turn protocol.** The model plans a whole turn in one `generate()` call (an ordered list of
  legal-move numbers); the referee applies them in order and skips any made stale by an earlier one.
  Keep it one generation per turn — that is the eval's cost model.
- **No LLM judge, no BYOK.** Grading is the engine's deterministic margin; the model under test is
  whatever `--model` you pass, via Inspect's provider layer.

## Reporting issues

Open an issue with the exact `inspect eval …` command, the model, and the relevant log. For a bug in
how a game *plays* or *scores* (as opposed to the Python wrapper), note that it likely originates
upstream in the bundled engine.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
