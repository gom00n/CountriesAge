"""
Adds political_date field to data/countries.json.
This represents "when the current political system was established" —
capturing major regime changes, revolutions, and democratization events
that the sovereignty/subordination dates miss.

Run once: python3 add_political_date.py
"""
import json
from datetime import datetime

# Manual curated list: iso_a3 → (year, description)
# Covers major regime changes, revolutions, constitutions, democratisation events.
# Sources: Wikipedia country history articles.
POLITICAL_DATES = {
    # ── Former communist / Eastern bloc (fell 1989–1993) ──────────────────────
    "ALB": (1992, "End of communism"),
    "BIH": (1992, "Independence from Yugoslavia"),
    "BGR": (1990, "End of communist rule"),
    "HRV": (1991, "Independence from Yugoslavia"),
    "CZE": (1993, "Czech Republic formed (dissolution of Czechoslovakia)"),
    "SVK": (1993, "Slovak Republic formed (dissolution of Czechoslovakia)"),
    "HUN": (1989, "End of communist rule, Third Republic"),
    "MDA": (1991, "Independence from USSR"),
    "MNE": (2006, "Independence from Serbia-Montenegro"),
    "POL": (1989, "End of communist rule, Third Polish Republic"),
    "ROU": (1989, "Revolution, end of communist dictatorship"),
    "SRB": (2006, "Independence, Republic of Serbia"),
    "SVN": (1991, "Independence from Yugoslavia"),
    "MKD": (1991, "Independence from Yugoslavia"),
    "KOS": (2008, "Independence from Serbia"),

    # ── Post-Soviet states (1991) ─────────────────────────────────────────────
    "ARM": (1991, "Independence from USSR"),
    "AZE": (1991, "Independence from USSR"),
    "BLR": (1991, "Independence from USSR"),
    "EST": (1991, "Independence from USSR restored"),
    "GEO": (1991, "Independence from USSR"),
    "KAZ": (1991, "Independence from USSR"),
    "KGZ": (1991, "Independence from USSR"),
    "LVA": (1991, "Independence from USSR restored"),
    "LTU": (1991, "Independence from USSR restored"),
    "RUS": (1991, "Russian Federation after dissolution of USSR"),
    "TJK": (1991, "Independence from USSR"),
    "TKM": (1991, "Independence from USSR"),
    "UKR": (1991, "Independence from USSR"),
    "UZB": (1991, "Independence from USSR"),

    # ── Revolutions & major regime changes ────────────────────────────────────
    "CHN": (1949, "People's Republic of China founded"),
    "CUB": (1959, "Cuban Revolution"),
    "IRN": (1979, "Islamic Revolution, Islamic Republic established"),
    "LBY": (2011, "End of Gaddafi regime"),
    "PRK": (1948, "Democratic People's Republic of Korea founded"),
    "VNM": (1975, "Reunification under communist government"),
    "LAO": (1975, "Pathet Lao takeover, Lao PDR established"),
    "KHM": (1993, "UNTAC elections, constitutional monarchy restored"),
    "MMR": (2011, "Transition from military junta to quasi-civilian government"),
    "AFG": (2021, "Taliban takeover"),
    "YEM": (1990, "Unification of North and South Yemen"),

    # ── Post-apartheid / democratisation ─────────────────────────────────────
    "ZAF": (1994, "End of apartheid, first free elections"),
    "NAM": (1990, "Independence from South Africa"),
    "ZWE": (1980, "Independence from Rhodesia / Zimbabwe"),

    # ── Post-WWII constitutions & new republics ───────────────────────────────
    "DEU": (1990, "German reunification"),
    "ITA": (1948, "Italian Republic, post-WWII constitution"),
    "JPN": (1947, "Post-war constitution in force"),
    "AUT": (1955, "State Treaty, sovereignty fully restored"),
    "GRC": (1974, "Restoration of democracy after military junta"),
    "ESP": (1978, "Constitution after Franco dictatorship"),
    "PRT": (1976, "Constitution after Carnation Revolution"),

    # ── Republic transitions in otherwise stable countries ────────────────────
    "FRA": (1958, "Fifth Republic established"),
    "TUR": (1923, "Republic of Turkey founded"),
    "IND": (1950, "Republic of India, constitution in force"),
    "PAK": (1947, "Independence from Britain"),
    "ISR": (1948, "State of Israel proclaimed"),
    "KOR": (1987, "Sixth Republic, democratic constitution"),
    "TWN": (1947, "Republic of China constitution (current form)"),

    # ── Recent independence / separation ──────────────────────────────────────
    "TLS": (2002, "East Timor independence"),
    "SDS": (2011, "South Sudan independence"),  # uses NE code
    "MNE": (2006, "Montenegro independence"),
    "ERI": (1993, "Eritrea independence from Ethiopia"),

    # ── Post-civil war / reconstruction ───────────────────────────────────────
    "SOM": (2012, "Federal Government of Somalia established"),
    "SLE": (1996, "Return to civilian rule after military junta"),
    "LBR": (2006, "Ellen Johnson Sirleaf, post-civil war democracy"),
    "RWA": (1994, "RPF government after genocide"),
    "AGO": (2002, "End of civil war"),
    "MOZ": (1994, "First multiparty elections after civil war"),
}

def load():
    with open("data/countries.json", encoding="utf-8") as f:
        return json.load(f)

def save(data):
    with open("data/countries.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    data = load()
    curated = 0
    fallback_sub = 0
    fallback_sov = 0

    for entry in data:
        iso = entry.get("iso_a3")
        if iso and iso in POLITICAL_DATES:
            year, desc = POLITICAL_DATES[iso]
            entry["political_date"] = str(year)
            entry["political_date_raw"] = str(year)
            entry["political_date_note"] = desc
            curated += 1
        else:
            # Fallback: use last_subordination_date if available, else sovereignty_date
            sub = entry.get("last_subordination_date") or entry.get("last_subordination_date_raw")
            sov = entry.get("sovereignty_date") or entry.get("sovereignty_date_raw")
            if sub:
                entry["political_date"] = sub
                entry["political_date_raw"] = entry.get("last_subordination_date_raw") or sub
                entry["political_date_note"] = ""
                fallback_sub += 1
            elif sov:
                entry["political_date"] = sov
                entry["political_date_raw"] = entry.get("sovereignty_date_raw") or sov
                entry["political_date_note"] = ""
                fallback_sov += 1
            else:
                entry["political_date"] = None
                entry["political_date_raw"] = None
                entry["political_date_note"] = ""

    save(data)
    print(f"Curated entries:         {curated}")
    print(f"Fallback subordination:  {fallback_sub}")
    print(f"Fallback sovereignty:    {fallback_sov}")
    print(f"Total:                   {len(data)}")

    # Spot-check
    print()
    checks = ["Iran", "Poland", "Germany", "France", "Russia", "South Africa", "China", "United States"]
    for entry in data:
        if entry["country"] in checks:
            print(f"  {entry['country']:20} → {entry['political_date_raw']}  ({entry['political_date_note'] or 'fallback'})")

if __name__ == "__main__":
    main()
