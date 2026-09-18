"""
Adds polities that are missing from the scraped Wikipedia list but appear on the
map, so they are not left as grey gaps. Each entry is hand-written and sourced.

Run after add_iso.py and before add_political_date.py:
    python3 add_extras.py
"""
import json

WIKI = "https://en.wikipedia.org/wiki/"

# Rule for inclusion: UN members and observers get entries from the Wikipedia
# list. Beyond that, a polity gets an entry when it is recognised by at least
# one UN member state AND controls most of the territory it claims. That adds
# Taiwan, Northern Cyprus, Somaliland, Abkhazia and South Ossetia. Transnistria
# (no UN-member recognition) and the Sahrawi Republic (controls only a strip of
# Western Sahara) stay hatched as disputed areas without dates.
#
# The iso_a3 codes ABK and SOS are not ISO codes; they are the ids used for the
# polygons in data/disputed.topo.json.
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
        "recognition": "Recognised by 12 UN members; claimed by China",
        "sources": [
            WIKI + "Republic_of_China_(1912–1949)",
            WIKI + "Retrocession_Day",
        ],
    },
    {
        "country": "Northern Cyprus",
        "continent": "Europe",
        "sovereignty_date": "1983-11-15",
        "sovereignty_date_precision": "full",
        "sovereignty_date_raw": "15 November 1983",
        "last_subordination_date": "1983-11-15",
        "last_subordination_date_precision": "full",
        "last_subordination_date_raw": "15 November 1983",
        "previous_power": "Cyprus",
        "notes": "1983–present: Turkish Republic of Northern Cyprus. 1975–1983: Turkish "
                 "Federated State of Cyprus, following the 1974 Turkish invasion.",
        "capital": "North Nicosia",
        "iso_a3": "CYN",
        "recognition": "Recognised only by Turkey; claimed by Cyprus",
        "sources": [
            WIKI + "Northern_Cyprus",
            WIKI + "Turkish_invasion_of_Cyprus",
        ],
    },
    {
        "country": "Somaliland",
        "continent": "Africa",
        "sovereignty_date": "1960-06-26",
        "sovereignty_date_precision": "full",
        "sovereignty_date_raw": "26 June 1960",
        "last_subordination_date": "1991-05-18",
        "last_subordination_date_precision": "full",
        "last_subordination_date_raw": "18 May 1991",
        "previous_power": "Somalia",
        "notes": "1991–present: Republic of Somaliland. 1960–1991: part of Somalia. "
                 "26 June–1 July 1960: State of Somaliland, independent from the UK.",
        "capital": "Hargeisa",
        "iso_a3": "SOL",
        "recognition": "Recognised by Israel (2025); claimed by Somalia",
        "sources": [
            WIKI + "Somaliland",
            WIKI + "State_of_Somaliland",
            WIKI + "Israel–Somaliland_relations",
        ],
    },
    {
        "country": "Abkhazia",
        "continent": "Asia/Europe",
        "sovereignty_date": "1992-07-23",
        "sovereignty_date_precision": "full",
        "sovereignty_date_raw": "23 July 1992",
        "last_subordination_date": "1993-09-30",
        "last_subordination_date_precision": "full",
        "last_subordination_date_raw": "30 September 1993",
        "previous_power": "Georgia",
        "notes": "1992–present: Republic of Abkhazia (self-declared). Georgian forces "
                 "withdrew at the end of the 1992–1993 war.",
        "capital": "Sukhumi",
        "iso_a3": "ABK",
        "recognition": "Recognised by 5 UN members incl. Russia; claimed by Georgia",
        "sources": [
            WIKI + "Abkhazia",
            WIKI + "War_in_Abkhazia_(1992–1993)",
            WIKI + "International_recognition_of_Abkhazia_and_South_Ossetia",
        ],
    },
    {
        "country": "South Ossetia",
        "continent": "Asia/Europe",
        "sovereignty_date": "1991-11-28",
        "sovereignty_date_precision": "full",
        "sovereignty_date_raw": "28 November 1991",
        "last_subordination_date": "1992-06-24",
        "last_subordination_date_precision": "full",
        "last_subordination_date_raw": "24 June 1992",
        "previous_power": "Georgia",
        "notes": "1991–present: Republic of South Ossetia (self-declared). The Sochi "
                 "agreement of 24 June 1992 ended the 1991–1992 war.",
        "capital": "Tskhinvali",
        "iso_a3": "SOS",
        "recognition": "Recognised by 5 UN members incl. Russia; claimed by Georgia",
        "sources": [
            WIKI + "South_Ossetia",
            WIKI + "1991–1992_South_Ossetia_War",
            WIKI + "International_recognition_of_Abkhazia_and_South_Ossetia",
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
