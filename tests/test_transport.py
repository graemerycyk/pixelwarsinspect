"""Transport-level smoke test (no inspect_ai required).

Drives full games through the bundled Node referee with a trivial "always pass"
policy, proving the Python <-> Node stdio loop AND the seed+log replay verification —
including the negative cases: a TAMPERED log must fail verification, and invalid
params (a bad `side`) must fail fast instead of silently autoplaying the game.
Run:  python tests/test_transport.py     (or: pytest tests/test_transport.py)
Requires: node on PATH, and src/pixel_wars/referee.mjs bundled.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from pixel_wars.referee_client import Referee, RefereeError  # noqa: E402


def _end_action(view):
    for a in view["legal"]:
        if a.get("kind") == "end":
            return a
    raise AssertionError("`end` must always be a legal move")


def _play_passing(seed, side):
    with Referee() as ref:
        snap = ref.new_game(seed, side=side)
        guard = 0
        while not snap["done"]:
            guard += 1
            assert guard < 10_000, "game did not terminate"
            snap = ref.apply(snap["matchId"], _end_action(snap["view"]))
        rec = ref.record(snap["matchId"])
        v = ref.verify(
            rec["params"]["seed"], rec["log"],
            theme=rec["params"]["theme"], complexity=rec["params"]["complexity"], side=rec["modelSeat"],
        )
        return snap, rec, v


def test_games():
    n = 0
    for side in ("red", "blue"):
        for seed in (1, 42):
            snap, rec, v = _play_passing(seed, side)
            assert snap["done"] is True
            assert snap["score"] is not None and 0.0 <= snap["score"] <= 1.0, snap["score"]
            assert snap["winner"] != side, "a passing model can never win"
            assert isinstance(snap["anchor"], str) and snap["anchor"].startswith("commander-"), snap["anchor"]
            # replay verification reproduces the live result exactly
            assert v["ok"] is True, v
            assert v["winner"] == snap["winner"]
            assert abs(v["score"] - snap["score"]) < 1e-9
            n += 1
            print(
                f"ok  side={side:<4} seed={seed:<4} winner={str(snap['winner']):<4} "
                f"score={snap['score']:.3f} seatTurns={snap['seatTurns']} actions={len(rec['log'])}"
            )
    print(f"\n✓ transport: {n} games, all replay-verified")


def test_tampered_log_fails_verification():
    """The integrity property must hold in the NEGATIVE direction too."""
    with Referee() as ref:
        snap = ref.new_game(7, side="red")
        guard = 0
        while not snap["done"]:
            guard += 1
            assert guard < 10_000
            snap = ref.apply(snap["matchId"], _end_action(snap["view"]))
        rec = ref.record(snap["matchId"])
        assert len(rec["log"]) > 4, "need a few actions to tamper with"
        tampered = list(rec["log"])
        tampered[2] = {"kind": "unit", "unitId": -7, "dest": [0, 0], "act": {"t": "wait"}}
        v = ref.verify(rec["params"]["seed"], tampered, theme=rec["params"]["theme"],
                       complexity=rec["params"]["complexity"], side=rec["modelSeat"])
        assert v["ok"] is False, "a tampered log must FAIL replay verification"
        print("✓ tampered log rejected:", v.get("error", "")[:80])


def test_invalid_side_fails_fast():
    """A `side` typo must raise, never silently autoplay Commander-vs-Commander."""
    with Referee() as ref:
        try:
            ref.new_game(1, side="Red")  # capitalization typo
        except RefereeError as e:
            assert "side" in str(e)
            print("✓ invalid side rejected:", str(e)[:80])
        else:
            raise AssertionError("invalid side was silently accepted")


def test_rules_served():
    """The referee serves the canonical rulebook (the benchmark scaffold's system text)."""
    with Referee() as ref:
        rules = ref.rules()
        assert "Pixel Wars" in rules and "UNITS" in rules and "TERRAIN" in rules
        print(f"✓ rulebook served ({len(rules)} chars)")


if __name__ == "__main__":
    test_games()
    test_tampered_log_fails_verification()
    test_invalid_side_fails_fast()
    test_rules_served()
