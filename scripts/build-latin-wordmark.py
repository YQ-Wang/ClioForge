"""Outline the fixed ClioForge wordmark using Geist Sans 1.800 (SIL OFL 1.1).

Usage: python scripts/build-latin-wordmark.py [path/to/geist-latin.woff2]
Requires fontTools and Brotli. Normal app builds use the checked-in geometry.
See docs/clioforge-brand.md for the pinned source and regeneration workflow.
"""

import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "scripts/brand/Geist-Latin.woff2"
expected = "9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608"
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise ValueError("Use the pinned Geist Sans Latin font in docs/clioforge-brand.md")
font = instantiateVariableFont(TTFont(source), {"wght": 600}, inplace=True)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
tracking = -20  # -0.02 em: compact enough for the navigation, with open counters.
letters = []
x = 0
for character in "clioforge":
    name = cmap[ord(character)]
    glyph = glyphs[name]
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    letters.append((glyph, x, bounds.bounds))
    x += font["hmtx"].metrics[name][0] + tracking

x_min = min(x + bounds[0] for _, x, bounds in letters)
x_max = max(x + bounds[2] for _, x, bounds in letters)
y_min = min(bounds[1] for _, _, bounds in letters)
y_max = max(bounds[3] for _, _, bounds in letters)
scale = 28 / (y_max - y_min)
width = round((x_max - x_min) * scale + 4, 3)
paths = []
for glyph, x, _ in letters:
    pen = SVGPathPen(glyphs, ntos=lambda value: format(round(value, 3), "g"))
    glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, 2 + (x - x_min) * scale, 2 + y_max * scale)))
    paths.append(pen.getCommands())
art = {"viewBox": f"0 0 {width} 32", "paths": paths}
(root / "lib/brand-latin.json").write_text(json.dumps(art, indent=2) + "\n")
