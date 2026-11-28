"""Draw the AI;DR app icons: the ";" mark in light, dark and tinted looks.

    python3 apps/ios/scripts/make-app-icon.py

Writes AppIcon.png, AppIcon-Dark.png and AppIcon-Tinted.png (1024x1024 RGB,
no alpha, as App Store Connect requires) into
AIDR/Resources/Assets.xcassets/AppIcon.appiconset. iOS applies the corner
mask and the Liquid Glass treatment itself.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SIZE = 1024
SCALE = 4  # draw large, then downsample for clean edges
BIG = SIZE * SCALE

ios = Path(__file__).resolve().parent.parent
FONT = ios / "AIDR/Resources/Fonts/Inter-Bold.ttf"
OUT = ios / "AIDR/Resources/Assets.xcassets/AppIcon.appiconset"


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def gradient(top, bottom):
    """Vertical gradient from top to bottom color."""
    a, b = hex_rgb(top), hex_rgb(bottom)
    column = Image.new("RGB", (1, BIG))
    for y in range(BIG):
        t = y / (BIG - 1)
        column.putpixel((0, y), tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return column.resize((BIG, BIG))


def glow(color, strength):
    """Soft light from the top left, as if lit from above."""
    light = Image.new("L", (BIG, BIG), 0)
    ImageDraw.Draw(light).ellipse(
        (-BIG * 0.35, -BIG * 0.45, BIG * 0.85, BIG * 0.55), fill=int(255 * strength)
    )
    light = light.filter(ImageFilter.GaussianBlur(BIG * 0.12))
    return Image.new("RGB", (BIG, BIG), color), light


def mark_mask():
    """The ";" glyph, optically centered, as an L mask."""
    font = ImageFont.truetype(str(FONT), int(BIG * 0.72))
    mask = Image.new("L", (BIG, BIG), 0)
    draw = ImageDraw.Draw(mask)
    left, top, right, bottom = draw.textbbox((0, 0), ";", font=font)
    x = (BIG - (right - left)) / 2 - left + BIG * 0.012  # the tail leans left
    y = (BIG - (bottom - top)) / 2 - top + BIG * 0.02
    draw.text((x, y), ";", font=font, fill=255)
    return mask


def icon(top, bottom, ink, shadow_alpha, light_strength):
    base = gradient(top, bottom)
    light, light_mask = glow("#ffffff", light_strength)
    base = Image.composite(light, base, light_mask)
    mask = mark_mask()
    shadow = mask.filter(ImageFilter.GaussianBlur(BIG * 0.018))
    shadow = ImageChops.offset(shadow, 0, int(BIG * 0.014)).point(
        lambda v: int(v * shadow_alpha)
    )
    base = Image.composite(Image.new("RGB", (BIG, BIG), "#000000"), base, shadow)
    base = Image.composite(Image.new("RGB", (BIG, BIG), ink), base, mask)
    return base.resize((SIZE, SIZE), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
looks = {
    # Brand yellow (--brand #f5c518) warming to amber at the bottom.
    "AppIcon.png": icon("#ffd84d", "#efb400", "#0a0a0a", 0.22, 0.28),
    # Night: the yellow mark on warm black.
    "AppIcon-Dark.png": icon("#24211a", "#0a0a0a", "#f5c518", 0.5, 0.06),
    # Tinted: iOS recolors a grayscale image, so keep it light on dark.
    "AppIcon-Tinted.png": icon("#3a3a3a", "#141414", "#f2f2f2", 0.5, 0.05).convert("L").convert("RGB"),
}
for name, image in looks.items():
    image.save(OUT / name)
    print(OUT / name)
