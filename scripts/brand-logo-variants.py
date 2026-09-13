#!/usr/bin/env python3
"""Make the transparent and dark-theme variants of the brand logo.

  python3 scripts/brand-logo-variants.py [apps/web/public/brand/logo.png]

Writes next to it:
  logo-transparent.png  — the white ground removed (alpha), everything else as is
  logo-dark.png         — transparent AND the ink lettering lifted to paper white,
                          the highlighter kept, for dark surfaces
and copies logo.png into packages/reports/assets/ for the PDF cover.

White removal is edge-connected (flood fill with tolerance) so the white
inside letter counters goes too but the near-white paper texture inside a
stroke does not punch holes. Anti-aliased edges keep partial alpha by
distance from white.
"""
import os, sys
from collections import deque
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'apps', 'web', 'public', 'brand', 'logo.png')
if not os.path.isfile(src):
    sys.exit(f'no logo at {src} — place the PNG there first (docs/design/brand.md)')
im = Image.open(src).convert('RGBA')
W, H = im.size
px = im.load()

def whiteness(p):  # 0 = far from white, 1 = white
    r, g, b, a = p
    return min(r, g, b) / 255.0

# 1. edge-connected white → transparent (with soft edge)
alpha = [[255] * W for _ in range(H)]
seen = [[False] * W for _ in range(H)]
q = deque()
for x in range(W):
    q.append((x, 0)); q.append((x, H - 1))
for y in range(H):
    q.append((0, y)); q.append((W - 1, y))
THRESH = 0.88   # ≥ this much white counts as background
SOFT = 0.70     # between SOFT and THRESH: partial alpha (anti-aliased edges)
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= W or y >= H or seen[y][x]:
        continue
    seen[y][x] = True
    w = whiteness(px[x, y])
    if w >= THRESH:
        alpha[y][x] = 0
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    elif w >= SOFT:
        alpha[y][x] = int(255 * (THRESH - w) / (THRESH - SOFT))
transparent = Image.new('RGBA', (W, H))
tp = transparent.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        tp[x, y] = (r, g, b, min(a, alpha[y][x]))
out_dir = os.path.dirname(src)
transparent.save(os.path.join(out_dir, 'logo-transparent.png'))

# 2. dark variant: ink → paper, highlighter untouched
dark = transparent.copy()
dp = dark.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = dp[x, y]
        if a == 0:
            continue
        lum = (r + g + b) / 3
        sat = max(r, g, b) - min(r, g, b)
        if sat < 60 and lum < 140:          # the black/charcoal lettering and binary
            t = lum / 140.0                  # keep a little of the marker's texture
            v = int(235 + (255 - 235) * (1 - t))
            dp[x, y] = (v, v, v, a)
dark.save(os.path.join(out_dir, 'logo-dark.png'))

# 3. the PDF copy
pdf_dir = os.path.join(os.path.dirname(__file__), '..', 'packages', 'reports', 'assets')
os.makedirs(pdf_dir, exist_ok=True)
im.save(os.path.join(pdf_dir, 'logo.png'))
print('wrote logo-transparent.png, logo-dark.png; copied logo.png for the PDF')
