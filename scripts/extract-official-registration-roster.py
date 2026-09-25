#!/usr/bin/env python3
"""Extract the 115-year CEC registration summary PDFs into normalized JSON."""

import argparse
import json
import os
import re
import unicodedata

import pdfplumber


SOURCES = {
    "mayorMetro": ("mayor", "1-1(115年直轄市長選舉候選人登記彙總表).pdf"),
    "councilMetro": ("councilor", "2-1(115年直轄市議員選舉候選人登記彙總表).pdf"),
    "mayorCounty": ("mayor", "3-1(115年縣市長選舉候選人登記彙總表).pdf"),
    "councilCounty": ("councilor", "4-1(115年縣市議員選舉候選人登記彙總表).pdf"),
    "townMayorMetro": ("townMayor", "5-(115年直轄市山地原住民區長選舉候選人登記彙總表).pdf"),
    "representativeMetro": ("representative", "6-(115年直轄市山地原住民區民代表選舉候選人登記彙總表).pdf"),
    "townMayor": ("townMayor", "7-(115年鄉鎮市長選舉候選人登記彙總表).pdf"),
    "representative": ("representative", "8-(115年鄉鎮市民代表選舉候選人登記彙總表).pdf"),
    "village": ("village", "9-(115年村里長選舉候選人登記彙總表).pdf"),
}


def normalize(value):
    value = unicodedata.normalize("NFKC", str(value or "")).replace("台", "臺")
    return re.sub(r"[^\w\u3400-\u9fff]", "", value).lower()


def name_aliases(value):
    value = unicodedata.normalize("NFKC", str(value or ""))
    han_runs = re.findall(r"[\u3400-\u9fff]+", value)
    longest_han = max(han_runs, key=len) if han_runs else ""
    return sorted({item for item in (normalize(value), normalize(longest_han)) if item})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_directory")
    parser.add_argument("output_json")
    args = parser.parse_args()

    records = []
    for source, (category, filename) in SOURCES.items():
        source_path = os.path.join(args.pdf_directory, filename)
        if not os.path.exists(source_path):
            raise FileNotFoundError(source_path)
        with pdfplumber.open(source_path) as document:
            for page_number, page in enumerate(document.pages, 1):
                for table in page.extract_tables() or []:
                    for row in table:
                        if not row or len(row) < 4 or normalize(row[0]) == "選舉區" or not row[2]:
                            continue
                        area = "".join(str(row[0] or "").split())
                        name = " ".join(str(row[2] or "").split())
                        records.append({
                            "source": source,
                            "file": filename,
                            "page": page_number,
                            "category": category,
                            "area": area,
                            "areaKey": normalize(area),
                            "registeredDate": "".join(str(row[1] or "").split()),
                            "name": name,
                            "nameAliases": name_aliases(name),
                            "party": " ".join(str(row[3] or "").split()),
                        })

    with open(args.output_json, "w", encoding="utf-8") as output:
        json.dump({"records": records}, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(json.dumps({"records": len(records), "output": args.output_json}, ensure_ascii=False))


if __name__ == "__main__":
    main()
