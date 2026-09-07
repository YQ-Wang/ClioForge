"""Build the fixed two-character wordmark from the pinned OFL font.

Usage: python scripts/build-han-wordmark.py /path/to/qiji.ttf
Requires fontTools. Font files are only needed when regenerating the artwork.
"""

import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


root = Path(__file__).resolve().parent.parent
font_path = Path(sys.argv[1])
expected_sha256 = "2ee30738d37b102bfa90e56cd04fde2620ccef012b44390b77b0703cf995cf5b"
if hashlib.sha256(font_path.read_bytes()).hexdigest() != expected_sha256:
    raise ValueError("Use the pinned Qiji font documented in public/brand/README.md")

font = TTFont(font_path)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
letters = []
for character in "參伍":
    glyph = glyphs[cmap[ord(character)]]
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds
    scale = 26 / (y_max - y_min)
    letters.append((glyph, x_min, y_max, scale, (x_max - x_min) * scale))

# Align visible ink, preserving each glyph's proportions and brush contours.
gap = 5
x = (64 - sum(letter[4] for letter in letters) - gap) / 2
paths = []
for glyph, x_min, y_max, scale, width in letters:
    pen = SVGPathPen(glyphs, ntos=lambda value: format(round(value, 3), "g"))
    glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x - x_min * scale, 3 + y_max * scale)))
    paths.append(pen.getCommands())
    x += width + gap

art = {"viewBox": "0 0 64 32", "paths": paths}
(root / "lib/brand-han.json").write_text(json.dumps(art, indent=2) + "\n")
body = "".join(f'<path d="{path}"/>' for path in paths)
(root / "public/brand/canwoo-han-wordmark.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" role="img" aria-label="參伍">'
    '<!-- Qiji, SIL OFL 1.1. See Qiji-OFL.txt. -->'
    f'<g fill="currentColor">{body}</g></svg>\n'
)
