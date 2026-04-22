"""Generate Decorder extension icons. Re-run after editing the design."""

from PIL import Image, ImageDraw, ImageFilter


TOP = (99, 102, 241)      # indigo-500
BOTTOM = (124, 58, 237)   # violet-600
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def gradient_bg(size, radius):
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = bg.load()
    for y in range(size):
        t = y / max(1, size - 1)
        c = (lerp(TOP[0], BOTTOM[0], t), lerp(TOP[1], BOTTOM[1], t), lerp(TOP[2], BOTTOM[2], t), 255)
        for x in range(size):
            px[x, y] = c

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def draw_icon(size):
    radius = int(size * 0.22)
    img = gradient_bg(size, radius)

    # Work at 4x resolution for cleaner shapes, then downsample.
    S = size * 4
    fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(fg)

    # Microphone capsule
    cap_w = S * 0.26
    cap_h = S * 0.42
    cap_x = (S - cap_w) / 2
    cap_y = S * 0.16
    cap_r = cap_w / 2
    d.rounded_rectangle([cap_x, cap_y, cap_x + cap_w, cap_y + cap_h], radius=cap_r, fill=WHITE)

    # Mic arc (cradle) — draw thick arc
    cx = S / 2
    arc_r = S * 0.26
    arc_y = cap_y + cap_h * 0.55
    stroke = max(3, int(S * 0.05))
    d.arc([cx - arc_r, arc_y - arc_r, cx + arc_r, arc_y + arc_r],
          start=10, end=170, fill=WHITE, width=stroke)

    # Stem from arc down to base
    stem_top = arc_y + arc_r - stroke // 2
    stem_bottom = S * 0.84
    d.rounded_rectangle([cx - stroke / 2, stem_top, cx + stroke / 2, stem_bottom],
                        radius=stroke / 2, fill=WHITE)

    # Base bar
    base_w = S * 0.26
    base_h = stroke
    d.rounded_rectangle([cx - base_w / 2, stem_bottom - base_h / 2,
                          cx + base_w / 2, stem_bottom + base_h / 2],
                        radius=base_h / 2, fill=WHITE)

    # Downward chevron overlay on the capsule (suggests download)
    chev_cx = cx
    chev_cy = cap_y + cap_h * 0.60
    chev_w = cap_w * 0.55
    chev_h = cap_h * 0.18
    chev_stroke = max(3, int(S * 0.045))
    d.line([
        (chev_cx - chev_w / 2, chev_cy - chev_h / 2),
        (chev_cx, chev_cy + chev_h / 2),
        (chev_cx + chev_w / 2, chev_cy - chev_h / 2),
    ], fill=(TOP[0], TOP[1], TOP[2], 255), width=chev_stroke, joint="curve")

    fg = fg.resize((size, size), Image.LANCZOS)
    img.alpha_composite(fg)
    return img


def main():
    for s in (16, 32, 48, 128):
        draw_icon(s).save(f"icons/icon{s}.png")
        print(f"wrote icons/icon{s}.png")


if __name__ == "__main__":
    main()
