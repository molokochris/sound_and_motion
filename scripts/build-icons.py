"""Slice generated art into favicon / PWA / Open Graph assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC_ICON = Path(
    r"C:\Users\User\.grok\sessions\C%3A%5CUsers%5CUser%5C.grok%5Cworktrees%5Cdev-sound-and-motion%5Cjoust-game\019fffc1-1bc2-7212-9ede-685066fd9e2e\images\2.jpg"
)
SRC_OG = Path(
    r"C:\Users\User\.grok\sessions\C%3A%5CUsers%5CUser%5C.grok%5Cworktrees%5Cdev-sound-and-motion%5Cjoust-game\019fffc1-1bc2-7212-9ede-685066fd9e2e\images\1.jpg"
)
OUT = ROOT / "public"
NAVY = (11, 14, 35, 255)
GOLD = (255, 200, 87, 255)
LAVA = (230, 57, 70, 255)
PARCH = (244, 233, 216, 255)


def square_navy(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # flatten the white rounded-corner padding into the night background
            if r > 230 and g > 230 and b > 230:
                px[x, y] = NAVY
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def save_png(im: Image.Image, path: Path, size: int) -> None:
    out = im.resize((size, size), Image.Resampling.LANCZOS)
    out.save(path, "PNG")
    print("wrote", path.name, out.size)


def pick_font(size: int) -> ImageFont.ImageFont:
    for name in (
        "C:\\Windows\\Fonts\\impact.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ):
        p = Path(name)
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def draw_centered(draw: ImageDraw.ImageDraw, text, y, font, fill, shadow=None):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (1200 - tw) // 2
    if shadow:
        draw.text((x + 4, y + 4), text, font=font, fill=shadow)
    draw.text((x, y), text, font=font, fill=fill)


def build_og(src: Path, dest: Path) -> None:
    base = Image.open(src).convert("RGBA")
    base = base.resize((1200, 630), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rectangle((0, 0, 1200, 170), fill=(11, 14, 35, 170))
    d.rectangle((0, 500, 1200, 630), fill=(11, 14, 35, 160))
    title = pick_font(86)
    sub = pick_font(28)
    draw_centered(d, "SKYJOUST", 36, title, GOLD, LAVA)
    draw_centered(d, "Phones are the controllers. Last rider standing wins.", 530, sub, PARCH)
    composed = Image.alpha_composite(base, overlay).convert("RGB")
    composed.save(dest, "PNG", quality=95)
    print("wrote", dest.name, composed.size)


def main() -> None:
    icon = square_navy(Image.open(SRC_ICON))
    save_png(icon, OUT / "favicon-32.png", 32)
    save_png(icon, OUT / "apple-touch-icon.png", 180)
    save_png(icon, OUT / "icon-192.png", 192)
    save_png(icon, OUT / "icon-512.png", 512)
    ico16 = icon.resize((16, 16), Image.Resampling.LANCZOS)
    ico32 = icon.resize((32, 32), Image.Resampling.LANCZOS)
    ico48 = icon.resize((48, 48), Image.Resampling.LANCZOS)
    ico16.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico32, ico48])
    print("wrote favicon.ico")
    build_og(SRC_OG, OUT / "og-image.png")


if __name__ == "__main__":
    main()
