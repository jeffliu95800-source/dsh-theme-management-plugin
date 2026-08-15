"""Convert character-view PNGs (black background) into flat-color vector SVGs.

Pure Pillow + marching-squares tracing: remove the connected background by
border flood-fill, median-cut quantize the character into a few colors, trace
each color's region into SVG paths (transparent background, crisp vectors —
the same look family as the hand-drawn Sakuragi poses).

Usage: python3 vectorize.py <outdir>
"""
import sys
import os
from collections import deque
from PIL import Image

VIEWS = {
    'front': '/Users/jeff/Downloads/凡人照片/韩立上.png',
    'side': '/Users/jeff/Downloads/凡人照片/韩立侧.png',
    'back': '/Users/jeff/Downloads/凡人照片/韩立后model.png',
    'top': '/Users/jeff/Downloads/凡人照片/IMG_1349.png',
}

BG_TOLERANCE = 40
TRACE_SCALE = 0.55     # trace at half resolution, then the SVG scales freely
COLORS = 12            # flat-color palette size
MIN_AREA = 12          # drop speckles smaller than this (scaled px^2)
EPS = 0.6              # Douglas-Peucker simplification epsilon (scaled px)


def remove_background(rgba: Image.Image, tolerance=BG_TOLERANCE) -> Image.Image:
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


def median_cut(pixels, n):
    """Median-cut quantize a list of (r,g,b) into n buckets -> (palette, ids)."""
    buckets = [pixels]
    while len(buckets) < n:
        def span(b):
            return (max(p[0] for p in b) - min(p[0] for p in b) +
                    max(p[1] for p in b) - min(p[1] for p in b) +
                    max(p[2] for p in b) - min(p[2] for p in b))
        bucket = max(buckets, key=span)
        if len(bucket) < 2:
            break
        axis = max(range(3), key=lambda i: max(p[i] for p in bucket) - min(p[i] for p in bucket))
        bucket.sort(key=lambda p: p[axis])
        mid = len(bucket) // 2
        buckets.remove(bucket)
        buckets.append(bucket[:mid])
        buckets.append(bucket[mid:])
    palette = []
    for b in buckets:
        ln = len(b)
        palette.append(tuple(round(sum(p[i] for p in b) / ln) for i in range(3)) if ln else (0, 0, 0))
    by_color = {}
    for idx, b in enumerate(buckets):
        for p in b:
            by_color[p] = idx
    return palette, by_color


def trace_mask(mask, w, h):
    """Marching squares on a 2D boolean grid; returns list of point lists (closed loops).

    The mask is padded with a border of background so every contour closes.
    Per cell: midpoints of transitioning edges are connected within the cell
    (two edges → one segment; the four-edge saddle → two diagonal segments).
    """
    pw, ph = w + 2, h + 2
    padded = [[False] * pw for _ in range(ph)]
    for y in range(h):
        for x in range(w):
            padded[y + 1][x + 1] = mask[y][x]

    segs = []
    for cy in range(ph - 1):
        row = padded[cy]
        row2 = padded[cy + 1]
        for cx in range(pw - 1):
            tl = 1 if row[cx] else 0
            tr = 1 if row[cx + 1] else 0
            bl = 1 if row2[cx] else 0
            br = 1 if row2[cx + 1] else 0
            pts = []
            if tl != tr:
                pts.append((cx + 0.5, cy))
            if tr != br:
                pts.append((cx + 1, cy + 0.5))
            if bl != br:
                pts.append((cx + 0.5, cy + 1))
            if tl != bl:
                pts.append((cx, cy + 0.5))
            if len(pts) == 2:
                segs.append((pts[0], pts[1]))
            elif len(pts) == 4:
                segs.append((pts[0], pts[2]))
                segs.append((pts[1], pts[3]))

    # Link segments into closed loops: each grid-edge midpoint is touched by
    # exactly two cell segments (one from each adjacent cell), so walking from
    # segment to segment by shared endpoint closes the ring.
    key = lambda p: (round(p[0] * 2), round(p[1] * 2))
    from collections import defaultdict
    touch = defaultdict(list)
    for idx, (s, t) in enumerate(segs):
        touch[key(s)].append(idx)
        touch[key(t)].append(idx)
    used = [False] * len(segs)
    loops = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        a, b = segs[i]
        loop = [a, b]
        tail = b
        while True:
            nxt = None
            for j in touch[key(tail)]:
                if not used[j]:
                    nxt = j
                    break
            if nxt is None or key(tail) == key(loop[0]):
                break
            used[nxt] = True
            s, t = segs[nxt]
            if key(s) == key(tail):
                loop.append(t)
                tail = t
            else:
                loop.append(s)
                tail = s
        # shift loop points back into unpadded coordinates
        loops.append([(x - 1, y - 1) for x, y in loop])
    return loops


def simplify(points, eps):
    if len(points) <= 3:
        return points
    # Douglas-Peucker on the closed loop (points[0] == points[-1] conceptually)
    pts = points[:-1] if len(points) > 1 and points[0] == points[-1] else points
    if len(pts) <= 2:
        return points

    def dist(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        qx, qy = ax + t * dx, ay + t * dy
        return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5

    def dp(lo, hi):
        if hi - lo < 2:
            return [pts[lo], pts[hi]]
        dmax, idx = 0, -1
        for k in range(lo + 1, hi):
            d = dist(pts[k], pts[lo], pts[hi])
            if d > dmax:
                dmax, idx = d, k
        if dmax > eps:
            left = dp(lo, idx)
            right = dp(idx, hi)
            return left[:-1] + right
        return [pts[lo], pts[hi]]

    kept = dp(0, len(pts) - 1)
    return kept + [kept[0]]


def area(points):
    s = 0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def polygon_d(points):
    return 'M ' + ' L '.join(f'{x:.2f} {y:.2f}' for x, y in points) + ' Z'


def vectorize(path, out_svg, ncolors=COLORS):
    rgba = Image.open(path).convert('RGBA')
    rgba = remove_background(rgba)
    w, h = rgba.size
    tw, th = max(1, int(w * TRACE_SCALE)), max(1, int(h * TRACE_SCALE))
    small = rgba.resize((tw, th), Image.LANCZOS)
    spx = small.load()

    # opaque pixel colors for quantization
    opaque = []
    for y in range(th):
        for x in range(tw):
            p = spx[x, y]
            if p[3] > 60:
                opaque.append((p[0], p[1], p[2]))
    if not opaque:
        print('  (no opaque pixels)')
        return
    palette, by_color = median_cut(opaque, ncolors)

    # group pixels by bucket -> masks
    masks = {i: [[False] * tw for _ in range(th)] for i in range(len(palette))}
    for y in range(th):
        for x in range(tw):
            p = spx[x, y]
            if p[3] > 60:
                idx = by_color[(p[0], p[1], p[2])]
                masks[idx][y][x] = True

    parts = []
    for idx in range(len(palette)):
        mask = masks[idx]
        loops = trace_mask(mask, tw, th)
        paths = []
        for loop in loops:
            simp = simplify(loop, EPS)
            if area(simp) < MIN_AREA:
                continue
            paths.append(polygon_d(simp))
        if paths:
            r, g, b = palette[idx]
            parts.append(f'  <path fill="rgb({r},{g},{b})" d="{" ".join(paths)}"/>')

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n'
        + '\n'.join(parts)
        + '\n</svg>\n'
    )
    with open(out_svg, 'w', encoding='utf-8') as f:
        f.write(svg)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(outdir, exist_ok=True)
    for name, path in VIEWS.items():
        out = os.path.join(outdir, f'{name}.svg')
        print(f'== {name}: {os.path.basename(path)} -> {out}')
        vectorize(path, out)
        print(f'   wrote {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
