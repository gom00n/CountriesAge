'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const countriesData = {};   // iso_a3 → country object
const geoNames = {};        // ADM0_A3 → { name, type, sovereign }
let geoLayer = null;
let dotLayer = null;
let selectedIso = null;
let settings = { mode: 'detailed', dateType: 'political' };
let hoverTimer = null;
let map = null;

// Keep small-country GeoJSON features for dot↔polygon switching
let smallFeatures = [];
let smallPolyLayer = null;  // shown at high zoom
const DOT_ZOOM_THRESHOLD = 5;

// Entities to exclude entirely (not countries in any sense)
const EXCLUDE = new Set([
  'KAS',  // Siachen Glacier / Kashmir
  'ATA',  // Antarctica
  'ATF',  // French Southern Antarctic Lands
  'IOA',  // Australian Indian Ocean Territories
  'HMD',  // Heard Island
  'ATC',  // Ashmore and Cartier Is.
  'SGS',  // South Georgia
  'IOT',  // British Indian Ocean Territory
  'ALD',  // Åland Islands
]);

// ── Color config ─────────────────────────────────────────────────────────────
const COLORS = {
  selected:  '#F1C40F',
  noData:    '#888888',
  noCountry: '#444444',
  territory: '#555555',
  simple: { older: '#E74C3C', younger: '#3498DB' },
  detailed: {
    older:   ['#FFBBBB', '#FF8888', '#FF4444', '#FF1111', '#EE0000', '#FF0000'],
    younger: ['#BBD6FF', '#77AAFF', '#3388FF', '#0055FF', '#0022EE', '#0000FF'],
  },
};
const BRACKETS    = [10, 25, 50, 100, 200, Infinity];
const BRACKET_LABELS = ['0\u201310 yr', '10\u201325 yr', '25\u201350 yr', '50\u2013100 yr', '100\u2013200 yr', '200+ yr'];

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  map = L.map('map', {
    center: [30, 20],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    worldCopyJump: true,
    maxBounds: [[-85, -200], [85, 200]],
    maxBoundsViscosity: 0.8,
    renderer: L.canvas({ padding: 0.5 }),
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '\u00a9 OpenStreetMap \u00a9 CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
    noWrap: false,
  }).addTo(map);

  dotLayer = L.layerGroup().addTo(map);

  const [geoData, countriesArr] = await Promise.all([
    fetch('data/world.geojson').then(r => r.json()),
    fetch('data/countries.json').then(r => r.json()),
  ]);

  for (const c of countriesArr) {
    if (c.iso_a3) countriesData[c.iso_a3] = c;
  }

  // Build name lookup from GeoJSON
  for (const f of geoData.features) {
    const p = f.properties;
    geoNames[p.ADM0_A3] = {
      name: p.NAME || p.SOVEREIGNT || p.ADM0_A3,
      type: p.TYPE,
      sovereign: p.SOVEREIGNT || '',
    };
  }

  renderMap(geoData);
  buildSearchList(countriesArr);
  renderLegend();

  // Switch dots ↔ polygons on zoom
  map.on('zoomend', onZoomChange);
}

// ── Map rendering ─────────────────────────────────────────────────────────────
function bboxArea(feature) {
  const geom = feature.geometry;
  const rings = geom.type === 'Polygon'
    ? [geom.coordinates[0]]
    : geom.coordinates.map(p => p[0]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return (maxX - minX) * (maxY - minY);
}

function centroid(feature) {
  const geom = feature.geometry;
  const rings = geom.type === 'Polygon'
    ? [geom.coordinates[0]]
    : geom.coordinates.map(p => p[0]);
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) {
    for (const [x, y] of ring) { sx += x; sy += y; n++; }
  }
  return [sy / n, sx / n];
}

function renderMap(geoData) {
  smallFeatures = [];
  const normal = [];

  for (const f of geoData.features) {
    const iso = f.properties.ADM0_A3;
    if (EXCLUDE.has(iso)) continue;
    (bboxArea(f) < 0.8 ? smallFeatures : normal).push(f);
  }

  geoLayer = L.geoJSON({ type: 'FeatureCollection', features: normal }, {
    style: f => polyStyle(f.properties.ADM0_A3),
    onEachFeature(feature, layer) {
      const iso = feature.properties.ADM0_A3;
      layer.on({
        click:     ()  => selectCountry(iso),
        mouseover: e   => startHover(iso, e.originalEvent),
        mousemove: e   => moveTooltip(e.originalEvent),
        mouseout:  ()  => stopHover(),
      });
    },
  }).addTo(map);

  // Initially show dots for small countries
  rebuildSmallLayer();
}

function rebuildSmallLayer() {
  dotLayer.clearLayers();
  if (smallPolyLayer) { map.removeLayer(smallPolyLayer); smallPolyLayer = null; }

  const zoom = map.getZoom();

  if (zoom >= DOT_ZOOM_THRESHOLD) {
    // Show as actual polygons
    smallPolyLayer = L.geoJSON({ type: 'FeatureCollection', features: smallFeatures }, {
      style: f => polyStyle(f.properties.ADM0_A3),
      onEachFeature(feature, layer) {
        const iso = feature.properties.ADM0_A3;
        layer.on({
          click:     ()  => selectCountry(iso),
          mouseover: e   => startHover(iso, e.originalEvent),
          mousemove: e   => moveTooltip(e.originalEvent),
          mouseout:  ()  => stopHover(),
        });
      },
    }).addTo(map);
  } else {
    // Show as dots
    for (const f of smallFeatures) {
      const iso = f.properties.ADM0_A3;
      const dot = L.circleMarker(centroid(f), circleStyle(iso));
      dot._iso = iso;
      dot.on({
        click:     ()  => selectCountry(iso),
        mouseover: e   => startHover(iso, e.originalEvent),
        mousemove: e   => moveTooltip(e.originalEvent),
        mouseout:  ()  => stopHover(),
      });
      dotLayer.addLayer(dot);
    }
  }
}

function onZoomChange() {
  const zoom = map.getZoom();
  const hasDots = dotLayer.getLayers().length > 0;
  const hasPolys = !!smallPolyLayer;

  if (zoom >= DOT_ZOOM_THRESHOLD && hasDots) rebuildSmallLayer();
  else if (zoom < DOT_ZOOM_THRESHOLD && hasPolys) rebuildSmallLayer();
}

// ── Styling ───────────────────────────────────────────────────────────────────
function getColor(iso) {
  if (iso === selectedIso) return COLORS.selected;
  if (!selectedIso)        return COLORS.noCountry;

  const entry = countriesData[iso];
  if (!entry) {
    // Territory or unrecognized entity
    const info = geoNames[iso];
    if (info && info.type === 'Dependency') return COLORS.territory;
    return COLORS.noCountry;
  }

  const diff = getAgeDiff(iso, selectedIso);
  if (diff === null) return COLORS.noData;

  if (settings.mode === 'simple') {
    return diff > 0 ? COLORS.simple.older : diff < 0 ? COLORS.simple.younger : COLORS.selected;
  }

  const abs = Math.abs(diff);
  const idx = BRACKETS.findIndex(b => abs < b);
  const bracketIdx = idx === -1 ? BRACKETS.length - 1 : idx;
  return diff > 0
    ? COLORS.detailed.older[bracketIdx]
    : COLORS.detailed.younger[bracketIdx];
}

function polyStyle(iso) {
  const fill = getColor(iso);
  return {
    fillColor: fill,
    fillOpacity: 1,
    color: '#1a2535',  // thin dark line matching map background
    weight: 0.8,
    opacity: 1,
  };
}

function circleStyle(iso) {
  return { radius: 6, fillColor: getColor(iso), fillOpacity: 0.85, color: '#222', weight: 0.8 };
}

function updateColors() {
  if (geoLayer) geoLayer.setStyle(f => polyStyle(f.properties.ADM0_A3));
  if (smallPolyLayer) smallPolyLayer.setStyle(f => polyStyle(f.properties.ADM0_A3));
  if (dotLayer) dotLayer.eachLayer(dot => {
    if (dot._iso) dot.setStyle(circleStyle(dot._iso));
  });
}

// ── Age calculation ───────────────────────────────────────────────────────────
function parseYear(entry) {
  let key;
  if (settings.dateType === 'sovereignty')    key = 'sovereignty_date';
  else if (settings.dateType === 'political') key = 'political_date';
  else                                        key = 'last_subordination_date';
  const raw = entry[key];
  if (!raw) return null;
  const m = String(raw).match(/^(-?\d{1,4})/);
  return m ? parseInt(m[1], 10) : null;
}

function getAgeDiff(isoA, isoB) {
  const a = countriesData[isoA], b = countriesData[isoB];
  if (!a || !b) return null;
  const ya = parseYear(a), yb = parseYear(b);
  if (ya === null || yb === null) return null;
  return yb - ya; // positive = A older
}

// ── Selection ────────────────────────────────────────────────────────────────
function selectCountry(iso) {
  selectedIso = iso;
  updateColors();
  showInfobox(iso);
  const entry = countriesData[iso];
  if (entry) document.getElementById('search-input').value = entry.country;
  closeDropdown();
}

// ── Infobox ───────────────────────────────────────────────────────────────────
function dateTypeLabel() {
  if (settings.dateType === 'sovereignty') return 'First sovereignty';
  if (settings.dateType === 'political')   return 'Current regime';
  return 'Last freed';
}

function dateDisplay(entry) {
  if (settings.dateType === 'sovereignty') return entry.sovereignty_date_raw || '\u2014';
  if (settings.dateType === 'political')   return entry.political_date_raw   || '\u2014';
  return entry.last_subordination_date_raw || '\u2014';
}

function ageToday(entry) {
  const yr = parseYear(entry);
  return yr !== null ? new Date().getFullYear() - yr : null;
}

function buildInfoHTML(iso) {
  const d = countriesData[iso];
  if (!d) {
    // Not in our dataset — show GeoJSON info
    const info = geoNames[iso];
    if (!info) return `<div class="ib-name">${iso}</div><div class="ib-row"><span class="ib-label">Unknown entity</span></div>`;
    const isSovDiff = info.sovereign && info.sovereign !== info.name;
    const subtitle = isSovDiff
      ? `Territory of ${info.sovereign}`
      : info.type === 'Disputed'
        ? 'Disputed territory'
        : info.type === 'Indeterminate'
          ? 'Indeterminate sovereignty'
          : 'Not in dataset';
    return `
      <div class="ib-name">${info.name}</div>
      <div class="ib-subtitle">${subtitle}</div>
    `;
  }

  const label = dateTypeLabel();
  const age   = ageToday(d);
  const rows  = [
    ['Continent', d.continent || '\u2014'],
    ['Capital',   d.capital   || '\u2014'],
    [label,       dateDisplay(d)],
    ...(d.previous_power && settings.dateType !== 'political' ? [['Prev. power', d.previous_power]] : []),
    ...(settings.dateType === 'political' && d.political_date_note ? [['Note', d.political_date_note]] : []),
  ].map(([l, v]) =>
    `<div class="ib-row"><span class="ib-label">${l}</span><span class="ib-value">${v}</span></div>`
  ).join('');

  return `
    <div class="ib-name">${d.country}</div>
    ${rows}
    ${age !== null ? `<div class="ib-age-badge">~${age} years old</div>` : ''}
  `;
}

function showInfobox(iso) {
  const box = document.getElementById('infobox');
  box.innerHTML = buildInfoHTML(iso);
  box.classList.remove('hidden');
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function startHover(iso, ev) {
  stopHover();
  hoverTimer = setTimeout(() => {
    const tt = document.getElementById('tooltip');
    const d = countriesData[iso];

    if (!d) {
      const info = geoNames[iso];
      if (!info) return;
      const isSovDiff = info.sovereign && info.sovereign !== info.name;
      const subtitle = isSovDiff
        ? `Territory of ${info.sovereign}`
        : info.type === 'Disputed' ? 'Disputed territory'
        : info.type === 'Indeterminate' ? 'Indeterminate sovereignty'
        : '';
      tt.innerHTML = `
        <div class="tt-name">${info.name}</div>
        ${subtitle ? `<div class="tt-subtitle">${subtitle}</div>` : ''}
      `;
    } else {
      const label = dateTypeLabel();
      const age   = ageToday(d);
      tt.innerHTML = `
        <div class="tt-name">${d.country}</div>
        <div class="tt-row"><span class="tt-label">${label}</span><span class="tt-value">${dateDisplay(d)}</span></div>
        ${age !== null ? `<div class="tt-row"><span class="tt-label">Age</span><span class="tt-value">~${age} yr</span></div>` : ''}
        ${d.capital ? `<div class="tt-row"><span class="tt-label">Capital</span><span class="tt-value">${d.capital}</span></div>` : ''}
      `;
    }

    positionTooltip(ev);
    tt.classList.remove('hidden');
  }, 700);
}

function moveTooltip(ev) {
  const tt = document.getElementById('tooltip');
  if (!tt.classList.contains('hidden')) positionTooltip(ev);
}

function positionTooltip(ev) {
  const tt = document.getElementById('tooltip');
  const x = Math.min(ev.clientX + 14, window.innerWidth  - 260);
  const y = Math.max(ev.clientY - 10, 10);
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}

function stopHover() {
  clearTimeout(hoverTimer);
  document.getElementById('tooltip').classList.add('hidden');
}

// ── Search / dropdown ─────────────────────────────────────────────────────────
let allCountries = [];

function buildSearchList(arr) {
  allCountries = arr.filter(c => c.iso_a3).sort((a, b) => a.country.localeCompare(b.country));
}

function renderDropdown(query) {
  const dd = document.getElementById('search-dropdown');
  const q  = query.trim().toLowerCase();
  const matches = (q
    ? allCountries.filter(c => c.country.toLowerCase().includes(q))
    : allCountries
  ).slice(0, 14);

  if (!matches.length) { closeDropdown(); return; }

  dd.innerHTML = matches.map(c =>
    `<li data-iso="${c.iso_a3}">${c.country}</li>`
  ).join('');
  dd.classList.add('open');
  dd.querySelectorAll('li').forEach(li => {
    li.addEventListener('mousedown', e => { e.preventDefault(); selectCountry(li.dataset.iso); });
  });
}

function closeDropdown() {
  document.getElementById('search-dropdown').classList.remove('open');
}

document.getElementById('search-input').addEventListener('input',  e => renderDropdown(e.target.value));
document.getElementById('search-input').addEventListener('focus',  e => renderDropdown(e.target.value));
document.getElementById('search-input').addEventListener('blur',   () => setTimeout(closeDropdown, 150));

// ── Settings ──────────────────────────────────────────────────────────────────
function setMode(type) {
  settings.mode = type;
  document.getElementById('btn-simple').classList.toggle('active',   type === 'simple');
  document.getElementById('btn-detailed').classList.toggle('active', type === 'detailed');
  updateColors();
  renderLegend();
}

function setDateType(type) {
  settings.dateType = type;
  document.getElementById('btn-sov').classList.toggle('active', type === 'sovereignty');
  document.getElementById('btn-sub').classList.toggle('active', type === 'subordination');
  document.getElementById('btn-pol').classList.toggle('active', type === 'political');
  updateColors();
  if (selectedIso) showInfobox(selectedIso);
}

// ── Legend ────────────────────────────────────────────────────────────────────
function swatch(color, label) {
  return `<div class="lg-row"><div class="lg-swatch" style="background:${color}"></div>${label}</div>`;
}

function renderLegend() {
  const el = document.getElementById('legend');
  if (settings.mode === 'simple') {
    el.innerHTML = `
      <div class="lg-title">Legend</div>
      ${swatch(COLORS.simple.older,    'Older')}
      ${swatch(COLORS.selected,        'Selected')}
      ${swatch(COLORS.simple.younger,  'Younger')}
      ${swatch(COLORS.noData,          'No data')}
    `;
  } else {
    const rev = [...BRACKET_LABELS].reverse();
    el.innerHTML = `
      <div class="lg-title">Legend</div>
      ${rev.map((l, i) => swatch(COLORS.detailed.older[BRACKET_LABELS.length - 1 - i], l + ' older')).join('')}
      ${swatch(COLORS.selected, 'Selected')}
      ${BRACKET_LABELS.map((l, i) => swatch(COLORS.detailed.younger[i], l + ' younger')).join('')}
      ${swatch(COLORS.noData, 'No data')}
    `;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init().catch(err => console.error('Init failed:', err));
