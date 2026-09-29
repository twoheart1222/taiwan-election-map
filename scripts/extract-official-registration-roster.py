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


# The CEC PDF visually contains these names, but its embedded font omits their
# Unicode mapping.  pdfplumber therefore returns an empty name cell.  Keying the
# correction by area/date/party keeps the exception auditable and makes a future
# source change fail instead of silently dropping a candidate.
EMBEDDED_NAME_FIXES = {
    ("彰化縣伸港鄉第4選舉區", "115/09/02", "無"): "周如",
    ("南投縣名間鄉第4選舉區", "115/08/31", "無"): "易南",
    ("屏東縣東港鎮第3選舉區", "115/09/01", "無"): "洪銨",
    ("新北市三峽區插角里", "115/08/31", "無"): "簡梁",
    ("新北市淡水區新市里", "115/09/01", "中國國民黨"): "褚亞倫",
    ("新北市蘆洲區恆德里", "115/09/02", "中國國民黨"): "曾樺",
    ("臺中市東勢區中嵙里", "115/08/31", "無"): "王鎮樑",
    ("臺中市東勢區興隆里", "115/09/02", "無"): "蔡豐淙",
    ("臺中市后里區聯合里", "115/09/02", "無"): "曾銘",
    ("臺南市官田區渡拔里", "115/09/02", "無"): "賴禮",
    ("臺南市大內區石城里", "115/09/02", "無"): "楊進",
    ("臺南市將軍區長沙里", "115/08/31", "無"): "陳瑜",
    ("臺南市將軍區忠嘉里", "115/08/31", "無"): "黃惠",
    ("臺南市新化區崙頂里", "115/08/31", "無"): "高文",
    ("彰化縣秀水鄉埔崙村", "115/09/03", "無"): "蘇世",
    ("南投縣集集鎮林尾里", "115/08/31", "無"): "陳敏",
    ("雲林縣四湖鄉林厝村", "115/09/02", "無"): "林斌",
    ("嘉義縣大林鎮中坑里", "115/09/02", "無"): "簡榮",
    ("嘉義縣竹崎鄉仁壽村", "115/09/03", "無"): "葉",
    ("宜蘭縣壯圍鄉美城村", "115/09/01", "無"): "吳廉達",
    ("臺東縣臺東市豐原里", "115/09/02", "無"): "陳聰",
}

# A few rare village glyphs are visible in the first column but have no text
# mapping in the PDF.  The county/town portion still extracts correctly.
EMBEDDED_AREA_FIXES = {
    ("臺中市大安區", "115/09/02", "洪正義"): "臺中市大安區龜壳里",
    ("臺中市大安區", "115/09/04", "余連銓"): "臺中市大安區龜壳里",
    ("臺南市西港區", "115/09/02", "謝文賢"): "臺南市西港區檨林里",
    ("臺南市安南區", "115/09/02", "蘇龍池"): "臺南市安南區塭南里",
    ("臺南市安南區", "115/09/02", "林同寳"): "臺南市安南區塭南里",
    ("臺南市安南區", "115/09/01", "林宏男"): "臺南市安南區公塭里",
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
                        if not row or len(row) < 4 or normalize(row[0]) == "選舉區":
                            continue
                        area = "".join(str(row[0] or "").split())
                        registered_date = "".join(str(row[1] or "").split())
                        party = " ".join(str(row[3] or "").split())
                        name = " ".join(str(row[2] or "").split())
                        if not name:
                            name = EMBEDDED_NAME_FIXES.get((area, registered_date, party), "")
                        if not name:
                            raise ValueError(
                                f"Candidate name could not be extracted: {filename} "
                                f"page {page_number}, area={area!r}, date={registered_date!r}, party={party!r}"
                            )
                        area = EMBEDDED_AREA_FIXES.get((area, registered_date, name), area)
                        records.append({
                            "source": source,
                            "file": filename,
                            "page": page_number,
                            "category": category,
                            "area": area,
                            "areaKey": normalize(area),
                            "registeredDate": registered_date,
                            "name": name,
                            "nameAliases": name_aliases(name),
                            "party": party,
                        })

    village_count = sum(record["category"] == "village" for record in records)
    if village_count != 14100:
        raise ValueError(f"Expected 14,100 village candidates, extracted {village_count:,}")

    with open(args.output_json, "w", encoding="utf-8") as output:
        json.dump({"records": records}, output, ensure_ascii=False, indent=2)
        output.write("\n")
    print(json.dumps({"records": len(records), "output": args.output_json}, ensure_ascii=False))


if __name__ == "__main__":
    main()
