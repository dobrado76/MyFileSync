"""Generate MyFileSync app icons (PNG + multi-size ICO). Run from repo root."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

HI = 2048
SIZE = 1024
OUT_DIR = Path(__file__).resolve().parents[1] / "build"

BLUE = (37, 112, 214, 255)
WHITE = (255, 255, 255, 255)
SHEET = (168, 210, 255, 255)


def draw_folder(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, fill: tuple[int, ...]) -> None:
    tab_h = int(h * 0.18)
    tab_w = int(w * 0.4)
    r = max(16, w // 11)
    draw.rounded_rectangle([x, y, x + tab_w, y + tab_h + r], radius=r, fill=fill)
    draw.rounded_rectangle([x, y + tab_h, x + w, y + h], radius=int(r * 1.2), fill=fill)


def draw_arrow_right(draw: ImageDraw.ImageDraw, x: int, y: int, length: int, thick: int, fill: tuple[int, ...]) -> None:
    head = int(thick * 1.85)
    shaft_h = thick
    shaft_w = length - head + 2
    draw.rounded_rectangle([x, y - shaft_h // 2, x + shaft_w, y + shaft_h // 2], radius=shaft_h // 2, fill=fill)
    draw.polygon(
        [
            (x + shaft_w - 4, y - head),
            (x + length, y),
            (x + shaft_w - 4, y + head),
        ],
        fill=fill,
    )


def draw_arrow_left(draw: ImageDraw.ImageDraw, x: int, y: int, length: int, thick: int, fill: tuple[int, ...]) -> None:
    head = int(thick * 1.85)
    shaft_h = thick
    shaft_w = length - head + 2
    draw.rounded_rectangle([x - shaft_w, y - shaft_h // 2, x, y + shaft_h // 2], radius=shaft_h // 2, fill=fill)
    draw.polygon(
        [
            (4 - shaft_w + x, y - head),
            (x - length, y),
            (4 - shaft_w + x, y + head),
        ],
        fill=fill,
    )


def paint_hi() -> Image.Image:
    img = Image.new("RGBA", (HI, HI), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    inset = 96
    draw.rounded_rectangle([inset, inset, HI - inset, HI - inset], radius=464, fill=BLUE)

    draw_folder(draw, 536, 396, 1040, 860, SHEET)
    draw_folder(draw, 456, 496, 1040, 860, WHITE)

    # Swap arrows, centered on the white folder
    draw_arrow_right(draw, 620, 940, 340, 72, BLUE)
    draw_arrow_left(draw, 1430, 1120, 340, 72, BLUE)
    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = paint_hi().resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    png_path = OUT_DIR / "icon.png"
    ico_path = OUT_DIR / "icon.ico"
    src.save(png_path, format="PNG")

    renderer_png = Path(__file__).resolve().parents[1] / "src" / "renderer" / "icon.png"
    src.resize((256, 256), Image.Resampling.LANCZOS).save(renderer_png, format="PNG")

    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    frames = [src.resize(sz, Image.Resampling.LANCZOS) for sz in sizes]
    frames[0].save(ico_path, format="ICO", sizes=sizes, append_images=frames[1:])
    print(f"wrote {png_path}")
    print(f"wrote {ico_path}")
    print(f"wrote {renderer_png}")


if __name__ == "__main__":
    main()
