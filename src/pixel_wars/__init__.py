"""Pixel Wars -- a contamination-proof, replay-verified long-horizon game eval for Inspect.

Only the stdlib-only transport (:class:`Referee`) is re-exported here so that importing the
package does not require ``inspect_ai``. The Inspect task lives in ``pixel_wars.pixel_wars`` and is
loaded directly by ``inspect eval pixel_wars.py`` (it imports ``inspect_ai``).
"""

from .referee_client import Referee, RefereeError

__all__ = ["Referee", "RefereeError"]
