"""Tests for SSIM golden-file gate.

Tests the SSIM comparator against synthetic images. The 11 real chart
exemplars are referenced via path but not loaded in CI — they live at:
    C:/Users/Kevin/trading-copilot-research/chart-exemplars/chart-exemplars/

That directory may not exist on every dev machine; tests that need real
exemplars are skipped if the directory is absent.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from skimage.io import imsave  # type: ignore[import-untyped]

from replay_engine.stage2.golden_file import (
    MAX_RENDERER_ITERATIONS,
    SSIM_THRESHOLD,
    GoldenFileRegistry,
    best_match,
    compute_ssim,
    gate_passed,
)


EXEMPLARS_DIR = Path("C:/Users/Kevin/trading-copilot-research/chart-exemplars/chart-exemplars")


def make_synthetic_png(
    path: Path,
    shape: tuple[int, int] = (200, 300),
    value: float = 0.5,
    noise: float = 0.0,
    textured: bool = True,
):
    """Synthesize a PNG with sinusoidal texture (so SSIM has real variance to grade).

    Flat-color images are degenerate for SSIM — variance terms approach zero,
    formula collapses. Real chart screenshots have texture (candles, lines,
    axes). The texture here is a deterministic sinusoid so identical inputs
    still produce identical outputs.
    """
    rng = np.random.default_rng(seed=int(value * 1000))
    h, w = shape
    if textured:
        ys = np.arange(h)[:, None] / h
        xs = np.arange(w)[None, :] / w
        texture = 0.15 * np.sin(20 * np.pi * xs) * np.cos(15 * np.pi * ys)
        img = np.clip(value + texture, 0.0, 1.0)
    else:
        img = np.full(shape, value, dtype=np.float64)

    if noise > 0:
        img = img + rng.normal(0, noise, shape)
        img = np.clip(img, 0.0, 1.0)

    img_8bit = (img * 255).astype(np.uint8)
    imsave(path, img_8bit, check_contrast=False)


# ── Spec invariant ──────────────────────────────────────────────────────────

def test_threshold_matches_spec():
    assert SSIM_THRESHOLD == 0.85


def test_max_iterations_matches_spec():
    assert MAX_RENDERER_ITERATIONS == 5


# ── SSIM computation ────────────────────────────────────────────────────────

def test_identical_images_score_1(tmp_path: Path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    make_synthetic_png(a, value=0.5)
    make_synthetic_png(b, value=0.5)

    result = compute_ssim(a, b)
    assert result.ssim_score == pytest.approx(1.0, abs=0.001)
    assert result.passed is True
    assert result.rendered_hash == result.reference_hash


def test_very_different_images_fail(tmp_path: Path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    make_synthetic_png(a, value=0.0)  # all black
    make_synthetic_png(b, value=1.0)  # all white
    result = compute_ssim(a, b)
    assert result.ssim_score < SSIM_THRESHOLD
    assert result.passed is False


def test_resize_handles_mismatched_dimensions(tmp_path: Path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    # Same texture, different sizes — after resize SSIM should be high but
    # not perfect (resize anti-aliasing changes the high-frequency content).
    make_synthetic_png(a, shape=(100, 150), value=0.5)
    make_synthetic_png(b, shape=(200, 300), value=0.5)
    result = compute_ssim(a, b)
    # The textured pattern at different resolutions resamples differently;
    # passing the SSIM threshold (0.85) is the requirement for the gate.
    assert result.passed is True


def test_low_noise_passes_threshold(tmp_path: Path):
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    make_synthetic_png(a, value=0.5, noise=0.0)
    make_synthetic_png(b, value=0.5, noise=0.005)  # tiny noise
    result = compute_ssim(a, b)
    assert result.passed is True


# ── best_match ─────────────────────────────────────────────────────────────

def test_best_match_picks_highest_ssim(tmp_path: Path):
    rendered = tmp_path / "rendered.png"
    ref_close = tmp_path / "ref_close.png"
    ref_far = tmp_path / "ref_far.png"

    make_synthetic_png(rendered, value=0.5)
    make_synthetic_png(ref_close, value=0.5)   # identical to rendered → SSIM=1.0
    make_synthetic_png(ref_far, value=0.0)      # very different → SSIM low

    result = best_match(rendered, [ref_close, ref_far])
    assert result.reference_path == ref_close


def test_best_match_empty_references_raises(tmp_path: Path):
    rendered = tmp_path / "r.png"
    make_synthetic_png(rendered)
    with pytest.raises(ValueError, match="references must not be empty"):
        best_match(rendered, [])


# ── gate_passed ─────────────────────────────────────────────────────────────

def test_gate_passes_when_all_samples_beat_threshold(tmp_path: Path):
    samples = [tmp_path / f"sample_{i}.png" for i in range(3)]
    refs = [tmp_path / f"ref_{i}.png" for i in range(2)]
    for p in samples + refs:
        make_synthetic_png(p, value=0.5)

    overall, results = gate_passed(samples, refs)
    assert overall is True
    assert len(results) == 3
    assert all(r.passed for r in results)


def test_gate_fails_when_any_sample_below_threshold(tmp_path: Path):
    refs = [tmp_path / "ref.png"]
    make_synthetic_png(refs[0], value=0.5)

    samples = [
        tmp_path / "good.png",
        tmp_path / "bad.png",
    ]
    make_synthetic_png(samples[0], value=0.5)
    make_synthetic_png(samples[1], value=0.0)  # very different from ref → fails

    overall, results = gate_passed(samples, refs)
    assert overall is False
    assert results[0].passed and not results[1].passed


# ── Registry — uses real chart-exemplars dir if present ──────────────────

@pytest.mark.skipif(
    not EXEMPLARS_DIR.exists(),
    reason="Chart exemplars dir not present (acceptable on non-Kevin dev machines)",
)
def test_registry_resolves_ninjatrader_profile_exemplars():
    reg = GoldenFileRegistry(exemplars_dir=EXEMPLARS_DIR)
    refs = reg.references_for_profile("ninjatrader_1min_dark")
    # Should resolve exemplars 09, 10, 11 → 3 paths
    assert len(refs) == 3
    for r in refs:
        assert r.exists()


@pytest.mark.skipif(
    not EXEMPLARS_DIR.exists(),
    reason="Chart exemplars dir not present",
)
def test_registry_resolves_tos_mobile_profile_exemplars():
    reg = GoldenFileRegistry(exemplars_dir=EXEMPLARS_DIR)
    refs = reg.references_for_profile("tos_mobile_dark")
    # Should resolve exemplars 01–08 → 8 paths
    assert len(refs) == 8
    for r in refs:
        assert r.exists()
