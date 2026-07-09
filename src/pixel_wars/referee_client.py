"""Transport to the bundled Node referee (``referee.mjs``).

A game is driven over stdio: we spawn ``node referee.mjs`` once and exchange
newline-delimited JSON. One process can serve many games. The bundled file *is*
the Pixel Wars server-authoritative rules core (``src/core``) compiled to a single
ESM file, so the Python side never re-implements any rules -- it only drives the
model and records the seed + action log for replay verification.

Robustness contract:
  * missing ``node`` -> RefereeError at construction (not a raw FileNotFoundError);
  * every call has a wall-clock timeout (default 120s) -- a wedged referee is killed
    and reported, never hung on;
  * stderr is drained on a daemon thread and its tail is attached to error messages;
  * non-JSON output raises RefereeError with the offending line excerpt.

Requires ``node`` on the PATH. The bundle ships next to this module; rebuild it
with (from the Pixel Wars repo root)::

    npx esbuild server/src/referee-cli.ts --bundle --platform=node \\
        --format=esm --outfile=pixel-wars-inspect/src/pixel_wars/referee.mjs
"""

from __future__ import annotations

import collections
import json
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

REFEREE_MJS = Path(__file__).with_name("referee.mjs")

DEFAULT_TIMEOUT = 120.0  # seconds per referee call; the Commander's whole turn computes within this


class RefereeError(RuntimeError):
    """Raised when the referee subprocess is missing, dies, times out, or returns garbage."""


class Referee:
    """Drives one or more Pixel Wars games through the bundled Node referee."""

    def __init__(
        self,
        node: str = "node",
        referee_path: Path | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        path = referee_path or REFEREE_MJS
        if not path.exists():
            raise RefereeError(
                f"bundled referee not found at {path} -- run the esbuild bundle step (see module docstring)"
            )
        if shutil.which(node) is None:
            raise RefereeError(
                f"Node.js executable {node!r} not found on PATH -- install Node (see README Requirements)"
            )
        self._timeout = timeout
        self._timed_out = False
        self._stderr_tail: collections.deque[str] = collections.deque(maxlen=80)
        self._proc = subprocess.Popen(
            [node, str(path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        # Drain stderr continuously (an undrained pipe can fill and deadlock node); keep a
        # bounded tail so crash diagnostics survive into RefereeError messages.
        self._stderr_thread = threading.Thread(target=self._drain_stderr, daemon=True)
        self._stderr_thread.start()

    def _drain_stderr(self) -> None:
        try:
            assert self._proc.stderr is not None
            for line in self._proc.stderr:
                self._stderr_tail.append(line.rstrip("\n"))
        except ValueError:  # pipe closed during shutdown
            pass

    def _stderr_excerpt(self) -> str:
        return ("; referee stderr tail:\n" + "\n".join(self._stderr_tail)) if self._stderr_tail else ""

    def _kill_on_timeout(self) -> None:
        self._timed_out = True
        self._proc.kill()

    def _rpc(self, msg: dict[str, Any]) -> dict[str, Any]:
        proc = self._proc
        if proc.stdin is None or proc.stdout is None:
            raise RefereeError("referee process has no stdio pipes")
        # Watchdog: a wedged node process would otherwise block readline() forever (and,
        # from an async caller, stall every parallel sample). Kill + report instead.
        watchdog = threading.Timer(self._timeout, self._kill_on_timeout)
        watchdog.start()
        try:
            try:
                proc.stdin.write(json.dumps(msg) + "\n")
                proc.stdin.flush()
            except (BrokenPipeError, ValueError) as e:  # pragma: no cover - process died
                raise RefereeError(f"referee stdin closed: {e}{self._stderr_excerpt()}") from e
            line = proc.stdout.readline()
        finally:
            watchdog.cancel()
        if self._timed_out:
            raise RefereeError(
                f"referee call {msg.get('cmd')!r} timed out after {self._timeout:.0f}s -- process killed"
                f"{self._stderr_excerpt()}"
            )
        if not line:
            raise RefereeError(f"referee process closed unexpectedly (no response){self._stderr_excerpt()}")
        try:
            return json.loads(line)
        except json.JSONDecodeError as e:
            raise RefereeError(
                f"referee produced non-JSON output: {line[:200]!r}{self._stderr_excerpt()}"
            ) from e

    def _checked(self, msg: dict[str, Any]) -> dict[str, Any]:
        """RPC that raises on an {ok:false} protocol error (bad params, unknown cmd)."""
        res = self._rpc(msg)
        if res.get("ok") is False:
            raise RefereeError(f"referee rejected {msg.get('cmd')!r}: {res.get('error', 'unknown error')}")
        return res

    # --- game verbs (mirror server/src/referee.ts) ---

    def new_game(
        self, seed: int, theme: str = "land", complexity: int = 12, side: str = "red", turn_cap: int = 200
    ) -> dict[str, Any]:
        """Start a game; returns the model's first fog-honest view + status.

        Raises RefereeError on invalid params (e.g. a bad ``side`` or ``theme``) -- the
        referee validates them server-side, so a typo fails fast instead of silently
        autoplaying the game.
        """
        return self._checked(
            {"cmd": "new", "seed": seed, "theme": theme, "complexity": complexity, "side": side, "turnCap": turn_cap}
        )

    def apply(self, match_id: str, action: Any) -> dict[str, Any]:
        """Submit ONE action for the model's seat; the Commander auto-plays its turn.

        NOT ``_checked``: an ``ok:false`` here means "that action was rejected -- pick
        another", which is a normal part of the protocol, not a transport error.
        """
        return self._rpc({"cmd": "apply", "matchId": match_id, "action": action})

    def record(self, match_id: str) -> dict[str, Any]:
        """The replay-verifiable record so far: ``{params, log, modelSeat}``."""
        return self._rpc({"cmd": "record", "matchId": match_id})

    def verify(
        self, seed: int, log: list, theme: str = "land", complexity: int = 12, side: str = "red"
    ) -> dict[str, Any]:
        """Independently re-run a seed + log; returns the reproduced winner + score."""
        return self._rpc(
            {"cmd": "verify", "seed": seed, "theme": theme, "complexity": complexity, "side": side, "log": log}
        )

    def rules(self) -> str:
        """The canonical rulebook text (identical to the benchmark scaffold's system prompt)."""
        return str(self._checked({"cmd": "rules"}).get("rules", ""))

    def ping(self) -> dict[str, Any]:
        return self._rpc({"cmd": "ping"})

    def close(self) -> None:
        try:
            if self._proc.stdin:
                self._proc.stdin.write('{"cmd":"close"}\n')
                self._proc.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass
        try:
            self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover
            self._proc.kill()

    def __enter__(self) -> "Referee":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
