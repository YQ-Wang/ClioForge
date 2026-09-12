#!/usr/bin/env python3
"""Audit the released CC BY 4.0 Franklin metadata; no model calls.

Run: npm run research:benchmark
The frozen fixture is checked offline; no model or network access is needed.
The CSVs are scholarly metadata, not letter transcriptions. Date syntax is
measured precision in this release, not confidence in the original dating.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "tests" / "fixtures" / "franklin"
BASE = "https://stacks.stanford.edu/file/druid:wb524rz2367/"
FILES = ("Papers.csv", "People.csv", "Places.csv")


def read_table(name):
    path = DATA / name
    raw = path.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    return rows, {"file": name, "url": BASE + name, "bytes": len(raw),
                  "sha256": hashlib.sha256(raw).hexdigest(), "rows": len(rows)}


def count_rate(count, total):
    return {"count": count, "denominator": total,
            "percent": round(100 * count / total, 4)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    tables, inputs = {}, []
    for name in FILES:
        tables[name], manifest = read_table(name)
        inputs.append(manifest)
    rows = tables["Papers.csv"]
    total = len(rows)
    precision = collections.Counter()
    for row in rows:
        date = row["Letter Date"].strip()
        if re.fullmatch(r"\d{4}", date):
            precision["year_only"] += 1
        elif re.fullmatch(r"\d{4}-\d{1,2}", date):
            precision["year_month"] += 1
        elif re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", date):
            precision["day_shaped_string"] += 1
        else:
            precision["empty_or_other"] += 1
    missing = {field: count_rate(sum(not r[field].strip() for r in rows), total)
               for field in ("Letter Date", "SourceCity", "DestinationCity",
                             "Source", "Destination")}
    both_cities = sum(bool(r["SourceCity"].strip() and r["DestinationCity"].strip())
                      for r in rows)
    both_locations = sum(bool(r["Source"].strip() and r["Destination"].strip())
                         for r in rows)
    exact_franklin = sum(r["Author"].strip() == "Benjamin Franklin" for r in rows)
    inclusive_franklin = sum("Benjamin Franklin" in r["Author"].split(":") for r in rows)
    result = {
        "dataset": "https://purl.stanford.edu/wb524rz2367",
        "rights_metadata": "https://purl.stanford.edu/wb524rz2367.mods",
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Claire Rydell Arcenas and Caroline Winterer, Correspondence Network of Benjamin Franklin During the London Years: Letters, People, Places (2016), Stanford Digital Repository",
        "inputs": inputs,
        "distinct_document_ids": len({r["DocumentID"] for r in rows}),
        "date_string_precision": {key: count_rate(value, total) for key, value in sorted(precision.items())},
        "empty_fields": missing,
        "both_city_fields_present": count_rate(both_cities, total),
        "either_city_field_absent": count_rate(total - both_cities, total),
        "both_location_fields_present": count_rate(both_locations, total),
        "either_location_field_absent": count_rate(total - both_locations, total),
        "both_locations_present_but_city_pair_incomplete": count_rate(both_locations - both_cities, total),
        "franklin_author_exact_string": exact_franklin,
        "franklin_author_including_colon_delimited_coauthors": inclusive_franklin,
        "recipient_unspecified_literal": count_rate(sum(r["Recipient"] == "unspecified" for r in rows), total),
        "limitations": [
            "Counts describe the downloaded release, not all surviving letters or the whole Republic of Letters.",
            "The corpus includes documents other than letters. Empty places may be unknown or inapplicable; the script does not distinguish them.",
            "A day-shaped date does not prove exact dating: the schema describes replacing some date ranges with their beginning.",
            "Colon-delimited author tokens are counted as released; identities have not been independently adjudicated.",
            "No modern Yale letter texts or linked images were fetched; no LLM calls, productivity measurement, or historical discovery is claimed."
        ],
    }
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.check:
        expected = json.loads((DATA / "expected.json").read_text())
        if result != expected:
            raise SystemExit("Frozen corpus audit changed. Inspect source hashes and counting rules.")
        print(f"Franklin metadata benchmark passed: {total} documents, exact input hashes and scope counts match.")
    else:
        print(rendered)
    if args.output:
        args.output.write_text(rendered)


if __name__ == "__main__":
    main()
