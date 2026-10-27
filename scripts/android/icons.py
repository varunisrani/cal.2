#!/usr/bin/env python3
"""Draws the Android launcher icons and splash images from the web app's own icons.

    python3 scripts/android/icons.py

Reads public/icons/icon-512.png (the rounded tile), public/icons/icon-maskable-512.png (the
full-bleed version with everything that matters inside the central 80% circle) and the
background colour of public/manifest.webmanifest. Writes into android/app/src/main/res:

- mipmap-*/ic_launcher.png         the rounded tile, for launchers without adaptive icons
- mipmap-*/ic_launcher_round.png   the full-bleed icon cut to a circle
- mipmap-*/ic_launcher_foreground.png
                                   the adaptive icon's front layer: the full-bleed icon scaled so
                                   its safe circle fills Android's 66 dp safe zone of 108 dp
- values/ic_launcher_background.xml  the adaptive icon's back layer: the full-bleed icon's
                                   corner colour, so the two layers meet without a seam
- drawable*/splash.png             the rounded tile in the middle of the manifest background
- values/splash_background.xml     that background, for the launch and app themes

Needs Pillow. Running it twice writes the same pixels.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "public" / "icons"
MANIFEST = ROOT / "public" / "manifest.webmanifest"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Pixels per dp in each density bucket.
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

LAUNCHER_DP = 48
ADAPTIVE_DP = 108
ADAPTIVE_SAFE_DP = 66
# The web's maskable icons keep their drawing inside a circle of 80% of the width.
MASKABLE_SAFE_SHARE = 0.8

# Portrait splash sizes per density (landscape swaps them), and the plain drawable fallback.
SPLASH_PORTRAIT = {
    "mdpi": (320, 480),
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (960, 1600),
    "xxxhdpi": (1280, 1920),
}
SPLASH_FALLBACK = (480, 320)
# Width of the tile on a splash, as a share of the splash's shorter side.
SPLASH_ICON_SHARE = 0.36

GENERATED = "Written by scripts/android/icons.py from public/icons; run it again instead of editing."


def scaled(image: Image.Image, size: int) -> Image.Image:
    """Resizes with premultiplied alpha, so transparent edges do not turn dark."""
    return image.convert("RGBa").resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")


def circle_cut(image: Image.Image) -> Image.Image:
    """Keeps the pixels inside the inscribed circle, with a smooth edge (mask drawn at 4x)."""
    size = image.width
    big = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    mask = big.resize((size, size), Image.Resampling.LANCZOS)
    out = image.copy()
    out.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return out


def hex_colour(rgb: tuple[int, ...]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb[:3])


def parse_hex(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        raise ValueError(f"not a #rrggbb colour: {value!r}")
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def write_colour(path: Path, name: str, colour: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f"<!-- {GENERATED} -->\n"
        "<resources>\n"
        f'    <color name="{name}">{colour}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def launcher_icons(tile: Image.Image, full: Image.Image) -> None:
    for bucket, scale in DENSITIES.items():
        folder = RES / f"mipmap-{bucket}"
        side = round(LAUNCHER_DP * scale)
        save(scaled(tile, side), folder / "ic_launcher.png")
        save(circle_cut(scaled(full, side)), folder / "ic_launcher_round.png")

        canvas_side = round(ADAPTIVE_DP * scale)
        icon_side = round(canvas_side * (ADAPTIVE_SAFE_DP / ADAPTIVE_DP) / MASKABLE_SAFE_SHARE)
        layer = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
        offset = (canvas_side - icon_side) // 2
        layer.paste(scaled(full, icon_side), (offset, offset))
        save(layer, folder / "ic_launcher_foreground.png")


def splash(tile: Image.Image, background: tuple[int, int, int], width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), background + (255,))
    side = round(min(width, height) * SPLASH_ICON_SHARE)
    icon = scaled(tile, side)
    canvas.alpha_composite(icon, ((width - side) // 2, (height - side) // 2))
    return canvas.convert("RGB")


def splash_images(tile: Image.Image, background: tuple[int, int, int]) -> None:
    for bucket, (width, height) in SPLASH_PORTRAIT.items():
        save(splash(tile, background, width, height), RES / f"drawable-port-{bucket}" / "splash.png")
        save(splash(tile, background, height, width), RES / f"drawable-land-{bucket}" / "splash.png")
    save(splash(tile, background, *SPLASH_FALLBACK), RES / "drawable" / "splash.png")


def main() -> int:
    if not RES.is_dir():
        print(f"icons.py: {RES} is missing; run `pnpm exec cap add android` first", file=sys.stderr)
        return 2
    tile = Image.open(ICONS / "icon-512.png").convert("RGBA")
    full = Image.open(ICONS / "icon-maskable-512.png").convert("RGBA")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    background = parse_hex(manifest["background_color"])

    launcher_icons(tile, full)
    write_colour(RES / "values" / "ic_launcher_background.xml", "ic_launcher_background", hex_colour(full.getpixel((0, 0))))
    splash_images(tile, background)
    write_colour(RES / "values" / "splash_background.xml", "splash_background", hex_colour(background))
    print(f"icons.py: launcher icons and splash images written under {RES.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
