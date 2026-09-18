"""
Adds entities that are missing from the scraped Wikipedia list but appear on the
map, so they are not left as grey gaps. Each entry is hand-written and sourced.

Run after add_iso.py and before add_political_date.py:
    python3 add_extras.py
"""
import json

WIKI = "https://en.wikipedia.org/wiki/"

EXTRAS = [
    {
        "country": "Taiwan",
        "continent": "Asia",
        "sovereignty_date": "1912-01-01",
        "sovereignty_date_precision": "full",
        "sovereignty_date_raw": "1 January 1912",
        "last_subordination_date": "1945-10-25",
        "last_subordination_date_precision": "full",
        "last_subordination_date_raw": "25 October 1945",
        "previous_power": "Japan",
        "notes": "1912–present: Republic of China (governing Taiwan since 1945, "
                 "based in Taipei since 1949). 1895–1945: Japanese rule of Taiwan.",
        "capital": "Taipei",
        "iso_a3": "TWN",
        "sources": [
            WIKI + "Republic_of_China_(1912–1949)",
            WIKI + "Retrocession_Day",
        ],
    },
]


def main():
    with open("data/countries.json", encoding="utf-8") as f:
        data = json.load(f)
    have = {e.get("iso_a3") for e in data}
    added = 0
    for extra in EXTRAS:
        if extra["iso_a3"] not in have:
            data.append(extra)
            added += 1
    with open("data/countries.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Added {added} entries; total {len(data)}")


if __name__ == "__main__":
    main()
