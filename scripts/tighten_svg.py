"""Post-process a traced SVG: tight-crop the viewBox to the content bounding
box (fixes the character being rendered small inside a big canvas) and drop
speckle paths whose bounding box is tiny (reduces noise).

Only handles M/L/Z polygon paths (the format `scripts/vectorize.py` emits).

Usage: python3 tighten_svg.py <in.svg> <out.svg>
"""
import sys
import re

NUM = r'-?\d+(?:\.\d+)?'


def all_coords(d):
    """Yield (x, y) pairs of all vertices in an M/L/Z path string."""
    pairs = []
    for m in re.finditer(rf'[ML]\s*({NUM})\s+({NUM})', d, re.I):
        pairs.append((float(m.group(1)), float(m.group(2))))
    return pairs


def shift_d(d, ox, oy):
    def rep(m):
        x = float(m.group(2)) - ox
        y = float(m.group(3)) - oy
        return f'{m.group(1)} {x:.2f} {y:.2f}'
    return re.sub(rf'([ML])\s+({NUM})\s+({NUM})', rep, d, flags=re.I)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    svg = open(src, encoding='utf-8').read()
    paths = re.findall(r'<path [^>]*/>', svg)

    kept = []
    gx0 = gy0 = float('inf')
    gx1 = gy1 = float('-inf')
    for p in paths:
        dm = re.search(r'd="([^"]*)"', p)
        if not dm:
            kept.append(p)
            continue
        coords = all_coords(dm.group(1))
        if not coords:
            kept.append(p)
            continue
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        if (maxx - minx) * (maxy - miny) < 64:
            continue  # speckle
        kept.append(p)
        gx0 = min(gx0, minx)
        gy0 = min(gy0, miny)
        gx1 = max(gx1, maxx)
        gy1 = max(gy1, maxy)

    if gx1 < gx0:
        print('no content')
        return
    pad = 4
    ox, oy = gx0 - pad, gy0 - pad
    w = gx1 - gx0 + pad * 2
    h = gy1 - gy0 + pad * 2

    shifted = []
    for p in kept:
        dm = re.search(r'd="([^"]*)"', p)
        newd = shift_d(dm.group(1), ox, oy) if dm else ''
        shifted.append(p.replace(f'd="{dm.group(1)}"', f'd="{newd}"') if dm else p)

    out = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" width="{w:.2f}" height="{h:.2f}">\n'
           + '\n'.join(shifted) + '\n</svg>\n')
    open(dst, 'w', encoding='utf-8').write(out)
    print(f'{dst}: viewBox 0 0 {w:.0f} {h:.0f}, {len(kept)}/{len(paths)} paths, {len(out)} bytes')


if __name__ == '__main__':
    main()
