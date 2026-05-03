"""Golden-file SSIM gate.

Per pipeline spec §5.3 + Master Auth §3 (chart renderer authorization):
SSIM ≥ 0.85 against the 11 chart-exemplars is the unlock condition for
Stage 2 mass rendering. Iterate up to 5 times; if still failing, fall back
to mplfinance per spec §5.1 (do not halt).

This module owns:
    1. SSIM computation against a reference PNG
    2. Golden-file registry (which exemplar maps to which renderer profile)
    3. Pass/fail decision per the spec threshold

Renderer integration (renderer.py) calls into this after each candidate-render
iteration. SSIM comparator is independent of Playwright — testable now.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from skimage import img_as_float  # type: ignore[import-untyped]
from skimage.io import imread  # type: ignore[import-untyped]
from skimage.metrics import structural_similarity as ssim  # type: ignore[import-untyped]
from skimage.transform import resize  # type: ignore[import-untyped]


# ── Constants per pipeline spec §5.3 ────────────────────────────────────────

SSIM_THRESHOLD = 0.85
MAX_RENDERER_ITERATIONS = 5

RendererProfile = Literal["ninjatrader_1min_dark", "tos_mobile_dark"]


@dataclass(frozen=True)
class SSIMComparison:
    """Result of comparing rendered output to golden reference."""
    rendered_path: Path
    reference_path: Path
    ssim_score: float
    passed: bool
    rendered_hash: str
    reference_hash: str


@dataclass(frozen=True)
class GoldenFileRegistry:
    """Maps exemplar PNG paths to renderer profiles + reference candidate timestamps.

    Per pipeline spec §5.2:
        - ninjatrader_1min_dark profile: exemplars 09, 10, 11
        - tos_mobile_dark profile: exemplars 01-08
    """
    exemplars_dir: Path

    def references_for_profile(self, profile: RendererProfile) -> list[Path]:
        if profile == "ninjatrader_1min_dark":
            ids = [9, 10, 11]
        else:
            ids = [1, 2, 3, 4, 5, 6, 7, 8]

        out: list[Path] = []
        for n in ids:
            # Filename pattern from chart-exemplars/INDEX.md
            matches = list(self.exemplars_dir.glob(f"{n:02d}-*.png"))
            if matches:
                out.append(matches[0])
        return out


# ── SSIM computation ────────────────────────────────────────────────────────

def _hash_png(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compute_ssim(rendered_path: Path, reference_path: Path) -> SSIMComparison:
    """Compute SSIM between a rendered chart PNG and a reference exemplar PNG.

    Both images are loaded as grayscale and resized to match before comparison
    (the rendered image dimensions follow the renderer profile; the reference
    exemplar is whatever resolution the user captured).

    Higher score = more similar. Identical images → 1.0.
    Per spec §5.3 the unlock threshold is 0.85.
    """
    # imread(as_gray=True) returns uint8 (0-255) for 8-bit PNGs but float (0-1)
    # after resize/anti-aliasing. Normalize both to float (0-1) up front so
    # data_range is consistent regardless of the source image's bit depth.
    rendered = img_as_float(imread(rendered_path, as_gray=True))
    reference = img_as_float(imread(reference_path, as_gray=True))

    # Resize to match (use rendered's shape as the canonical size since that's
    # what production output looks like). Reference is the platform screenshot.
    if rendered.shape != reference.shape:
        reference = resize(reference, rendered.shape, anti_aliasing=True)

    score: float = float(ssim(rendered, reference, data_range=1.0))

    return SSIMComparison(
        rendered_path=rendered_path,
        reference_path=reference_path,
        ssim_score=score,
        passed=score >= SSIM_THRESHOLD,
        rendered_hash=_hash_png(rendered_path),
        reference_hash=_hash_png(reference_path),
    )


def best_match(rendered_path: Path, references: list[Path]) -> SSIMComparison:
    """Compute SSIM against each reference, return the highest-scoring match.

    Used when a rendered candidate is compared to multiple exemplars (e.g.,
    all 3 NinjaTrader-profile exemplars) to find the closest visual neighbor.
    """
    if not references:
        raise ValueError("references must not be empty")

    comparisons = [compute_ssim(rendered_path, ref) for ref in references]
    return max(comparisons, key=lambda c: c.ssim_score)


def gate_passed(rendered_paths: list[Path], references: list[Path]) -> tuple[bool, list[SSIMComparison]]:
    """Per spec §5.3 golden-file gate: ALL rendered samples must beat threshold
    against their best-matching reference for the gate to unlock.

    Returns (gate_passed, per_sample_best_match) for diagnostic display.
    """
    results: list[SSIMComparison] = []
    for r in rendered_paths:
        results.append(best_match(r, references))
    overall = all(c.passed for c in results)
    return overall, results
