#!/usr/bin/env python3
"""Rasterize the brand icon (same geometry as apps/web/app/icon.svg) with Pillow:
favicon.ico (16/32/48), apple-icon.png (180), icon-512.png. No fonts, no SVG
renderer needed — the mark is rectangles on a 32-unit grid."""
from PIL import Image, ImageDraw
import math, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
INK, HL, PAPER = (0x2b, 0x2f, 0x36, 255), (0xe6, 0xff, 0x3b, 255), (255, 255, 255, 255)
RECTS = [(6,5,9,2),(8,5,5,21),(8,22,11,4),(19,20,2,2),(21,23,2,2),(23,20,2,2),(24,25,2,2),(27,22,2,2),(26,18,1.5,1.5),(29,26,1.5,1.5)]

def render(size: int, supersample: int = 8) -> Image.Image:
    S = size * supersample
    u = S / 32.0
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(6 * u), fill=PAPER)
    # highlighter band, rotated -4° about its centre (like the SVG transform)
    band = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle([3 * u, 16 * u, 28 * u, 23 * u], fill=HL)
    band = band.rotate(4, resample=Image.BICUBIC, center=(15.5 * u, 19.5 * u))
    img.alpha_composite(band)
    for (x, y, w, h) in RECTS:
        d.rectangle([x * u, y * u, (x + w) * u, (y + h) * u], fill=INK)
    return img.resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    app = os.path.join(ROOT, 'apps', 'web', 'app')
    pub = os.path.join(ROOT, 'apps', 'web', 'public', 'brand')
    os.makedirs(pub, exist_ok=True)
    icons = {s: render(s) for s in (16, 32, 48, 180, 512)}
    # Pillow keeps only sizes ≤ the base frame: save from the 48 px frame.
    icons[48].save(os.path.join(app, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[icons[16], icons[32]])
    icons[180].convert('RGB').save(os.path.join(app, 'apple-icon.png'))
    icons[512].save(os.path.join(pub, 'icon-512.png'))
    icons[32].save(os.path.join(pub, 'icon-32.png'))
    print('wrote favicon.ico (16/32/48), apple-icon.png (180), icon-512.png, icon-32.png')
