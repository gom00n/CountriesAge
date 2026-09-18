#!/usr/bin/env bash
# Converts data/world.geojson (Natural Earth admin-0, 1:50m) into the compact
# TopoJSON the app loads. Keeps only the properties the app needs and
# quantises coordinates. Requires Node (uses npx).
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
ls -la data/world.topo.json
