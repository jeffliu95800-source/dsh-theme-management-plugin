"""Compose the four character-view SVGs into one 3D turnaround sheet:
front view frontmost and largest, back/side/top arranged around it with
soft ground shadows, each view labeled. Transparent background.

Usage: python3 compose_3d.py <model_dir> <out.svg>
"""
import re
import sys
import os

VIEWS = [
    ('back', '背面', 0.34, 600, 420, 0.75),
    ('side', '侧面', 0.40, 235, 570, 1.0),
    ('top', '俯视', 0.40, 985, 545, 1.0),
    ('front', '正面', 0.50, 600, 560, 1.0),
]


def extract_paths(svg_text):
    return re.findall(r'<path [^>]*/>', svg_text)


def view_size(svg_text):
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', svg_text)
    return (float(m.group(1)), float(m.group(2))) if m else (1.0, 1.0)


def main():
    model_dir = sys.argv[1]
    out = sys.argv[2]
    cache = {}
    for name, _, _, _, _, _ in VIEWS:
        p = os.path.join(model_dir, f'{name}.svg')
        cache[name] = (open(p, encoding='utf-8').read(), view_size(open(p, encoding='utf-8').read()))

    groups = []
    for name, label, scale, cx, cy, opacity in VIEWS:
        text, (w, h) = cache[name]
        paths = extract_paths(text)
        inner = '\n'.join(paths)
        # center the view at (cx, cy): translate so the view's own center maps there
        groups.append(
            f'  <g transform="translate({cx - w * scale / 2} {cy - h * scale / 2}) scale({scale})" opacity="{opacity}">\n'
            f'    {inner}\n'
            '  </g>'
        )
        # ground shadow
        sw = w * scale * 0.55
        groups.append(
            f'  <ellipse cx="{cx}" cy="{cy + h * scale / 2 + 14}" rx="{sw}" ry="{sw * 0.14}" '
            f'fill="rgba(0,0,0,0.18)"/>'
        )
        groups.append(
            f'  <text x="{cx}" y="{cy + h * scale / 2 + 40}" text-anchor="middle" '
            f'font-size="26" fill="rgba(0,0,0,0.55)" font-family="PingFang SC, sans-serif">{label}</text>'
        )

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 940" width="1200" height="940">\n'
        + '\n'.join(groups)
        + '\n</svg>\n'
    )
    with open(out, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f'wrote {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
