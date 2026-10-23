"""Render the home hero's night sky band as pre-dithered WebP tiles.

The dark band (assets/home.css, .tv__screen::before) spans only a few 8-bit
steps per channel, so the CSS gradient shows grain in Chrome (its dithering)
and bands in Safari. These tiles carry the same gradient with even,
colour-neutral noise; home.css lays them over the CSS gradient, which paints
until they arrive.

Colours come from the dark block in assets/theme.css; the stops below must
match the dark .tv__screen::before rules in assets/home.css. Re-run after
changing either, and since .webp is cached for a month without revalidating,
bump VERSION (it names the files) and point home.css at the new names.

    python3 tools/night_band.py      # needs cwebp (brew install webp)
"""
import random, re, struct, subprocess, tempfile, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "sky"
SCALE = 2  # device pixels per CSS pixel; 1x screens downsample, 3x upsample
VERSION = 3


def dark_tokens():
    css = (ROOT / "assets" / "theme.css").read_text()
    block = re.search(r':root\[data-theme="dark"\] \{(.*?)\n\}', css, re.S).group(1)
    def rgb(name):
        h = re.search(rf"--{name}: #([0-9A-Fa-f]{{6}});", block).group(1)
        return [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return rgb("bg"), rgb("sky"), rgb("sky-mid"), rgb("sky-high")


def colour(stops, d):
    """The CSS gradient at d CSS px above the band's bottom edge."""
    for (d0, c0), (d1, c1) in zip(stops, stops[1:]):
        if d <= d1:
            t = (d - d0) / (d1 - d0)
            return [a + (b - a) * t for a, b in zip(c0, c1)]
    return stops[-1][1]


def png(width, height, stops):
    rnd = random.Random(1)
    rows = []
    for y in range(height):
        c = colour(stops, (height - y - 0.5) / SCALE)
        row = bytearray([0])
        for _ in range(width):
            n = rnd.random()  # one value for all three channels: no colour speckle
            row += bytes(min(255, int(v + n)) for v in c)
        rows.append(bytes(row))
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")


def main():
    bg, sky, mid, high = dark_tokens()
    OUT.mkdir(exist_ok=True)
    # (file, tile width in CSS px, horizon, dusk, top): home.css's dark desktop and phone stops.
    for name, w, horizon, dusk, top in [("night-band-800", 128, 380, 640, 800), ("night-band-520", 64, 190, 370, 520)]:
        stops = [(0, bg), (horizon, sky), (dusk, mid), (top, high)]
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            tmp.write(png(w * SCALE, top * SCALE, stops))
            tmp.flush()
            dest = OUT / f"{name}-v{VERSION}.webp"
            subprocess.run(["cwebp", "-quiet", "-lossless", "-z", "9", tmp.name, "-o", str(dest)], check=True)
        print(dest.relative_to(ROOT), dest.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
