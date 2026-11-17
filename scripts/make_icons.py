#!/usr/bin/env python3
"""Generate Moonpetal PWA icons: glowing moon + moonpetal, drawn with PIL."""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size, maskable=False):
    img = Image.new("RGB", (size * 2, size * 2), (23, 18, 58))
    draw = ImageDraw.Draw(img, "RGBA")
    W = size * 2

    # vertical gradient sky
    top = (26, 18, 74)
    mid = (23, 18, 58)
    bottom = (16, 12, 44)
    for y in range(W):
        t = y / W
        c = lerp(top, mid, t / 0.6) if t < 0.6 else lerp(mid, bottom, (t - 0.6) / 0.4)
        draw.line([(0, y), (W, y)], fill=c)

    # stars
    import random

    rng = random.Random(51)
    for _ in range(60):
        x, y = rng.uniform(0, W), rng.uniform(0, W * 0.75)
        r = rng.uniform(1.2, 3.4)
        a = int(rng.uniform(90, 200))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(232, 236, 255, a))

    # moon glow
    glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    cx, cy, mr = W * 0.64, W * 0.34, W * 0.14
    for i in range(9):
        rr = mr * (1.1 + i * 0.28)
        alpha = int(26 * (1 - i / 9))
        gdraw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 214, 140, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(W * 0.02))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # moon
    draw.ellipse([cx - mr, cy - mr, cx + mr, cy + mr], fill=(246, 237, 210, 255))
    draw.ellipse([cx - mr * 0.28, cy - mr * 0.2, cx + mr * 0.3, cy + mr * 0.5], fill=(214, 196, 152, 140))

    # moonpetal flower (bottom-left): petals + crescent core
    fx, fy, fr = W * 0.34, W * 0.72, W * 0.11
    # halo
    halo = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(halo)
    for i in range(8):
        rr = fr * (1.5 + i * 0.35)
        alpha = int(30 * (1 - i / 8))
        hdraw.ellipse([fx - rr, fy - rr, fx + rr, fy + rr], fill=(185, 167, 255, alpha))
    halo = halo.filter(ImageFilter.GaussianBlur(W * 0.02))
    img = Image.alpha_composite(img.convert("RGBA"), halo).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    petals = [(255, 203, 255, 255), (203, 178, 255, 255), (222, 205, 255, 255)]
    for i in range(6):
        ang = math.pi * 2 * i / 6 - math.pi / 2
        tip = (fx + math.cos(ang) * fr * 1.75, fy + math.sin(ang) * fr * 1.75)
        side1 = (fx + math.cos(ang - 0.45) * fr * 0.6, fy + math.sin(ang - 0.45) * fr * 0.6)
        side2 = (fx + math.cos(ang + 0.45) * fr * 0.6, fy + math.sin(ang + 0.45) * fr * 0.6)
        draw.polygon([side1, tip, side2], fill=petals[i % 3])
    # core
    draw.ellipse([fx - fr * 0.62, fy - fr * 0.62, fx + fr * 0.62, fy + fr * 0.62], fill=(255, 242, 200, 255))
    # sleepy eyes
    er = fr * 0.1
    for ex in (-fr * 0.22, fr * 0.22):
        draw.arc([fx + ex - er, fy - er, fx + ex + er, fy + er], 15, 165, fill=(60, 45, 90, 255), width=max(2, int(fr * 0.09)))
    # blush
    for bx in (-fr * 0.4, fr * 0.4):
        draw.ellipse([fx + bx - fr * 0.12, fy + fr * 0.08 - fr * 0.06, fx + bx + fr * 0.12, fy + fr * 0.08 + fr * 0.06], fill=(255, 170, 170, 120))

    # sparkles
    for sx, sy, sr in [(W * 0.8, W * 0.62, 5), (W * 0.18, W * 0.3, 4), (W * 0.52, W * 0.5, 3.4)]:
        draw.line([(sx - sr, sy), (sx + sr, sy)], fill=(255, 246, 216, 230), width=2)
        draw.line([(sx, sy - sr), (sx, sy + sr)], fill=(255, 246, 216, 230), width=2)

    if maskable:
        # scale content into the 80% safe zone
        img = img.resize((int(size * 1.6), int(size * 1.6)), Image.LANCZOS)
        pad = Image.new("RGB", (size, size), (23, 18, 58))
        off = (size - int(size * 1.6)) // 2
        pad.paste(img, (off, off))
        return pad.resize((size, size), Image.LANCZOS)
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, sz, mask in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-180.png", 180, False), ("maskable-512.png", 512, True)]:
        make_icon(sz, mask).save(os.path.join(OUT, name), "PNG")
        print("wrote", name)


if __name__ == "__main__":
    main()
