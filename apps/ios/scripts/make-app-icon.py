"""Draw the AI;DR app icon: the black ";" mark on the brand yellow.

    python3 apps/ios/scripts/make-app-icon.py

Writes AIDR/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png
(1024x1024, RGB with no alpha, as App Store Connect requires). iOS applies
the corner mask itself.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BRAND = "#f5c518"  # --brand in packages/ui/tokens.css
INK = "#0a0a0a"  # --signal-ink

ios = Path(__file__).resolve().parent.parent
font = ImageFont.truetype(str(ios / "AIDR/Resources/Fonts/Inter-Bold.ttf"), 620)
icon = Image.new("RGB", (SIZE, SIZE), BRAND)
draw = ImageDraw.Draw(icon)
left, top, right, bottom = draw.textbbox((0, 0), ";", font=font)
x = (SIZE - (right - left)) / 2 - left
y = (SIZE - (bottom - top)) / 2 - top
draw.text((x, y), ";", font=font, fill=INK)
out = ios / "AIDR/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
out.parent.mkdir(parents=True, exist_ok=True)
icon.save(out)
print(out)
