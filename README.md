# Country Age Map

An interactive world map that colours every country by its **"age"** — how long
it has existed as a state — under three different definitions of when a country's
clock starts. Blue = younger, red = older; hover for details, search for any country.

Built with [Leaflet](https://leafletjs.com/); no build step, no backend — it's a
static page you can open in a browser.

## Date types

Switch between three notions of a country's "start date":

- **First sovereignty** — when the state first became sovereign.
- **Last freed** — the date it last gained or regained sovereignty from a foreign
  power (e.g. after occupation or colonial rule). Does not reflect internal revolutions.
- **Current regime** — when the current political system was established, capturing
  revolutions, democratisation, and major regime changes (e.g. Iran 1979, Poland 1989).

There's also a **Simple / Detailed** toggle (two-colour split vs. a graded scale).

## Run it

It's fully static:

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly mostly works too, but a local server avoids
browser restrictions on loading the local GeoJSON.)

## Data & how it's built

| File | What it is |
|------|-----------|
| `data/world.geojson` | Country polygons (Natural Earth admin-0). |
| `data/countries.json` | Per-country dates + ISO codes, consumed by the app. |
| `countries.json` / `countries.csv` | Raw scrape output. |

The dataset is assembled by three one-shot scripts:

1. **`scrape.py`** — scrapes [Wikipedia's *List of modern sovereign states by date
   of formation*](https://en.wikipedia.org/wiki/List_of_modern_sovereign_states_by_date_of_formation),
   parsing the fuzzy date strings into ISO dates with a precision flag.
2. **`add_iso.py`** — attaches `iso_a3` codes via `pycountry` (with manual overrides
   for names it doesn't match).
3. **`add_political_date.py`** — adds a hand-curated "current regime" year per country
   (regime changes, revolutions, constitutions), sourced from Wikipedia country histories.

```bash
pip install requests beautifulsoup4 pycountry
python3 scrape.py && python3 add_iso.py && python3 add_political_date.py
```

## Notes

Dates for states with long or contested histories are inherently fuzzy — the goal is
a fun, at-a-glance comparison, not an authoritative reference. Corrections welcome.

## License

[MIT](LICENSE).
