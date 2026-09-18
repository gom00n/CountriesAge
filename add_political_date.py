"""
Adds the "current regime" fields to data/countries.json:

  political_date        ISO date / year the current political system was established
  political_date_raw    human-readable form
  political_date_note   one-line description of the event
  political_source      URL backing the date (Wikipedia article on the event)

Countries listed in POLITICAL_DATES get a hand-curated year, note and source.
Everything else falls back to the "last freed" date (or first sovereignty), and
its source is the Wikipedia list the base data was scraped from.

Run: python3 add_political_date.py
"""
import json

WIKI = "https://en.wikipedia.org/wiki/"
LIST_URL = WIKI + "List_of_modern_sovereign_states_by_date_of_formation"

# iso_a3 -> (year, description, wikipedia article slug)
POLITICAL_DATES = {
    # ── End of communism in Central / Eastern Europe ──────────────────────────
    "ALB": (1992, "End of communist rule", "Fall_of_communism_in_Albania"),
    "BIH": (1992, "Independence from Yugoslavia", "1992_Bosnian_independence_referendum"),
    "BGR": (1990, "End of communist rule", "History_of_Bulgaria_since_1989"),
    "HRV": (1991, "Independence from Yugoslavia", "1991_Croatian_independence_referendum"),
    "CZE": (1993, "Czech Republic formed on dissolution of Czechoslovakia", "Dissolution_of_Czechoslovakia"),
    "SVK": (1993, "Slovak Republic formed on dissolution of Czechoslovakia", "Dissolution_of_Czechoslovakia"),
    "HUN": (1989, "End of communist rule, Third Republic", "End_of_communism_in_Hungary_(1989)"),
    "MDA": (1991, "Independence from the USSR", "Declaration_of_Independence_of_Moldova"),
    "MNE": (2006, "Independence from Serbia and Montenegro", "2006_Montenegrin_independence_referendum"),
    "POL": (1989, "End of communist rule, Third Polish Republic", "History_of_Poland_(1989–present)"),
    "ROU": (1989, "Revolution ends communist dictatorship", "Romanian_revolution"),
    "SRB": (2006, "Republic of Serbia after Montenegro's secession", "Serbia_and_Montenegro"),
    "SVN": (1991, "Independence from Yugoslavia", "Ten-Day_War"),
    "MKD": (1991, "Independence from Yugoslavia", "1991_Macedonian_independence_referendum"),
    "KOS": (2008, "Declaration of independence from Serbia", "2008_Kosovo_declaration_of_independence"),

    # ── Post-Soviet states ────────────────────────────────────────────────────
    "ARM": (1991, "Independence from the USSR", "1991_Armenian_independence_referendum"),
    "AZE": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "BLR": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "EST": (1991, "Independence from the USSR restored", "Estonian_restoration_of_Independence"),
    "GEO": (1991, "Independence from the USSR", "1991_Georgian_independence_referendum"),
    "KAZ": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "KGZ": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "LVA": (1991, "Independence from the USSR restored", "On_the_Restoration_of_Independence_of_the_Republic_of_Latvia"),
    "LTU": (1991, "Independence from the USSR restored", "Act_of_the_Re-Establishment_of_the_State_of_Lithuania"),
    "RUS": (1991, "Russian Federation succeeds the USSR", "Dissolution_of_the_Soviet_Union"),
    "TJK": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "TKM": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),
    "UKR": (1991, "Independence from the USSR", "Declaration_of_Independence_of_Ukraine"),
    "UZB": (1991, "Independence from the USSR", "Dissolution_of_the_Soviet_Union"),

    # ── Revolutions and major regime changes ──────────────────────────────────
    "CHN": (1949, "People's Republic of China proclaimed", "Proclamation_of_the_People's_Republic_of_China"),
    "CUB": (1959, "Cuban Revolution", "Cuban_Revolution"),
    "IRN": (1979, "Islamic Revolution, Islamic Republic established", "Iranian_revolution"),
    "LBY": (2011, "Fall of the Gaddafi regime", "Libyan_civil_war_(2011)"),
    "PRK": (1948, "Democratic People's Republic of Korea founded", "History_of_North_Korea"),
    "VNM": (1975, "Fall of Saigon, reunification under communist rule", "Fall_of_Saigon"),
    "LAO": (1975, "Pathet Lao takeover, Lao PDR established", "Laotian_Civil_War"),
    "KHM": (1993, "UNTAC elections, constitutional monarchy restored", "United_Nations_Transitional_Authority_in_Cambodia"),
    "MMR": (2021, "Military coup ends civilian government", "2021_Myanmar_coup_d'état"),
    "AFG": (2021, "Taliban takeover", "Fall_of_Kabul_(2021)"),
    "SYR": (2024, "Fall of the Assad regime", "Fall_of_the_Assad_regime"),
    "YEM": (1990, "Unification of North and South Yemen", "Yemeni_unification"),

    # ── Democratisation / end of minority rule ────────────────────────────────
    "ZAF": (1994, "End of apartheid, first universal elections", "1994_South_African_general_election"),
    "NAM": (1990, "Independence from South Africa", "Namibian_War_of_Independence"),
    "ZWE": (1980, "Independence as Zimbabwe", "Lancaster_House_Agreement"),

    # ── Post-war constitutions and new republics ──────────────────────────────
    "DEU": (1990, "German reunification", "German_reunification"),
    "ITA": (1948, "Republican constitution in force", "Constitution_of_Italy"),
    "JPN": (1947, "Post-war constitution in force", "Constitution_of_Japan"),
    "AUT": (1955, "State Treaty, full sovereignty restored", "Austrian_State_Treaty"),
    "GRC": (1974, "Restoration of democracy after the junta", "Metapolitefsi"),
    "ESP": (1978, "Democratic constitution after Franco", "Spanish_Constitution_of_1978"),
    "PRT": (1976, "Constitution after the Carnation Revolution", "Constitution_of_Portugal"),

    # ── Republic transitions in otherwise continuous states ───────────────────
    "FRA": (1958, "Fifth Republic established", "French_Fifth_Republic"),
    "TUR": (1923, "Republic of Turkey proclaimed", "History_of_the_Republic_of_Turkey"),
    "IND": (1950, "Republic of India, constitution in force", "Constitution_of_India"),
    "PAK": (1947, "Independence and partition of British India", "Partition_of_India"),
    "ISR": (1948, "State of Israel proclaimed", "Israeli_Declaration_of_Independence"),
    "KOR": (1987, "Sixth Republic, democratic constitution", "Sixth_Republic_of_Korea"),
    "TWN": (1947, "Republic of China constitution (in force in Taiwan since 1949)", "Constitution_of_the_Republic_of_China"),

    # ── Partially recognised states (see add_extras.py for the inclusion rule) ─
    "CYN": (1983, "Turkish Republic of Northern Cyprus proclaimed", "Northern_Cyprus"),
    "SOL": (1991, "Independence re-declared from Somalia", "Somaliland"),
    "ABK": (1994, "Constitution of the Republic of Abkhazia adopted", "Constitution_of_Abkhazia"),
    "SOS": (2001, "Constitution adopted by referendum", "Constitution_of_South_Ossetia"),

    # ── Recent independence ───────────────────────────────────────────────────
    "TLS": (2002, "Independence restored", "History_of_East_Timor"),
    "SDS": (2011, "Independence from Sudan", "2011_South_Sudanese_independence_referendum"),
    "ERI": (1993, "Independence from Ethiopia", "1993_Eritrean_independence_referendum"),

    # ── Post-civil-war settlements ────────────────────────────────────────────
    "SOM": (2012, "Federal Government of Somalia established", "Federal_Government_of_Somalia"),
    "SLE": (1996, "Return to civilian rule", "1996_Sierra_Leonean_general_election"),
    "LBR": (2006, "Post-civil-war elected government takes office", "2005_Liberian_general_election"),
    "RWA": (1994, "RPF government after the genocide", "Rwandan_Civil_War"),
    "AGO": (2002, "End of the civil war", "Angolan_Civil_War"),
    "MOZ": (1994, "First multiparty elections after the civil war", "1994_Mozambican_general_election"),
}


def load():
    with open("data/countries.json", encoding="utf-8") as f:
        return json.load(f)


def save(data):
    with open("data/countries.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    data = load()
    curated = fallback_sub = fallback_sov = 0

    for entry in data:
        iso = entry.get("iso_a3")
        if iso in POLITICAL_DATES:
            year, desc, slug = POLITICAL_DATES[iso]
            entry["political_date"] = str(year)
            entry["political_date_raw"] = str(year)
            entry["political_date_note"] = desc
            entry["political_source"] = WIKI + slug
            curated += 1
            continue

        sub = entry.get("last_subordination_date")
        sov = entry.get("sovereignty_date")
        if sub:
            entry["political_date"] = sub
            entry["political_date_raw"] = entry.get("last_subordination_date_raw") or sub
            fallback_sub += 1
        elif sov:
            entry["political_date"] = sov
            entry["political_date_raw"] = entry.get("sovereignty_date_raw") or sov
            fallback_sov += 1
        else:
            entry["political_date"] = None
            entry["political_date_raw"] = None
        entry["political_date_note"] = ""
        entry["political_source"] = LIST_URL

    save(data)
    print(f"Curated entries:         {curated}")
    print(f"Fallback (last freed):   {fallback_sub}")
    print(f"Fallback (sovereignty):  {fallback_sov}")
    print(f"Total:                   {len(data)}")


if __name__ == "__main__":
    main()
