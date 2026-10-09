"""Generates AiFoundIt brand assets from the DESIGN.md palette.

Glyph: a magnifier lens framing a document - "found it".
Run: python scripts/generate-icon.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"
ICON_DIR = ROOT / "assets" / "expo.icon" / "Assets"

AMBER = (0x8B, 0x50, 0x00, 0xFF)        # colors.primary
CREAM = (0xFF, 0xDC, 0xBE, 0xFF)        # colors.primary-container
PAPER = (0xFB, 0xFA, 0xF8, 0xFF)        # colors.surface
BLACK = (0x00, 0x00, 0x00, 0xFF)

# Glyph geometry in a unit space. The lens disc is the anchor at (0.45, 0.44).
DISC = (0.45, 0.44)
DISC_R = 0.27
HANDLE_ANGLE = math.radians(45)
HANDLE_INSET = 0.05
HANDLE_LEN = 0.17
HANDLE_W = 0.11
DOC_W, DOC_H, DOC_R = 0.16, 0.205, 0.028
FOLD = 0.055
LINE_W = 0.018
LINES = [(0.405, 0.495, 0.445), (0.405, 0.468, 0.490)]  # x0, x1, y

SS = 4  # supersample factor


def glyph_bbox_extent():
    """Farthest glyph point from the disc center, in unit space."""
    reach = DISC_R + HANDLE_LEN + HANDLE_W / 2
    end = (
        DISC[0] + reach * math.cos(HANDLE_ANGLE),
        DISC[1] + reach * math.sin(HANDLE_ANGLE),
    )
    return max(
        DISC_R,
        math.dist(DISC, end),
    )


def draw_glyph(size, scale, center, fg):
    """Render the glyph into a transparent canvas of `size` px.

    `scale` maps unit space to px. `center` is where the disc center lands.
    `fg` fills the magnifier; the document inside is punched out transparent.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def pt(x, y):
        return (center[0] + (x - DISC[0]) * scale, center[1] + (y - DISC[1]) * scale)

    cx, cy = center
    r = DISC_R * scale
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fg)

    r0 = (DISC_R - HANDLE_INSET) * scale
    r1 = (DISC_R + HANDLE_LEN) * scale
    hx0 = cx + r0 * math.cos(HANDLE_ANGLE)
    hy0 = cy + r0 * math.sin(HANDLE_ANGLE)
    hx1 = cx + r1 * math.cos(HANDLE_ANGLE)
    hy1 = cy + r1 * math.sin(HANDLE_ANGLE)
    w = int(HANDLE_W * scale)
    d.line([hx0, hy0, hx1, hy1], fill=fg, width=w)
    d.ellipse([hx1 - w / 2, hy1 - w / 2, hx1 + w / 2, hy1 + w / 2], fill=fg)

    dw, dh, dr = DOC_W * scale, DOC_H * scale, DOC_R * scale
    dx0, dy0 = cx - dw / 2, cy - dh / 2
    hole = (0, 0, 0, 0)
    d.rounded_rectangle([dx0, dy0, dx0 + dw, dy0 + dh], radius=dr, fill=hole)

    fold = FOLD * scale
    corner = (dx0 + dw, dy0)
    d.polygon(
        [corner, (corner[0] - fold, corner[1]), (corner[0], corner[1] + fold)],
        fill=fg,
    )

    lw = int(LINE_W * scale)
    for x0, x1, y in LINES:
        a = pt(x0, y)
        b = pt(x1, y)
        d.line([a, b], fill=fg, width=lw)
        for p in (a, b):
            d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=fg)

    return img


def render(canvas, disc_center, scale, fg):
    """Draw the glyph at 4x and downscale for clean edges."""
    big = canvas * SS
    img = draw_glyph(big, scale * SS, (disc_center * SS, disc_center * SS), fg)
    return img.resize((canvas, canvas), Image.LANCZOS)


def rounded_square(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


def main():
    reach = glyph_bbox_extent()

    # Master icon: full-bleed amber rounded square, cream glyph inside the
    # inscribed circle so legacy round crops never clip the handle.
    size = 1024
    icon = rounded_square(size, 192, AMBER)
    scale = (size / 2 - 32) / reach
    icon.alpha_composite(render(size, size / 2, scale, CREAM))
    icon.save(IMAGES / "icon.png")

    # Adaptive foreground: transparent, glyph inside the 66dp safe circle
    # (r = 33/108 of canvas), with a small margin.
    fg_img = render(size, size / 2, (size * 33 / 108 - 8) / reach, CREAM)
    fg_img.save(IMAGES / "android-icon-foreground.png")

    Image.new("RGBA", (size, size), AMBER).save(IMAGES / "android-icon-background.png")

    # Themed-icon monochrome: Android reads the alpha channel.
    mono = render(432, 216, (432 * 33 / 108 - 8) / reach, BLACK)
    mono.save(IMAGES / "android-icon-monochrome.png")

    # Splash: amber glyph on transparent, shown over the paper splash color.
    splash = render(512, 256, (512 * 0.5) / reach, AMBER)
    splash.save(IMAGES / "splash-icon.png")

    fav = rounded_square(48, 10, AMBER)
    fav.alpha_composite(render(48, 24, (24 - 3) / reach, CREAM))
    fav.save(IMAGES / "favicon.png")

    print("wrote:", *[p.name for p in sorted(IMAGES.glob("*.png")) if p.stat().st_mtime], sep="\n  ")


if __name__ == "__main__":
    main()
