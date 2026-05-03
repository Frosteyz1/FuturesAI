"""Stage 2 chart renderer — Playwright + TradingView Lightweight Charts.

Per Master Auth §3: TradingView Lightweight Charts via headless Chromium.
Two locked profiles: ninjatrader_1min_dark and tos_mobile_dark per spec §5.2.

This module is the Python wrapper that:
    1. Spawns a headless Chromium via Playwright
    2. Loads the lightweight_charts_template.html with profile-specific config
    3. Injects OHLCV data via JS evaluation
    4. Captures the rendered chart as a PNG

The actual chart rendering happens client-side in the browser. The Playwright
step is just "open browser, run JS, screenshot."

Note: requires `playwright install chromium` to be run once on the host
before this module's render() can succeed. The dep is in pyproject.toml
modal extra, not the base install — we check at runtime and raise if missing.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

RendererProfile = Literal["ninjatrader_1min_dark", "tos_mobile_dark"]

RENDERER_VERSION = "0.1.0"

# Profile configs per spec §5.2
PROFILES: dict[RendererProfile, dict[str, object]] = {
    "ninjatrader_1min_dark": {
        "background_color": "#000000",
        "candle_up_color": "#26A69A",
        "candle_down_color": "#EF5350",
        "candle_style": "solid",  # not hollow
        "blue_cloud_color": "#2E86F0",
        "blue_cloud_alpha": 0.30,
        "yellow_cloud_color": "#E1A93D",
        "white_cloud_color": "#E5E5E5",
        "width": 1280,
        "height": 720,
        "show_volume": False,
    },
    "tos_mobile_dark": {
        "background_color": "#000000",
        "candle_up_color": "#26A69A",
        "candle_down_color": "#EF5350",
        "candle_style": "tos_hollow",  # green candles are hollow when close > open
        "blue_cloud_color": "#3498DB",  # slightly different hue per platform
        "blue_cloud_alpha": 0.30,
        "yellow_cloud_color": "#E1A93D",
        "white_cloud_color": "#E5E5E5",
        "width": 750,
        "height": 900,  # mobile cropped
        "show_volume": True,
    },
}


@dataclass(frozen=True)
class RenderRequest:
    """One render invocation."""
    candidate_id: str
    profile: RendererProfile
    ohlcv: list[dict[str, float]]  # bars: each {time, open, high, low, close, volume?}
    ema_72: list[dict[str, float]]
    ema_89: list[dict[str, float]]
    ema_216: list[dict[str, float]]
    ema_267: list[dict[str, float]]
    ema_720: list[dict[str, float]]
    ema_890: list[dict[str, float]]
    output_path: Path


@dataclass(frozen=True)
class RenderResult:
    candidate_id: str
    profile: RendererProfile
    output_path: Path
    width: int
    height: int
    renderer_version: str


class PlaywrightNotInstalled(Exception):
    """Raised when playwright is missing OR browser binaries not installed."""


def _template_html_path() -> Path:
    return Path(__file__).resolve().parent / "lightweight_charts_template.html"


async def render(request: RenderRequest) -> RenderResult:
    """Render one chart frame to PNG.

    Async because Playwright's Python API is async-first. Use asyncio.run() to
    wrap from sync code.
    """
    try:
        from playwright.async_api import async_playwright  # type: ignore[import-not-found]
    except ImportError as e:
        raise PlaywrightNotInstalled(
            "playwright not installed; run `pip install playwright && playwright install chromium`"
        ) from e

    profile_config = PROFILES[request.profile]
    payload = {
        "profile": request.profile,
        "config": profile_config,
        "ohlcv": request.ohlcv,
        "ema_72": request.ema_72,
        "ema_89": request.ema_89,
        "ema_216": request.ema_216,
        "ema_267": request.ema_267,
        "ema_720": request.ema_720,
        "ema_890": request.ema_890,
    }

    width = int(profile_config["width"])
    height = int(profile_config["height"])

    template_path = _template_html_path()
    if not template_path.exists():
        raise FileNotFoundError(f"renderer template missing: {template_path}")

    request.output_path.parent.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            context = await browser.new_context(viewport={"width": width, "height": height})
            page = await context.new_page()
            await page.goto(template_path.as_uri())
            await page.evaluate(
                f"window.renderChart({json.dumps(payload)})"
            )
            # Wait briefly for chart to settle (lightweight-charts emits a 'ready' event we could
            # also wait on, but 250ms is reliable in practice and avoids JS-bridge edge cases)
            await page.wait_for_timeout(250)
            await page.locator("body").screenshot(
                path=str(request.output_path), type="png"
            )
        finally:
            await browser.close()

    return RenderResult(
        candidate_id=request.candidate_id,
        profile=request.profile,
        output_path=request.output_path,
        width=width,
        height=height,
        renderer_version=RENDERER_VERSION,
    )
