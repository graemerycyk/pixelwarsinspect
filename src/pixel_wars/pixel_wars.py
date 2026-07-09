"""Pixel Wars as an Inspect eval.

A model plays a fog-of-war tactics game against the calibrated classical "Commander"
anchor. The dataset is a set of SEEDS -- each sample procedurally generates a fresh,
mirror-symmetric map, so there is no fixed board to leak into training data. Grading
is the engine's deterministic boxing-rule margin (no LLM judge), and every game is a
seed + action log the Node referee replay-verifies at the end of the game.

Structure:
  * dataset -- one Sample per seed.
  * solver  -- drives the game against the bundled Node referee. The model is briefed
               with the CANONICAL benchmark scaffold: the engine's own rulebook (served
               by the referee, one source of truth), an ASCII board, unit tables, and
               property intel -- then a NUMBERED list of every legal action. Each TURN
               it plans a whole ordered list of action indices in ONE generation; the
               referee applies them in order and skips any made stale by an earlier
               action, then the turn is always closed with "end". The referee is the
               SOLE gate to the rules core, so an illegal move can never be applied.
  * scorer  -- reads the referee's final margin score into Score.value (a float in
               [0, 1]); win/loss are 1/0, timeouts are the boxing-rule margin (floored
               at 0.2 -- a totally passive policy bottoms out near 0, losing outright).
               Reports the objective margin (mean/stderr) AND the headline win-rate,
               plus mean model calls per game (the cost proxy), and whether each game
               replay-verified.

Protocol pins (match the published methodology; override via -T if you must, but then
your numbers are NOT comparable): temperature=0, max_tokens=1024 per generation.

Run (needs `pip install inspect_ai` and `node` on PATH):
    inspect eval pixel_wars.py --model <provider/model> --limit 2 -T n=4

VALIDATION: the transport (Python <-> Node) and replay verification are covered by
tests/test_transport.py (no inspect_ai needed); the full @task/@solver/@scorer loop is
covered end-to-end by tests/test_smoke.py -- keyless `mockllm/model` runs, including a
scripted mock that exercises the real plan-parse/apply path. Real-model NUMBERS still
require a real `inspect eval` run against the model under test.

PERF: this is a per-TURN protocol -- the model plans a whole turn in ONE generation
(matching test/benchmark.ts's per-turn protocol), so a game costs ~one model call per
turn, not per action; the `calls_per_game` metric reports the exact figure so a reviewer
can size a run before starting it. Referee calls run off-thread with a watchdog timeout,
so parallel samples never stall on a wedged subprocess.
"""

from __future__ import annotations

import asyncio
from typing import Any

from inspect_ai import Task, task
from inspect_ai.dataset import MemoryDataset, Sample
from inspect_ai.model import ChatMessageSystem, ChatMessageUser, GenerateConfig, get_model
from inspect_ai.scorer import (
    Metric,
    SampleScore,
    Score,
    Scorer,
    mean,
    metric,
    scorer,
    stderr,
)
from inspect_ai.solver import Generate, Solver, TaskState, solver

try:
    from .referee_client import Referee, RefereeError
except ImportError:
    # Inspect loads a task passed by path (`inspect eval .../pixel_wars.py`) as a
    # standalone module, not as a package, so the relative import fails. Fall back to
    # putting our own directory on sys.path and importing flat.
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from referee_client import Referee, RefereeError

# Terrain glyphs — mirrors TERRAIN_GLYPH in src/agents/llm/prompt.ts (ruleset-1; the
# rulebook text served by the referee explains them, so the two must stay in sync).
TERRAIN_GLYPH = {
    "plain": ".", "road": "=", "forest": "f", "mountain": "^", "river": "~", "bridge": "#",
    "sea": "S", "reef": "r", "city": "c", "base": "b", "airport": "a", "port": "p",
    "seafort": "F", "hq": "H",
}
PROPERTY_TERRAIN = {"city", "base", "airport", "port", "seafort", "hq"}
VALID_SIDES = {"red", "blue"}

PROTOCOL = (
    "You are playing under fog of war against a calibrated classical AI. You win by capturing the "
    "enemy HQ or eliminating its army. Each turn you are shown the board and a NUMBERED list of every "
    "legal action. Plan your WHOLE turn at once: reply with the numbers of the actions you want to "
    "take, in order, separated by spaces, and finish with the number for 'end turn'. Reply with "
    "numbers only -- no other text. Actions apply in order; any that is no longer legal by the time "
    "it is reached is skipped."
)


def _fmt_action(i: int, a: dict[str, Any]) -> str:
    kind = a.get("kind")
    if kind == "end":
        return f"{i}. end turn"
    if kind == "build":
        return f"{i}. build {a['unitType']} at ({a['x']},{a['y']})"
    if kind == "unit":
        act = a.get("act", {})
        t = act.get("t", "?")
        dest = a.get("dest", [None, None])
        extra = ""
        if t == "attack":
            extra = f" target #{act.get('targetId')}"
        elif t in ("launch", "unload", "buildBridge"):
            extra = f" ({act.get('tx')},{act.get('ty')})"
        return f"{i}. unit #{a['unitId']} -> ({dest[0]},{dest[1]}) : {t}{extra}"
    return f"{i}. {a}"


def _ascii_board(view: dict[str, Any]) -> str:
    w, h = view["width"], view["height"]
    tiles = view.get("tiles", [])
    rows = []
    for y in range(h):
        rows.append("".join(TERRAIN_GLYPH.get(tiles[y * w + x].get("terrain"), "?") for x in range(w)))
    return "\n".join(rows)


def _unit_lines(view: dict[str, Any], mine: bool) -> str:
    us = [u for u in view.get("units", []) if bool(u.get("mine")) == mine]
    if not us:
        return "  (none)" if mine else "  (none visible)"
    lines = []
    for u in us:
        extra = " ".join(
            s for s in (
                f"fuel={u['fuel']}" if u.get("fuel") is not None else "",
                f"ammo={u['ammo']}" if u.get("ammo") is not None else "",
                f"cargo={u['cargo']}" if u.get("cargo") else "",
                "acted" if u.get("acted") else "",
            ) if s
        )
        lines.append(f"  #{u['id']} {u['type']} at [{u['x']},{u['y']}] hp={u['hp']}{' ' + extra if extra else ''}")
    return "\n".join(lines)


def _property_lines(view: dict[str, Any]) -> str:
    you = view.get("you")
    lines = []
    for t in view.get("tiles", []):
        if t.get("terrain") not in PROPERTY_TERRAIN:
            continue
        owner = "YOURS" if t.get("owner") == you else ("ENEMY" if t.get("owner") else "neutral")
        cap = f" capturing({t['captureLeft']}/20)" if t.get("captureLeft", 20) < 20 else ""
        lines.append(f"  [{t['x']},{t['y']}] {t['terrain']} {owner}{cap}")
    return "\n".join(lines)


def _render(view: dict[str, Any], repair: str | None = None) -> str:
    """The full raw-mode board briefing — mirrors src/agents/llm/prompt.ts buildMessages
    so an Inspect-run model sees what a benchmark-run model sees (board, units, intel),
    with the numbered-index elicitation on top."""
    legal = view.get("legal", [])
    enemy_count = sum(1 for u in view.get("units", []) if not u.get("mine"))
    lines = [
        f"You are {view.get('you')}. Turn {view.get('turn')}. Your funds: {view.get('funds')}.",
        "",
        "BOARD (terrain glyphs; see rulebook):",
        _ascii_board(view),
        "",
        "YOUR UNITS:",
        _unit_lines(view, True),
        f"VISIBLE ENEMY UNITS ({enemy_count}):",
        _unit_lines(view, False),
        "PROPERTIES:",
        _property_lines(view),
        "",
        f"LEGAL ACTIONS ({len(legal)}):",
    ]
    lines += [_fmt_action(i, a) for i, a in enumerate(legal)]
    end_i = next((i for i, a in enumerate(legal) if a.get("kind") == "end"), len(legal) - 1)
    lines.append("")
    if repair:
        lines.append(repair)
    lines.append(
        f"Plan your whole turn: reply with action numbers (0-{len(legal) - 1}) in order, "
        f"space-separated, ending with {end_i} (end turn). Numbers only."
    )
    return "\n".join(lines)


def _end_action(legal: list[dict[str, Any]]) -> dict[str, Any]:
    """The `end turn` action object (always legal); falls back to the last option."""
    for a in legal:
        if a.get("kind") == "end":
            return a
    return legal[-1]


def _parse_indices(text: str, n: int) -> list[int]:
    """Every integer token, in order, that indexes into the legal list (0..n-1)."""
    out: list[int] = []
    tok = ""
    for ch in text + " ":
        if ch.isdigit():
            tok += ch
        elif tok:
            v = int(tok)
            if 0 <= v < n:
                out.append(v)
            tok = ""
    return out


@solver
def play_pixel_wars(
    theme: str = "land",
    complexity: int = 12,
    side: str = "red",
    max_illegal: int = 2,
    max_turns: int = 2000,
    turn_cap: int = 200,
    temperature: float = 0.0,
    max_tokens: int = 1024,
) -> Solver:
    """Drive one game to completion, storing the referee result on ``state.metadata``.

    ``temperature``/``max_tokens`` default to the published methodology (T=0, 1024) so
    registry runs are protocol-comparable with the paper's numbers.
    """
    if side not in VALID_SIDES:
        raise ValueError(f"side must be 'red' or 'blue', got {side!r}")

    config = GenerateConfig(temperature=temperature, max_tokens=max_tokens)

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        seed = int(state.metadata["seed"])
        model = get_model()
        # Referee calls are blocking subprocess I/O with their own watchdog timeout; run
        # them off-thread so parallel samples share the event loop fairly.
        ref = await asyncio.to_thread(Referee)
        try:
            rules = await asyncio.to_thread(ref.rules)
            system = ChatMessageSystem(content=f"{rules}\n\n{PROTOCOL}")
            snap = await asyncio.to_thread(ref.new_game, seed, theme, complexity, side, turn_cap)
            acted = 0  # actions actually applied this game (activity metric)
            calls = 0  # model.generate() calls -- the cost proxy (~1 per turn)
            # The referee's turnCap is the real terminator; max_turns is only an
            # anti-hang backstop and should never bind in a normal game.
            turns = 0
            while not snap["done"] and turns < max_turns:
                turns += 1
                legal = snap["view"]["legal"]  # turn-start snapshot the model plans against
                plan: list[int] = []
                repair: str | None = None
                for _ in range(max_illegal + 1):
                    prompt = _render(snap["view"], repair)
                    out = await model.generate(
                        [system, ChatMessageUser(content=prompt)], config=config
                    )
                    calls += 1
                    plan = _parse_indices(out.completion or "", len(legal))
                    if plan:
                        break
                    repair = (
                        f"Your last reply contained no valid action numbers (0-{len(legal) - 1}). "
                        "Reply with space-separated numbers from the list above ONLY."
                    )

                # Apply the planned turn in order. The referee re-validates each action
                # against the evolving board, so a step made stale by an earlier one is
                # skipped -- mirroring the canonical actTurn/onTurnReject protocol. The
                # opponent only moves once we submit `end`.
                ended = False
                for i in plan:
                    res = await asyncio.to_thread(ref.apply, snap["matchId"], legal[i])
                    if not res.get("ok", True):
                        continue  # stale/illegal by now -- skip, keep the last good snapshot
                    snap = res
                    acted += 1
                    if legal[i].get("kind") == "end" or snap["done"]:
                        ended = True
                        break

                # Always close the turn so control passes to the Commander (never stall).
                if not ended and not snap["done"]:
                    snap = await asyncio.to_thread(
                        ref.apply, snap["matchId"], _end_action(snap["view"]["legal"])
                    )
                    acted += 1

            if not snap["done"]:
                # The anti-hang backstop fired -- an infra failure, not a game result.
                # Raise so Inspect marks the sample as an ERROR (excluded from metrics)
                # instead of silently depressing the mean like a loss.
                raise RefereeError(f"game did not finish within max_turns={max_turns} (backstop)")

            rec = await asyncio.to_thread(ref.record, snap["matchId"])
            # Replay-verify THIS game before scoring it -- every reported score carries its
            # own integrity check (see the verified_rate metric).
            ver = await asyncio.to_thread(
                ref.verify, seed, rec["log"], theme, complexity, side
            )
            verified = bool(
                ver.get("ok")
                and ver.get("winner") == snap["winner"]
                and ver.get("score") is not None
                and abs(float(ver["score"]) - float(snap["score"])) < 1e-9
            )
            winner, score = snap["winner"], snap["score"]
            outcome = "win" if winner == side else "loss" if winner else "timeout"
            result = {
                "seed": seed,
                "side": side,
                "winner": winner,
                "score": score,
                "outcome": outcome,
                "verified": verified,
                "verifyError": None if verified else ver.get("error", "reproduced result mismatched"),
                "seatTurns": snap["seatTurns"],
                "turnCount": snap["turnCount"],
                "modelCalls": calls,
                "modelActions": acted,
                "anchor": snap["anchor"],
                "params": rec["params"],
                "log": rec["log"],
            }
            state.metadata["pixel_wars"] = result
            state.output.completion = (
                f"{outcome} vs {result['anchor']} (score {float(score):.3f}, "
                f"{'replay-verified' if verified else 'VERIFY-FAILED'})"
            )
        finally:
            await asyncio.to_thread(ref.close)
        return state

    return solve


@metric
def win_rate() -> Metric:
    """Fraction of games the model actually WON.

    The headline number a game eval reader expects. This is NOT the margin mean: a
    boxing-rule timeout at margin 0.5 is a turtle, not a win, so a model can post a
    0.5 mean margin with a 0% win rate. Read from Score.answer ("win"/"loss"/"timeout").
    """

    def compute(scores: list[SampleScore]) -> float:
        if not scores:
            return 0.0
        wins = sum(1.0 for s in scores if s.score.answer == "win")
        return wins / float(len(scores))

    return compute


@metric
def calls_per_game() -> Metric:
    """Mean model.generate() calls per game -- the cost/latency proxy for this per-turn
    protocol, so a reviewer can size a run before pointing it at a paid model."""

    def compute(scores: list[SampleScore]) -> float:
        vals = [(s.score.metadata or {}).get("modelCalls") for s in scores]
        vals = [v for v in vals if v is not None]
        return (sum(vals) / float(len(vals))) if vals else 0.0

    return compute


@metric
def verified_rate() -> Metric:
    """Fraction of scored games whose seed+log replay-verified (should always be 1.0)."""

    def compute(scores: list[SampleScore]) -> float:
        vals = [(s.score.metadata or {}).get("verified") for s in scores]
        vals = [v for v in vals if v is not None]
        return (sum(1.0 for v in vals if v) / float(len(vals))) if vals else 0.0

    return compute


@scorer(metrics=[mean(), stderr(), win_rate(), calls_per_game(), verified_rate()])
def margin_scorer() -> Scorer:
    """Score = the referee's deterministic margin in [0, 1] (1 win, 0 loss, boxing-rule on timeout)."""

    async def score(state: TaskState, target: Any) -> Score:
        r = state.metadata.get("pixel_wars")
        if not r or r.get("score") is None:
            # Solver failures raise (Inspect marks the sample errored); this branch is a
            # last-resort guard so a silent gap is at least labeled, never a fake loss.
            return Score(
                value=0.0,
                answer="error",
                explanation=(r.get("outcome", "incomplete") if r else "no game result recorded"),
            )
        return Score(
            value=float(r["score"]),
            answer=r["outcome"],
            explanation=(
                f"vs {r['anchor']}: {r['outcome']} as {r['side']}; "
                f"turns={r['turnCount']}, actions={len(r['log'])}, "
                f"calls={r.get('modelCalls')}, margin={float(r['score']):.3f}, "
                f"replay-verified={r.get('verified')}"
            ),
            metadata={
                "anchor": r["anchor"],
                "winner": r["winner"],
                "seed": r["seed"],
                "verified": r.get("verified"),
                "modelCalls": r.get("modelCalls"),
                "turnCount": r.get("turnCount"),
            },
        )

    return score


@task
def pixel_wars(
    n: int = 10,
    seed_base: int = 1000,
    theme: str = "land",
    complexity: int = 12,
    side: str = "red",
    turn_cap: int = 200,
    temperature: float = 0.0,
    max_tokens: int = 1024,
) -> Task:
    """``n`` games on procedurally-generated maps (seeds ``seed_base .. seed_base+n-1``).

    Protocol defaults (temperature=0, max_tokens=1024, turn_cap=200, complexity=12) pin
    the published methodology; override only for exploration, not comparable numbers.
    """
    if side not in VALID_SIDES:
        raise ValueError(f"side must be 'red' or 'blue', got {side!r}")
    samples = [
        Sample(
            input=f"Play Pixel Wars on procedurally-generated seed {seed_base + i}.",
            id=f"seed-{seed_base + i}",
            metadata={"seed": seed_base + i, "side": side},
        )
        for i in range(n)
    ]
    return Task(
        dataset=MemoryDataset(samples),
        solver=play_pixel_wars(
            theme=theme,
            complexity=complexity,
            side=side,
            turn_cap=turn_cap,
            temperature=temperature,
            max_tokens=max_tokens,
        ),
        scorer=margin_scorer(),
        version=2,  # bumped 2026-07-09: board-rendering prompt + pinned GenerateConfig + per-game verify
    )
