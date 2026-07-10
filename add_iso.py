"""
Adds iso_a3 field to data/countries.json using pycountry lookup.
Run once: python3 add_iso.py
"""
import json
import pycountry

# Manual overrides: Wikipedia names that pycountry doesn't match automatically
OVERRIDES = {
    "Bolivia": "BOL",
    "Brunei": "BRN",
    "Cape Verde": "CPV",
    "Czechia": "CZE",
    "Democratic Republic of the Congo": "COD",
    "Republic of the Congo": "COG",
    "Congo, Democratic Republic of the": "COD",
    "Congo, Republic of the": "COG",
    "East Timor": "TLS",
    "Eswatini": "SWZ",
    "Ivory Coast": "CIV",
    "Iran": "IRN",
    "Laos": "LAO",
    "Micronesia": "FSM",
    "Micronesia, Federated States of": "FSM",
    "Timor-Leste": "TLS",
    "Moldova": "MDA",
    "North Korea": "PRK",
    "North Macedonia": "MKD",
    "Palestine": "PSE",
    "Russia": "RUS",
    "São Tomé and Príncipe": "STP",
    "South Korea": "KOR",
    "Syria": "SYR",
    "Tanzania": "TZA",
    "Taiwan": "TWN",
    "United Kingdom": "GBR",
    "United States": "USA",
    "Vatican City": "VAT",
    "Venezuela": "VEN",
    "Vietnam": "VNM",
    "Kosovo": "KOS",   # Natural Earth uses KOS (not ISO XKX)
    "Palestine": "PSX",  # Natural Earth uses PSX (not ISO PSE)
    "South Sudan": "SDS",  # Natural Earth uses SDS (not ISO SSD)
    "Western Sahara": "ESH",
    "Turkey": "TUR",  # pycountry uses "Türkiye"
}

def lookup_iso(name):
    if name in OVERRIDES:
        return OVERRIDES[name]
    # Try exact name
    country = pycountry.countries.get(name=name)
    if country:
        return country.alpha_3
    # Try common name
    country = pycountry.countries.get(common_name=name)
    if country:
        return country.alpha_3
    # Try fuzzy search
    try:
        results = pycountry.countries.search_fuzzy(name)
        if results:
            return results[0].alpha_3
    except LookupError:
        pass
    return None

with open("data/countries.json", encoding="utf-8") as f:
    data = json.load(f)

found = 0
missing = []
for entry in data:
    iso = lookup_iso(entry["country"])
    entry["iso_a3"] = iso
    if iso:
        found += 1
    else:
        missing.append(entry["country"])

with open("data/countries.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"ISO codes found: {found}/{len(data)}")
if missing:
    print(f"Missing ({len(missing)}): {missing}")
