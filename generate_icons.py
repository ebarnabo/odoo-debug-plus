#!/usr/bin/env python3
"""Génère les icônes PNG (Pillow requis)."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit("Installe Pillow : pip install pillow") from exc

OUT = Path(__file__).resolve().parent / "icons"
OUT.mkdir(exist_ok=True)


def icon(size, bg, fg):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 18)
    d.rounded_rectangle(
        (pad, pad, size - 1 - pad, size - 1 - pad),
        radius=max(3, size // 5),
        fill=bg,
    )
    r = max(1, size // 10)
    gap = size / 5
    cx, cy = size / 2, size / 2 + size / 18
    for dx, dy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        x, y = cx + dx * gap * 0.55, cy + dy * gap * 0.45
        d.ellipse([x - r, y - r, x + r, y + r], fill=fg)
    return img


STATES = {
    "off": ((45, 36, 43, 255), (200, 190, 196, 255)),
    "on": ((113, 75, 103, 255), (255, 255, 255, 255)),
    "assets": ((1, 126, 132, 255), (255, 255, 255, 255)),
    "idle": ((143, 143, 143, 255), (245, 245, 245, 255)),
}

if __name__ == "__main__":
    for name, (bg, fg) in STATES.items():
        for s in (16, 32, 48, 128):
            icon(s, bg, fg).save(OUT / f"{name}_{s}.png")
    print("icons written in", OUT)
