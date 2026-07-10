import requests
from bs4 import BeautifulSoup
import json
import csv
import re
from datetime import datetime

URL = "https://en.wikipedia.org/wiki/List_of_modern_sovereign_states_by_date_of_formation"

MONTH_MAP = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12",
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "jun": "06", "jul": "07", "aug": "08",
    "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}

def parse_date(text):
    """Parse a date string into ISO format and precision level."""
    text = text.strip()
    if not text or text in ("-", "—", "N/A", ""):
        return None, None

    # Remove superscript/footnote refs like [a], [1]
    text = re.sub(r'\[.*?\]', '', text).strip()
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text)

    # Try full date: "27 May 1863" or "May 27, 1863"
    m = re.search(r'(\d{1,2})\s+(\w+)\s+(\d{4})', text)
    if m:
        day, mon, year = m.group(1), m.group(2).lower(), m.group(3)
        if mon in MONTH_MAP:
            return f"{year}-{MONTH_MAP[mon]}-{int(day):02d}", "full"

    m = re.search(r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', text)
    if m:
        mon, day, year = m.group(1).lower(), m.group(2), m.group(3)
        if mon in MONTH_MAP:
            return f"{year}-{MONTH_MAP[mon]}-{int(day):02d}", "full"

    # Try month + year: "Nov 1944"
    m = re.search(r'(\w+)\s+(\d{4})', text)
    if m:
        mon, year = m.group(1).lower(), m.group(2)
        if mon in MONTH_MAP:
            return f"{year}-{MONTH_MAP[mon]}", "month"

    # Try year only: "1919" or ancient years like "843", "539 c."
    m = re.search(r'\b(\d{3,4})\b', text)
    if m:
        return m.group(1), "year"

    return text, "unknown"


def clean_text(cell):
    """Extract clean text from a table cell."""
    # Remove citation/footnote spans
    for tag in cell.find_all(['sup', 'span'], class_=re.compile(r'reference|cite')):
        tag.decompose()
    return cell.get_text(separator=' ', strip=True)


def scrape():
    print(f"Fetching {URL} ...")
    resp = requests.get(URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Find the main sortable wikitable
    table = soup.find("table", class_="wikitable")
    if not table:
        raise RuntimeError("Could not find wikitable on page")

    headers = []
    for th in table.find("tr").find_all("th"):
        headers.append(clean_text(th).lower().replace(" ", "_"))

    print(f"Columns found: {headers}")

    rows = []
    for tr in table.find_all("tr")[1:]:
        cells = tr.find_all(["td", "th"])
        if len(cells) < 3:
            continue

        # Column order: country, continent, sovereignty, last_subordination, previous_power, notes, capital
        country = clean_text(cells[0])
        continent = clean_text(cells[1]) if len(cells) > 1 else ""
        sovereignty_raw = clean_text(cells[2]) if len(cells) > 2 else ""
        last_sub_raw = clean_text(cells[3]) if len(cells) > 3 else ""
        previous_power = clean_text(cells[4]) if len(cells) > 4 else ""
        notes = clean_text(cells[5]) if len(cells) > 5 else ""
        capital = clean_text(cells[6]) if len(cells) > 6 else ""

        sov_date, sov_prec = parse_date(sovereignty_raw)
        sub_date, sub_prec = parse_date(last_sub_raw)

        rows.append({
            "country": country,
            "continent": continent,
            "sovereignty_date": sov_date,
            "sovereignty_date_precision": sov_prec,
            "sovereignty_date_raw": sovereignty_raw,
            "last_subordination_date": sub_date,
            "last_subordination_date_precision": sub_prec,
            "last_subordination_date_raw": last_sub_raw,
            "previous_power": previous_power,
            "notes": notes,
            "capital": capital,
        })

    print(f"Scraped {len(rows)} countries")
    return rows


def main():
    rows = scrape()

    # Save JSON
    with open("countries.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print("Saved countries.json")

    # Save CSV
    fieldnames = list(rows[0].keys())
    with open("countries.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print("Saved countries.csv")

    # Quick stats
    precisions = {}
    for r in rows:
        p = r["sovereignty_date_precision"] or "none"
        precisions[p] = precisions.get(p, 0) + 1
    print(f"\nDate precision breakdown: {precisions}")


if __name__ == "__main__":
    main()
