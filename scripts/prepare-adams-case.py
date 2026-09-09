"""Prepare attributed excerpts from the verified Gutenberg 34123 HTML edition.

Usage: python3 scripts/prepare-adams-case.py /path/to/34123-h.htm
Download the source URL in lib/adams-public-case.json before running.
"""

import hashlib
import html
import json
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
raw = Path(sys.argv[1]).read_bytes()
source = raw.decode("iso-8859-1").replace("\r\n", "\n").replace("\r", "\n")
records = []
selections = [
    (91, "1776-03-31", "Abigail Adams", "John Adams", "I long to hear that you have declared"),
    (94, "1776-04-14", "John Adams", "Abigail Adams", "As to your extraordinary code"),
    (102, "1776-05-07", "Abigail Adams", "John Adams", "I cannot say that I think you are very generous"),
]
license_section = re.findall(r"<pre[^>]*>(.*?)</pre>", source, re.S)[-1]
license_text = html.unescape(re.sub("<[^>]+>", "", license_section)).strip()
assert "FULL PROJECT GUTENBERG LICENSE" in license_text
output = root / "public/examples/adams"
output.mkdir(parents=True, exist_ok=True)
(output / "GUTENBERG-LICENSE.txt").write_text(license_text + "\n", encoding="utf-8", newline="\n")
for number, date, author, recipient, start in selections:
    section = re.search(r"<h2>" + str(number) + r"\..*?(?=<h2>)", source, re.S).group()
    matches = [p for p in re.findall(r"<p(?:\s[^>]*)?>(.*?)</p>", section, re.S) if start in p]
    assert len(matches) == 1, f"Ambiguous paragraph in letter {number}"
    paragraph = re.sub(r'<span class="pagenum">.*?</span>', "", matches[0], flags=re.S)
    excerpt = re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", "", paragraph))).strip()
    text = f"""{author} to {recipient}, {date}
Letter {number} (one selected paragraph; not the complete letter)

{excerpt}

Source: Familiar Letters of John Adams and His Wife Abigail Adams During the Revolution,
edited by Charles Francis Adams, Hurd and Houghton, 1876. Project Gutenberg ebook 34123.
https://www.gutenberg.org/ebooks/34123
https://www.gutenberg.org/files/34123/34123-h/34123-h.htm

Public domain in the USA. Wording of this digital edition; line breaks normalized and
printed-page markers removed. Other paragraphs are omitted. The digital edition reports
punctuation and printer-error corrections. This is not a manuscript transcription.

Produced by Carla Foust and the Online Distributed Proofreading Team at https://www.pgdp.net
from public-domain scans. No endorsement by the archive or editors is implied.

This eBook is for the use of anyone anywhere at no cost and with almost no restrictions
whatsoever. You may copy it, give it away or re-use it under the terms of the Project
Gutenberg License included with this eBook or online at www.gutenberg.org

{license_text}
"""
    (output / f"letter-{number}.txt").write_text(text, encoding="utf-8", newline="\n")
    records.append({"id": f"letter-{number}", "number": number, "date": date,
                    "author": author, "recipient": recipient, "excerpt": excerpt,
                    "file": f"/examples/adams/letter-{number}.txt",
                    "sha256": hashlib.sha256(text.encode()).hexdigest()})
manifest = {
    "edition": "Charles Francis Adams (ed.), Familiar Letters, 1876",
    "sourceUrl": "https://www.gutenberg.org/files/34123/34123-h/34123-h.htm",
    "rightsUrl": "https://www.gutenberg.org/ebooks/34123",
    "sourceHtmlSha256": hashlib.sha256(raw).hexdigest(),
    "rights": "Public domain in the USA",
    "letters": records,
}
(root / "lib/adams-public-case.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print("Prepared three attributed excerpts and the source manifest.")
