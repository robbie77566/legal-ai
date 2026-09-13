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
# 1b. enclosed white regions (letter counters — the inside of an 'o', 'e',
# 'a') are not edge-connected; clear any white component bigger than a
# texture speckle so they do not show as filled discs on dark surfaces.
MIN_COUNTER = max(200, (W * H) // 20000)
for y0 in range(H):
    for x0 in range(W):
        if seen[y0][x0] or whiteness(px[x0, y0]) < THRESH:
            continue
        comp = []
        stack = [(x0, y0)]
        seen[y0][x0] = True
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and whiteness(px[nx, ny]) >= THRESH:
                    seen[ny][nx] = True
                    stack.append((nx, ny))
        if len(comp) >= MIN_COUNTER:
            for x, y in comp:
                alpha[y][x] = 0
            # soften the counter's edge the same way
            for x, y in comp:
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and alpha[ny][nx] == 255:
                        w = whiteness(px[nx, ny])
                        if w >= SOFT:
                            alpha[ny][nx] = int(255 * (THRESH - w) / (THRESH - SOFT))

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
        # Every grey pixel — the lettering, the binary AND their anti-aliased
        # edges — goes to paper; the edge keeps its alpha, so no dark rim
        # (the first cut lifted only lum < 140 and left a grey halo).
        if sat < 60:
            t = min(lum, 140) / 140.0        # a little of the marker's texture survives
            v = int(238 + (255 - 238) * (1 - t))
            dp[x, y] = (v, v, v, a)
dark.save(os.path.join(out_dir, 'logo-dark.png'))

# 3. the PDF copy
pdf_dir = os.path.join(os.path.dirname(__file__), '..', 'packages', 'reports', 'assets')
os.makedirs(pdf_dir, exist_ok=True)
im.save(os.path.join(pdf_dir, 'logo.png'))
# 4. the web copies are served unoptimized at ≤ 88 px tall: 1400 px wide is plenty
for name in ('logo.png', 'logo-transparent.png', 'logo-dark.png'):
    p = os.path.join(out_dir, name)
    w = Image.open(p)
    if w.width > 1400:
        w = w.resize((1400, round(w.height * 1400 / w.width)), Image.LANCZOS)
        w.save(p, optimize=True)
print('wrote logo-transparent.png, logo-dark.png (web ≤ 1400 px); copied full-size logo.png for the PDF')
