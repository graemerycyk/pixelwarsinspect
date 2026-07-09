"""End-to-end Inspect smoke tests with mock models (no API keys, no cost).

Two paths are covered:
  * the FALLBACK path — the default mock can't emit a valid action index, so the solver
    force-ends every turn; the game still runs to completion through the referee,
    exercising the full @task/@solver/@scorer wiring;
  * the PLAN path — a scripted mock emits real action indices, exercising
    _parse_indices, the ordered-apply loop, skip-stale handling, and the end-of-game
    replay verification.

Skipped only when inspect_ai is not importable (checked via find_spec, NOT the ambient
PATH — a venv-installed inspect_ai without a shim on $PATH must still run these tests).

Run:  pytest tests/test_smoke.py   (requires: pip install inspect_ai, and node on PATH)

NOTE: `inspect_ai.eval` below is the Inspect framework's public run-an-eval API
(imported as `run_eval`), not Python's builtin eval — no dynamic code execution here.
"""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

if importlib.util.find_spec("inspect_ai") is None:
    pytest.skip("inspect_ai not installed", allow_module_level=True)

PKG = Path(__file__).resolve().parents[1]


def test_mock_runs_end_to_end(tmp_path):
    """Fallback path: the default mock never emits a usable plan; the game still completes."""
    cmd = [
        sys.executable, "-m", "inspect_ai", "eval", "src/pixel_wars/pixel_wars.py",
        "--model", "mockllm/model", "--limit", "1",
        "-T", "n=1", "-T", "seed_base=1",
        "--log-dir", str(tmp_path),
    ]
    proc = subprocess.run(cmd, cwd=str(PKG), capture_output=True, text=True, timeout=900)
    assert proc.returncode == 0, proc.stderr[-2000:]


def test_scripted_mock_exercises_plan_path(tmp_path):
    """Plan path: a scripted mock that always answers "0" plays real actions each turn.

    Index 0 is always a valid entry in the legal list, so _parse_indices returns a
    non-empty plan, the ordered-apply loop runs, and (with a short turn_cap) the game
    finishes and replay-verifies. Uses the Python run API so we can inject
    custom_outputs into mockllm.
    """
    from inspect_ai import eval as run_eval  # Inspect's run-an-eval API, not builtin eval
    from inspect_ai.model import ModelOutput, get_model

    sys.path.insert(0, str(PKG / "src"))
    from pixel_wars.pixel_wars import pixel_wars  # noqa: E402

    outputs = [ModelOutput.from_content("mockllm/model", "0")] * 200
    model = get_model("mockllm/model", custom_outputs=outputs)
    logs = run_eval(
        pixel_wars(n=1, seed_base=3, turn_cap=8),
        model=model,
        log_dir=str(tmp_path),
        display="none",
    )
    assert logs and logs[0].status == "success", logs and logs[0].error
    sample = logs[0].samples[0]
    r = sample.metadata.get("pixel_wars") or {}
    assert r.get("modelActions", 0) > 0, "the scripted mock should have APPLIED real actions"
    assert r.get("verified") is True, f"game must replay-verify: {r.get('verifyError')}"
