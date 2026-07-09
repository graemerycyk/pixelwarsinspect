"""Inspect entry point — importing this module registers the @task with inspect_ai,
so `inspect eval pixel_wars` resolves after `pip install pixel-wars-inspect`."""

from .pixel_wars import pixel_wars  # noqa: F401
