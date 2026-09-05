#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "liquid_glass_river_ppt" / "origin_image"
OUT = ROOT / "liquid_glass_river_ppt_website_demo"
IMG = OUT / "origin_image"
SECTION_IMAGE = Path(
    "/Users/johnzhang/.codex/generated_images/019eaf55-6eda-7071-939c-00dd54c8c3a2/"
    "ig_0f10c2f1770d4fcb016a2f4a8222488191a2de182b879eb006.png"
)

TITLE = "基于微积分切片思想与指数衰减模型的\n河流光催化净化动态仿真程序"
MEMBERS = "组员：刘品卓 (Pinzhuo Liu)、张之御 (Zhiyu Zhang)"


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def rounded_glass_layer(size: tuple[int, int], box: tuple[int, int, int, int], radius: int, alpha: int = 128) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    x1, y1, x2, y2 = box
    patch = Image.new("RGBA", (x2 - x1, y2 - y1), (229, 247, 255, alpha))
    patch = patch.filter(ImageFilter.GaussianBlur(0.2))
    mask = Image.new("L", patch.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, patch.size[0] - 1, patch.size[1] - 1), radius=radius, fill=255)
    layer.paste(patch, (x1, y1), mask)
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(box, radius=radius, outline=(239, 255, 255, 245), width=4)
    draw.rounded_rectangle((x1 + 10, y1 + 10, x2 - 10, y2 - 10), radius=max(12, radius - 10), outline=(126, 231, 255, 170), width=2)
    return layer


def draw_centered_lines(draw: ImageDraw.ImageDraw, lines: list[str], box: tuple[int, int, int, int], fnt: ImageFont.ImageFont) -> None:
    x1, y1, x2, y2 = box
    metrics = [draw.textbbox((0, 0), line, font=fnt, stroke_width=1) for line in lines]
    heights = [b[3] - b[1] for b in metrics]
    total_h = sum(heights) + 18 * (len(lines) - 1)
    y = y1 + ((y2 - y1) - total_h) / 2 - 4
    for line, bbox, h in zip(lines, metrics, heights):
        w = bbox[2] - bbox[0]
        x = x1 + ((x2 - x1) - w) / 2
        draw.text((x, y), line, font=fnt, fill=(8, 28, 62, 255), stroke_width=1, stroke_fill=(235, 251, 255, 180))
        y += h + 18


def make_cover() -> None:
    base = Image.open(SRC / "slide_01.png").convert("RGBA")
    w, h = base.size
    panel = (85, 255, w - 85, 510)
    base = Image.alpha_composite(base, rounded_glass_layer(base.size, panel, 34, alpha=248))
    draw = ImageDraw.Draw(base)
    title_font = font(62)
    draw_centered_lines(draw, TITLE.splitlines(), (panel[0] + 30, panel[1] + 20, panel[2] - 30, panel[3] - 20), title_font)

    member_font = font(31)
    text_bbox = draw.textbbox((0, 0), MEMBERS, font=member_font)
    text_w = text_bbox[2] - text_bbox[0]
    pill_w = text_w + 56
    pill_h = 58
    x2 = w - 58
    y2 = h - 40
    pill = (x2 - pill_w, y2 - pill_h, x2, y2)
    base = Image.alpha_composite(base, rounded_glass_layer(base.size, pill, 22, alpha=208))
    draw = ImageDraw.Draw(base)
    draw.text((pill[0] + 28, pill[1] + 12), MEMBERS, font=member_font, fill=(6, 31, 62, 255))
    base.convert("RGB").save(IMG / "slide_01.png", quality=96)


def copy_slide(src_num: int, dst_num: int) -> None:
    shutil.copy2(SRC / f"slide_{src_num:02d}.png", IMG / f"slide_{dst_num:02d}.png")


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    for old in IMG.glob("slide_*.png"):
        old.unlink()

    make_cover()
    for n in range(2, 17):
        copy_slide(n, n)

    shutil.copy2(SECTION_IMAGE, IMG / "slide_17.png")
    copy_slide(5, 18)
    copy_slide(14, 19)
    copy_slide(15, 20)
    copy_slide(20, 21)
    copy_slide(21, 22)
    copy_slide(22, 23)

    state = {
        "deck": "liquid_glass_river_ppt_website_demo",
        "slide_count": 23,
        "source": "Original non-Vibe slides reused unchanged; Vibe section replaced by website demo section.",
        "slides": [
            {"slide": 1, "source": "original slide_01 with exact title and member overlay"},
            *[{"slide": n, "source": f"original slide_{n:02d} reused unchanged"} for n in range(2, 17)],
            {"slide": 17, "source": "new generated website demo divider"},
            {"slide": 18, "source": "original slide_05 duplicated for website overview demo"},
            {"slide": 19, "source": "original slide_14 duplicated for optimization demo"},
            {"slide": 20, "source": "original slide_15 duplicated for standard demo"},
            {"slide": 21, "source": "original slide_20 reused unchanged"},
            {"slide": 22, "source": "original slide_21 reused unchanged"},
            {"slide": 23, "source": "original slide_22 reused unchanged"},
        ],
    }
    (OUT / "deck_spec.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
