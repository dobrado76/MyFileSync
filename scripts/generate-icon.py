"""Generate MyFileSync icons.

Windows taskbar uses 16/20/24/32/40/48. Each size is drawn for that pixel grid
(or supersampled), then embedded in the ICO. Saving a 16px image as the ICO
source drops every larger size; Windows then stretches 16px and the icon looks
soft.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parents[1] / "build"
RENDERER_PNG = Path(__file__).resolve().parents[1] / "src" / "renderer" / "icon.png"

ICO_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)

FOLDER_TOP = (96, 178, 255, 255)
FOLDER_BOT = (16, 86, 196, 255)
TAB = (168, 214, 255, 255)
WHITE = (255, 255, 255, 255)
SHADOW = (8, 24, 56, 80)


def lerp(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def vertical_gradient(size: tuple[int, int], top: tuple[int, ...], bottom: tuple[int, ...]) -> Image.Image:
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    last = max(h - 1, 1)
    for y in range(h):
        color = lerp(top, bottom, y / last)
        for x in range(w):
            px[x, y] = color
    return img


def folder_mask(s: int) -> Image.Image:
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    pad = max(1, round(s * 0.12))
    tab_h = max(2, round(s * 0.13))
    tab_w = max(4, round(s * 0.36))
    body_top = pad + max(1, round(tab_h * 0.45))
    radius = max(1, round(s * 0.11))
    tab_r = max(1, round(s * 0.08))
    d.rounded_rectangle([pad, pad, pad + tab_w, body_top + tab_r], radius=tab_r, fill=255)
    d.rounded_rectangle([pad, body_top, s - pad, s - pad], radius=radius, fill=255)
    return mask


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    length: int,
    thick: int,
    right: bool,
    fill: tuple[int, ...],
) -> None:
    head = max(thick + 1, round(thick * 1.7))
    shaft = max(2, length - head)
    r = max(1, thick // 2)
    if right:
        draw.rounded_rectangle([x, y - r, x + shaft, y + r + (thick % 2)], radius=r, fill=fill)
        draw.polygon(
            [(x + shaft - 1, y - head), (x + length, y), (x + shaft - 1, y + head)],
            fill=fill,
        )
        return
    draw.rounded_rectangle([x - shaft, y - r, x, y + r + (thick % 2)], radius=r, fill=fill)
    draw.polygon(
        [(x - shaft + 1, y - head), (x - length, y), (x - shaft + 1, y + head)],
        fill=fill,
    )


def paint_small(s: int) -> Image.Image:
    """Integer-pixel folder + two chevrons for 16–24px taskbar slots."""
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if s <= 16:
        d.rectangle([2, 1, 8, 3], fill=TAB)
        d.rectangle([2, 3, 13, 14], fill=FOLDER_BOT)
        d.rectangle([2, 3, 13, 7], fill=FOLDER_TOP)
        d.polygon([(4, 5), (8, 7), (4, 9)], fill=WHITE)
        d.polygon([(11, 8), (7, 10), (11, 12)], fill=WHITE)
        return img
    if s <= 20:
        d.rectangle([2, 2, 10, 5], fill=TAB)
        d.rectangle([2, 4, 17, 17], fill=FOLDER_BOT)
        d.rectangle([2, 4, 17, 9], fill=FOLDER_TOP)
        d.polygon([(4, 7), (10, 10), (4, 13)], fill=WHITE)
        d.polygon([(15, 10), (9, 13), (15, 16)], fill=WHITE)
        return img
    d.rounded_rectangle([2, 2, 12, 6], radius=1, fill=TAB)
    d.rounded_rectangle([2, 5, 21, 21], radius=2, fill=FOLDER_BOT)
    d.rounded_rectangle([2, 5, 21, 12], radius=2, fill=FOLDER_TOP)
    d.polygon([(5, 8), (12, 12), (5, 16)], fill=WHITE)
    d.polygon([(18, 12), (11, 16), (18, 20)], fill=WHITE)
    return img


def paint_large(s: int) -> Image.Image:
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    mask = folder_mask(s)

    if s >= 64:
        shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        pad = round(s * 0.12)
        sd.ellipse([pad, int(s * 0.74), s - pad, int(s * 0.97)], fill=SHADOW)
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1.5, s * 0.04)))
        img = Image.alpha_composite(img, shadow)

    fill = vertical_gradient((s, s), FOLDER_TOP, FOLDER_BOT)
    folder = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    folder.paste(fill, (0, 0), mask)
    img = Image.alpha_composite(img, folder)

    d = ImageDraw.Draw(img)
    pad = max(1, round(s * 0.12))
    body_top = pad + max(2, round(s * 0.15 * 0.45))
    tab_w = max(4, round(s * 0.40))
    d.rounded_rectangle(
        [pad, pad, pad + tab_w, body_top + max(1, round(s * 0.08))],
        radius=max(1, round(s * 0.08)),
        fill=TAB,
    )

    cx = s // 2
    length = max(8, round(s * 0.42))
    thick = max(3, round(s * 0.075))
    gap = max(4, round(s * 0.16))
    mid_y = pad + (s - pad * 2) // 2 + round(s * 0.06)
    shadow_blue = (8, 48, 120, 160)
    draw_arrow(d, cx - round(s * 0.02), mid_y - gap // 2 + max(1, s // 80), length, thick, True, shadow_blue)
    draw_arrow(d, cx + round(s * 0.02), mid_y + gap // 2 + max(1, s // 80), length, thick, False, shadow_blue)
    draw_arrow(d, cx - round(s * 0.02), mid_y - gap // 2, length, thick, True, WHITE)
    draw_arrow(d, cx + round(s * 0.02), mid_y + gap // 2, length, thick, False, WHITE)
    return img


def render(size: int) -> Image.Image:
    if size <= 24:
        return paint_small(size)
    hi = size * 8
    return paint_large(hi).resize((size, size), Image.Resampling.LANCZOS)


def write_ico(path: Path, frames: list[Image.Image]) -> None:
    ordered = sorted(frames, key=lambda im: im.size[0])
    largest = ordered[-1]
    largest.save(
        path,
        format="ICO",
        sizes=[frame.size for frame in ordered],
        append_images=ordered[:-1],
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frames = [render(size) for size in ICO_SIZES]
    by_size = {frame.size[0]: frame for frame in frames}

    png_path = OUT_DIR / "icon.png"
    ico_path = OUT_DIR / "icon.ico"
    by_size[256].save(png_path, format="PNG")
    by_size[256].save(RENDERER_PNG, format="PNG")
    write_ico(ico_path, frames)

    ico = Image.open(ico_path)
    sizes = sorted(ico.ico.sizes()) if hasattr(ico, "ico") else []
    print(f"wrote {png_path}")
    print(f"wrote {ico_path} sizes={sizes}")
    print(f"wrote {RENDERER_PNG}")
    if (16, 16) not in sizes or (32, 32) not in sizes or (256, 256) not in sizes:
        raise SystemExit(f"ICO is missing sizes: {sizes}")


if __name__ == "__main__":
    main()
