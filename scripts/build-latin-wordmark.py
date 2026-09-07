"""Build the fixed Latin wordmark from the pinned OFL Google Sans Flex font.

Usage: python scripts/build-latin-wordmark.py /path/to/GoogleSansFlex.ttf
Requires fontTools and uharfbuzz, only when regenerating the artwork.
See public/brand/README.md for the source revision and license.
"""

import hashlib
import io
import json
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


root = Path(__file__).resolve().parent.parent
font_path = Path(sys.argv[1])
expected_sha256 = "c6d53424121196b81de816b8daccf200e285dd506df43766db3d7e8cdf06ee30"
if hashlib.sha256(font_path.read_bytes()).hexdigest() != expected_sha256:
    raise ValueError("Use the pinned Google Sans Flex font documented in public/brand/README.md")

font = instantiateVariableFont(TTFont(font_path), {
    "wght": 460, "opsz": 48, "ROND": 20, "wdth": 100, "GRAD": 0, "slnt": 0,
})
stream = io.BytesIO()
font.save(stream)
shaping_font = hb.Font(hb.Face(stream.getvalue()))
buffer = hb.Buffer()
buffer.add_str("canwoo")
buffer.guess_segment_properties()
hb.shape(shaping_font, buffer)

glyphs = font.getGlyphSet()
letters = []
x = 0
for info, position in zip(buffer.glyph_infos, buffer.glyph_positions):
    glyph = glyphs[font.getGlyphName(info.codepoint)]
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds
    offset_x = x + position.x_offset
    offset_y = position.y_offset
    letters.append((glyph, offset_x, offset_y,
                    (x_min + offset_x, y_min + offset_y,
                     x_max + offset_x, y_max + offset_y)))
    x += position.x_advance

x_min = min(letter[3][0] for letter in letters)
y_min = min(letter[3][1] for letter in letters)
x_max = max(letter[3][2] for letter in letters)
y_max = max(letter[3][3] for letter in letters)

# Match the Han artwork's visible ink height. Scale the complete shaped word
# uniformly, retaining native kerning, softened terminals and round-letter overshoot.
scale = 26 / (y_max - y_min)
width = round((x_max - x_min) * scale + 4, 3)
paths = []
for glyph, offset_x, offset_y, _ in letters:
    pen = SVGPathPen(glyphs, ntos=lambda value: format(round(value, 3), "g"))
    glyph.draw(TransformPen(pen, (scale, 0, 0, -scale,
                                 2 + (offset_x - x_min) * scale,
                                 3 + (y_max - offset_y) * scale)))
    paths.append(pen.getCommands())

art = {"width": width, "viewBox": f"0 0 {width} 32", "paths": paths}
(root / "lib/brand-latin.json").write_text(json.dumps(art, indent=2) + "\n")
body = "".join(f'<path d="{path}"/>' for path in paths)
(root / "public/brand/canwoo-wordmark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{art["viewBox"]}" '
    'role="img" aria-label="canwoo">'
    '<!-- Google Sans Flex, SIL OFL 1.1. See GoogleSans-OFL.txt. -->'
    f'<g fill="currentColor">{body}</g></svg>\n'
)
