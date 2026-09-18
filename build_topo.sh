#!/usr/bin/env bash
# Builds the two TopoJSON files the app loads from Natural Earth 1:50m data:
#   data/world.geojson                          -> data/world.topo.json
#   ne_50m_admin_0_breakaway_disputed_areas     -> data/disputed.topo.json (downloaded)
# Keeps only the properties the app needs and quantises coordinates.
# Requires Node (uses npx) and Python 3.
set -euo pipefail
cd "$(dirname "$0")"

python3 - <<'PY'
import json
g = json.load(open('data/world.geojson'))
out = []
for f in g['features']:
    p = f['properties']
    a2 = p.get('ISO_A2_EH') or p.get('ISO_A2') or ''
    if a2 == '-99':
        a2 = ''
    out.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': {
        'id': p['ADM0_A3'], 'name': p['NAME'], 'nameLong': p['NAME_LONG'], 'type': p['TYPE'],
        'sov': p['SOV_A3'], 'sovName': p['SOVEREIGNT'], 'note': p.get('NOTE_ADM0') or '',
        'a2': a2, 'lx': p.get('LABEL_X'), 'ly': p.get('LABEL_Y'), 'continent': p.get('CONTINENT')}})
json.dump({'type': 'FeatureCollection', 'features': out}, open('/tmp/world.slim.geojson', 'w'))
PY

npx -y -p topojson-server geo2topo -q 1e5 countries=/tmp/world.slim.geojson > data/world.topo.json
rm -f /tmp/world.slim.geojson

# Disputed / breakaway areas
curl -sL -o /tmp/disputed50.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_breakaway_disputed_areas.geojson
python3 - <<'PY'
import json, re
g = json.load(open('/tmp/disputed50.geojson'))
# Stable ids for areas the app refers to by name; others get a slug of their name.
ID = {'Abkhazia': 'ABK', 'South Ossetia': 'SOS', 'N. Cyprus': 'CYN', 'Somaliland': 'SOL',
      'Crimea': 'CRIMEA', 'W. Sahara': 'SAH', 'Golan Heights': 'GOLAN', 'Siachen Glacier': 'KAS'}
NOTE = {
    'Crimea': 'Annexed by Russia in 2014; recognised as Ukrainian by the UN General Assembly',
    "Donetsk People's Republic": 'Occupied by Russia since 2022; claimed by Ukraine',
    "Luhansk People's Republic": 'Occupied by Russia since 2022; claimed by Ukraine',
    'North Borneo': 'Administered by Malaysia; claimed by the Philippines',
    'W. Sahara': 'Mostly administered by Morocco; claimed by the Sahrawi Arab Democratic Republic',
    'Golan Heights': 'Administered by Israel; claimed by Syria',
    'Siachen Glacier': 'Claimed by Pakistan and India',
}
DROP = {'Artsakh'}  # dissolved in 2024, fully under Azerbaijani control
out = []
for f in g['features']:
    p = f['properties']; n = p['BRK_NAME']
    if n in DROP:
        continue
    note = NOTE.get(n) or (p.get('NOTE_BRK') or '').replace('Admin. by', 'Administered by') \
        .replace('Admin. By', 'Administered by').replace('Self admin.', 'Self-administered').replace('Azer.', 'Azerbaijan')
    fid = ID.get(n) or re.sub(r'[^A-Z0-9]+', '_', n.upper()).strip('_')
    out.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': {
        'id': fid, 'name': n.replace('W. Sahara', 'Western Sahara').replace('N. Cyprus', 'Northern Cyprus'),
        'adminIso': p['ADM0_A3'], 'adminName': p['SOVEREIGNT'], 'note': note, 'kind': p['TYPE'],
        'lx': p.get('LABEL_X'), 'ly': p.get('LABEL_Y')}})
json.dump({'type': 'FeatureCollection', 'features': out}, open('/tmp/disputed.slim.geojson', 'w'))
PY
npx -y -p topojson-server geo2topo -q 1e5 disputed=/tmp/disputed.slim.geojson > data/disputed.topo.json
rm -f /tmp/disputed50.geojson /tmp/disputed.slim.geojson
ls -la data/world.topo.json data/disputed.topo.json
