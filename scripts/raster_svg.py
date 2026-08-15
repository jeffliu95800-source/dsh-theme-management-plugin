"""Embed a white-background photo as a transparent PNG inside an SVG wrapper.

Unlike `vectorize.py` (which flattens to a few colors and can leave noise on
photo gradients), this keeps every original pixel: remove only the connected
white background, tight-crop to the figure, and inline the transparent PNG as
a base64 `<image>` — zero noise, full clarity.

Usage: python3 raster_svg.py <image-or-dir> [outdir]
"""
import sys
import os
import io
import base64
from collections import deque
from PIL import Image

BG_TOLERANCE = 30      # remove ONLY the connected white/background
WHITE_CROP = 235       # crop pixels with all channels >= this (near-white halo)
CROP_PAD = 3


def remove_background(rgba, tolerance=BG_TOLERANCE):
    w, h = rgba.size
    px = rgba.load()
    corner = px[0, 0]
    visited = [[False] * w for _ in range(h)]
    stack = deque()
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    def close(p):
        return abs(p[0] - corner[0]) <= tolerance and abs(p[1] - corner[1]) <= tolerance and abs(p[2] - corner[2]) <= tolerance

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        p = px[x, y]
        if p[3] == 0 or not close(p):
            continue
        visited[y][x] = True
        px[x, y] = (p[0], p[1], p[2], 0)
        stack.append((x + 1, y))
        stack.append((x - 1, y))
        stack.append((x, y + 1))
        stack.append((x, y - 1))
    return rgba


def crop_to_content(rgba, threshold=WHITE_CROP, pad=CROP_PAD):
    """Crop to pixels that are opaque AND not near-white (the figure, not the halo)."""
    w, h = rgba.size
    px = rgba.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] > 0 and min(p[0], p[1], p[2]) < threshold:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < minx:
        return rgba
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w - 1, maxx + pad)
    maxy = min(h - 1, maxy + pad)
    return rgba.crop((minx, miny, maxx + 1, maxy + 1))


def raster_svg(path, out_svg):
    rgba = Image.open(path).convert('RGBA')
    rgba = remove_background(rgba)
    rgba = crop_to_content(rgba)
    w, h = rgba.size
    buf = io.BytesIO()
    rgba.save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
           f'  <image href="data:image/png;base64,{b64}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>\n'
           '</svg>\n')
    open(out_svg, 'w', encoding='utf-8').write(svg)
    print(f'  {os.path.basename(out_svg)}: viewBox {w}x{h}, {os.path.getsize(out_svg)} bytes')


def main():
    target = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else (target if os.path.isdir(target) else os.path.dirname(target))
    os.makedirs(outdir, exist_ok=True)
    exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'}
    if os.path.isdir(target):
        files = [f for f in sorted(os.listdir(target)) if os.path.splitext(f)[1].lower() in exts]
        items = [(os.path.join(target, f), os.path.join(outdir, os.path.splitext(f)[0] + '.svg')) for f in files]
    else:
        items = [(target, os.path.join(outdir, os.path.splitext(os.path.basename(target))[0] + '.svg'))]
    for src, out in items:
        print(f'== {os.path.basename(src)} -> {os.path.basename(out)}')
        raster_svg(src, out)


if __name__ == '__main__':
    main()
