'use strict';

/* ──────────────────────────────────────────────────────────────────────────
   Country Age Map
   Canvas renderer (d3-geo, Equal Earth projection) with hover picking,
   shareable URL state and a PNG exporter for screenshots.
   ────────────────────────────────────────────────────────────────────────── */

const REPO_URL = 'https://github.com/gom00n/CountriesAge';
const SITE_HOST = 'gom00n.github.io/CountriesAge';
const LIST_URL = 'https://en.wikipedia.org/wiki/List_of_modern_sovereign_states_by_date_of_formation';
const WIKI = 'https://en.wikipedia.org/wiki/';
const DATA_VERSION = '2026-09-18';   // bump when data/*.json changes so browsers refetch
const THIS_YEAR = new Date().getFullYear();

const TYPES = {
  sovereignty: {
    label: 'First sovereignty', key: 'sovereignty_date', raw: 'sovereignty_date_raw',
    phrase: 'first sovereignty', desc: 'when the state first became sovereign',
  },
  freed: {
    label: 'Last freed', key: 'last_subordination_date', raw: 'last_subordination_date_raw',
    phrase: 'last liberation', desc: 'when it last gained or regained sovereignty from a foreign power',
  },
  regime: {
    label: 'Current regime', key: 'political_date', raw: 'political_date_raw',
    phrase: 'current regime', desc: 'when the political system in place today was established',
  },
};

const PALETTE = {
  bg: '#0b1424',
  ocean: '#0f1b2d',
  sphere: '#13233a',
  sphereEdge: 'rgba(255,255,255,0.10)',
  graticule: 'rgba(255,255,255,0.05)',
  border: '#0b1424',
  coast: 'rgba(0,0,0,0.35)',
  selected: '#ffd166',
  hover: '#ffffff',
  same: '#8b95a5',
  noData: '#3f4a5c',
  disputed: '#3b4658',
  antarctica: '#1a2637',
  // Diverging arms, lightest (small difference) -> strongest (large difference)
  older:   ['#fbe0d6', '#f7b8a5', '#f08d75', '#e5614f', '#cf3a34', '#b5262a'],
  younger: ['#d9e6f8', '#b0cbf0', '#82ade6', '#5a8ed8', '#3a6fc4', '#2d5db3'],
  simple: { older: '#e5614f', younger: '#5a8ed8' },
  // Sequential ramp for the "no selection" view: youngest -> oldest
  absolute: ['#fdf3d3', '#f8dc8d', '#efb84f', '#d99226', '#ad6d15', '#7a4a0c'],
};

const DIFF_BRACKETS = [10, 25, 50, 100, 200, Infinity];
const DIFF_LABELS = ['<10 yr', '10–25 yr', '25–50 yr', '50–100 yr', '100–200 yr', '200+ yr'];
const ABS_BRACKETS = [25, 50, 100, 200, 500, Infinity];
const ABS_LABELS = ['<25 yr', '25–50', '50–100', '100–200', '200–500', '500+ yr'];

// Wikipedia article names where the dataset's country name is not the article title
const WIKI_NAME = {
  'Congo, Democratic Republic of the': 'Democratic Republic of the Congo',
  'Congo, Republic of the': 'Republic of the Congo',
  'Micronesia, Federated States of': 'Federated States of Micronesia',
  'Georgia': 'Georgia (country)',
  'Ireland': 'Republic of Ireland',
  'Palestine': 'State of Palestine',
};

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  type: 'regime',
  mode: 'detailed',
  selected: null,       // iso of the reference country
  hover: null,          // feature id under the cursor
  transform: d3.zoomIdentity,
};

const countries = {};   // iso -> dataset entry
let countryList = [];   // sorted dataset entries
const info = {};        // feature id -> { kind, iso, name, ... }
let features = [];      // GeoJSON features (all, incl. territories)
let borders, coast;     // meshes
let projection, path, graticule;
let width = 0, height = 0, dpr = 1;
let hatch = null;

const stage = document.getElementById('stage');
const base = document.getElementById('map');
const overlay = document.getElementById('overlay');
const bctx = base.getContext('2d');
const octx = overlay.getContext('2d');
const pick = document.createElement('canvas');
const pctx = pick.getContext('2d', { willReadFrequently: true });

// ── Boot ───────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('credit-url').textContent = SITE_HOST;

  const [topo, data] = await Promise.all([
    fetch(`data/world.topo.json?v=${DATA_VERSION}`).then(r => r.json()),
    fetch(`data/countries.json?v=${DATA_VERSION}`).then(r => r.json()),
  ]);

  for (const c of data) if (c.iso_a3) countries[c.iso_a3] = c;
  countryList = data.filter(c => c.iso_a3).sort((a, b) => a.country.localeCompare(b.country));

  const obj = topo.objects.countries;
  features = topojson.feature(topo, obj).features;
  borders = topojson.mesh(topo, obj, (a, b) => a !== b);
  coast = topojson.mesh(topo, obj, (a, b) => a === b);
  graticule = d3.geoGraticule10();
  classify();

  projection = d3.geoEqualEarth();
  path = d3.geoPath(projection);
  hatch = makeHatch();

  readHash();
  syncControls();
  resize();
  new ResizeObserver(resize).observe(stage);

  setupZoom();
  setupPointer();
  setupSearch();
  setupButtons();
  document.fonts.ready.then(() => { renderBase(); renderOverlay(); });
}

// Decide what every polygon on the map represents.
function classify() {
  const sovIndex = {};
  for (const f of features) {
    const p = f.properties;
    if (countries[p.id]) sovIndex[p.sov] = p.id;
  }
  for (const f of features) {
    const p = f.properties;
    const rec = { id: p.id, name: p.name, nameLong: p.nameLong, a2: p.a2, type: p.type, note: p.note, sovName: p.sovName, feature: f };
    if (p.id === 'ATA') {
      rec.kind = 'antarctica';
    } else if (countries[p.id]) {
      rec.kind = 'country'; rec.iso = p.id;
    } else if (sovIndex[p.sov] && sovIndex[p.sov] !== p.id) {
      rec.kind = 'territory'; rec.iso = sovIndex[p.sov];
    } else {
      rec.kind = 'disputed';
    }
    info[p.id] = rec;
  }
}

// ── Layout ─────────────────────────────────────────────────────────────────
function resize() {
  const r = stage.getBoundingClientRect();
  width = Math.max(1, Math.round(r.width));
  height = Math.max(1, Math.round(r.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [base, overlay]) {
    c.width = width * dpr; c.height = height * dpr;
    c.style.width = width + 'px'; c.style.height = height + 'px';
  }
  pick.width = width; pick.height = height;

  if (height > width * 1.2) {
    // Portrait phones: keep the map in the upper half, under the headline,
    // leaving the lower half for the legend and country panel.
    projection.fitExtent([[8, 56], [width - 8, height * 0.5]], { type: 'Sphere' });
  } else {
    fitProjection(projection, width, height);
  }
  computeBounds();
  renderBase();
  renderOverlay();
  renderPick();
}

function fitProjection(proj, w, h, pad = 10) {
  proj.fitExtent([[pad, pad], [w - pad, h - pad]], { type: 'Sphere' });
}

// Screen-space size of every feature at zoom 1, used to decide which ones get a dot.
function computeBounds() {
  for (const f of features) {
    const rec = info[f.properties.id];
    const b = path.bounds(f);
    rec.size = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
    const p = f.properties;
    rec.point = (p.lx != null && p.ly != null) ? [p.lx, p.ly] : d3.geoCentroid(f);
  }
}

function needsDot(rec, k) {
  return rec.kind !== 'antarctica' && rec.size * k < 9;
}

// ── Ages ───────────────────────────────────────────────────────────────────
function yearOf(entry, type = state.type) {
  const raw = entry && entry[TYPES[type].key];
  if (!raw) return null;
  const m = String(raw).match(/^(-?\d{1,4})/);
  return m ? parseInt(m[1], 10) : null;
}
function ageOf(entry, type = state.type) {
  const y = yearOf(entry, type);
  return y === null ? null : THIS_YEAR - y;
}
function dateRaw(entry, type = state.type) {
  return entry[TYPES[type].raw] || String(entry[TYPES[type].key] || '—');
}
// Positive = iso is older than the selected country.
function diffTo(iso) {
  const a = yearOf(countries[iso]), b = yearOf(countries[state.selected]);
  if (a === null || b === null) return null;
  return b - a;
}
function bracket(brackets, v) {
  const i = brackets.findIndex(b => v < b);
  return i === -1 ? brackets.length - 1 : i;
}
function comparisonStats() {
  let older = 0, younger = 0, same = 0;
  for (const iso in countries) {
    if (iso === state.selected) continue;
    const d = diffTo(iso);
    if (d === null) continue;
    if (d > 0) older++; else if (d < 0) younger++; else same++;
  }
  return { older, younger, same };
}

// ── Colours ────────────────────────────────────────────────────────────────
function colorForCountry(iso) {
  if (!state.selected) {
    const age = ageOf(countries[iso]);
    return age === null ? PALETTE.noData : PALETTE.absolute[bracket(ABS_BRACKETS, age)];
  }
  if (iso === state.selected) return PALETTE.selected;
  const d = diffTo(iso);
  if (d === null) return PALETTE.noData;
  if (d === 0) return PALETTE.same;
  if (state.mode === 'simple') return d > 0 ? PALETTE.simple.older : PALETTE.simple.younger;
  const i = bracket(DIFF_BRACKETS, Math.abs(d));
  return d > 0 ? PALETTE.older[i] : PALETTE.younger[i];
}

function fillFor(rec) {
  switch (rec.kind) {
    case 'country':   return colorForCountry(rec.iso);
    case 'territory': return colorForCountry(rec.iso);
    case 'antarctica': return PALETTE.antarctica;
    default:          return PALETTE.disputed;
  }
}

function makeHatch() {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(8,14,26,0.55)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-2, 10); x.lineTo(10, -2);
  x.moveTo(-2, 2); x.lineTo(2, -2);
  x.moveTo(6, 10); x.lineTo(10, 6);
  x.stroke();
  return bctx.createPattern(c, 'repeat');
}

// ── Drawing ────────────────────────────────────────────────────────────────
// Draws the whole map into ctx. `proj` must already be fitted; `t` is the zoom transform.
function drawMap(ctx, proj, t, w, h, scale = 1) {
  const p = d3.geoPath(proj, ctx);
  const k = t.k;

  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = PALETTE.ocean;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(k, k);

  // Globe
  ctx.beginPath(); p({ type: 'Sphere' });
  ctx.fillStyle = PALETTE.sphere; ctx.fill();
  ctx.lineWidth = 1 / k; ctx.strokeStyle = PALETTE.sphereEdge; ctx.stroke();

  ctx.beginPath(); p(graticule);
  ctx.lineWidth = 0.6 / k; ctx.strokeStyle = PALETTE.graticule; ctx.stroke();

  // Land
  for (const f of features) {
    const rec = info[f.properties.id];
    ctx.beginPath(); p(f);
    ctx.fillStyle = fillFor(rec); ctx.fill();
    if (rec.kind === 'territory' || rec.kind === 'disputed') {
      const pat = hatch;
      pat.setTransform(new DOMMatrix().scale(1 / k));
      ctx.fillStyle = pat; ctx.fill();
    }
  }

  // Borders: shared edges drawn once, so there are no seams or double lines.
  ctx.beginPath(); p(borders);
  ctx.lineWidth = Math.max(0.5, 0.9 / Math.sqrt(k)) / k;
  ctx.strokeStyle = PALETTE.border; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.beginPath(); p(coast);
  ctx.lineWidth = 0.7 / k; ctx.strokeStyle = PALETTE.coast; ctx.stroke();

  ctx.restore();

  // Dots for features too small to see at this zoom (screen space).
  for (const f of features) {
    const rec = info[f.properties.id];
    if (!needsDot(rec, k)) continue;
    const xy = proj(rec.point);
    if (!xy) continue;
    const sx = xy[0] * k + t.x, sy = xy[1] * k + t.y;
    if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
    ctx.beginPath(); ctx.arc(sx, sy, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = fillFor(rec); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
  }
  ctx.restore();
}

// Outline + label for the selected country and a highlight for the hovered one.
function drawHighlights(ctx, proj, t, w, h, scale = 1, withHover = true) {
  const p = d3.geoPath(proj, ctx);
  const k = t.k;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, w, h);

  const outline = (rec, color, lw, alpha) => {
    ctx.save();
    ctx.translate(t.x, t.y); ctx.scale(k, k);
    ctx.beginPath(); p(rec.feature);
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha; ctx.lineWidth = lw / k; ctx.strokeStyle = color; ctx.stroke();
    ctx.restore();
  };

  if (withHover && state.hover && state.hover !== state.selected) {
    const rec = info[state.hover];
    if (rec && rec.kind !== 'antarctica') {
      if (needsDot(rec, k)) {
        const xy = proj(rec.point);
        ctx.beginPath(); ctx.arc(xy[0] * k + t.x, xy[1] * k + t.y, 6, 0, Math.PI * 2);
        ctx.lineWidth = 1.5; ctx.strokeStyle = PALETTE.hover; ctx.stroke();
      } else {
        outline(rec, PALETTE.hover, 1.2, 0.9);
      }
    }
  }

  if (state.selected) {
    const rec = info[state.selected];
    if (rec) {
      const xy = proj(rec.point);
      const sx = xy[0] * k + t.x, sy = xy[1] * k + t.y;
      if (needsDot(rec, k)) {
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.selected; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
      } else {
        outline(rec, '#000', 3.2, 0.55);
        outline(rec, PALETTE.selected, 1.6, 1);
      }
      // Label with halo
      const name = countries[rec.iso] ? countries[rec.iso].country : rec.name;
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const ly = sy - (needsDot(rec, k) ? 11 : 6);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,10,20,0.9)'; ctx.lineJoin = 'round';
      ctx.strokeText(name, sx, ly);
      ctx.fillStyle = PALETTE.selected; ctx.fillText(name, sx, ly);
    }
  }
  ctx.restore();
}

let baseQueued = false;
function renderBase() {
  if (baseQueued) return;
  baseQueued = true;
  requestAnimationFrame(() => {
    baseQueued = false;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    drawMap(bctx, projection, state.transform, width, height, dpr);
  });
}
function renderOverlay() {
  octx.setTransform(1, 0, 0, 1, 0, 0);
  drawHighlights(octx, projection, state.transform, width, height, dpr);
}

// ── Picking (hover / click hit-testing via an index-coloured canvas) ───────
function idxColor(i) {
  const n = i + 1;
  return `rgb(${n & 255},${(n * 37) & 255},${(n >> 8) & 255})`;
}
function renderPick() {
  const t = state.transform, k = t.k;
  const p = d3.geoPath(projection, pctx);
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, width, height);
  pctx.save();
  pctx.translate(t.x, t.y); pctx.scale(k, k);
  features.forEach((f, i) => {
    pctx.beginPath(); p(f);
    pctx.fillStyle = idxColor(i); pctx.fill();
  });
  pctx.restore();
  features.forEach((f, i) => {
    const rec = info[f.properties.id];
    if (!needsDot(rec, k)) return;
    const xy = projection(rec.point);
    pctx.beginPath(); pctx.arc(xy[0] * k + t.x, xy[1] * k + t.y, 6, 0, Math.PI * 2);
    pctx.fillStyle = idxColor(i); pctx.fill();
  });
}
function featureAt(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const d = pctx.getImageData(x, y, 1, 1).data;
  if (d[3] < 250) return null;
  const n = d[0] + (d[2] << 8);
  if (n === 0 || ((n * 37) & 255) !== d[1]) return null; // anti-aliased edge pixel
  return features[n - 1] ? features[n - 1].properties.id : null;
}

// ── Zoom & pan ─────────────────────────────────────────────────────────────
let zoom;
function setupZoom() {
  zoom = d3.zoom()
    .scaleExtent([1, 16])
    .on('start', () => overlay.classList.add('grabbing'))
    .on('zoom', ev => {
      state.transform = constrain(ev.transform);
      hideTooltip();
      renderBase(); renderOverlay();
    })
    .on('end', () => { overlay.classList.remove('grabbing'); renderPick(); });
  d3.select(overlay).call(zoom).on('dblclick.zoom', null);

  document.getElementById('zoom-in').onclick = () => d3.select(overlay).transition().duration(250).call(zoom.scaleBy, 1.6);
  document.getElementById('zoom-out').onclick = () => d3.select(overlay).transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
  document.getElementById('zoom-reset').onclick = resetView;
}
// Keep the globe from being dragged fully off-screen.
function constrain(t) {
  const k = t.k;
  const maxX = width * 0.6, minX = width - width * k - width * 0.6;
  const maxY = height * 0.6, minY = height - height * k - height * 0.6;
  const x = Math.min(maxX, Math.max(minX, t.x));
  const y = Math.min(maxY, Math.max(minY, t.y));
  return d3.zoomIdentity.translate(x, y).scale(k);
}
function resetView() {
  d3.select(overlay).transition().duration(400).call(zoom.transform, d3.zoomIdentity);
}
function zoomToFeature(rec) {
  if (!rec) return;
  const b = path.bounds(rec.feature);
  const bw = b[1][0] - b[0][0], bh = b[1][1] - b[0][1];
  const k = Math.min(8, 0.45 / Math.max(bw / width, bh / height));
  if (k <= state.transform.k * 1.15 && state.transform.k > 1) return;
  const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
  const t = d3.zoomIdentity.translate(width / 2 - k * cx, height / 2 - k * cy).scale(Math.max(1, k));
  d3.select(overlay).transition().duration(600).call(zoom.transform, constrain(t));
}

// ── Pointer: hover tooltip and click-to-select ─────────────────────────────
function setupPointer() {
  let last = null;
  overlay.addEventListener('mousemove', ev => {
    if (overlay.classList.contains('grabbing')) return;
    const r = overlay.getBoundingClientRect();
    const id = featureAt(Math.round(ev.clientX - r.left), Math.round(ev.clientY - r.top));
    if (id !== last) {
      last = id;
      state.hover = id;
      overlay.classList.toggle('pointer', !!id && info[id].kind !== 'antarctica');
      renderOverlay();
      if (id && info[id].kind !== 'antarctica') showTooltip(id, ev); else hideTooltip();
    } else if (id) {
      positionTooltip(ev);
    }
  });
  overlay.addEventListener('mouseleave', () => { last = null; state.hover = null; renderOverlay(); hideTooltip(); });
  overlay.addEventListener('click', ev => {
    const r = overlay.getBoundingClientRect();
    const id = featureAt(Math.round(ev.clientX - r.left), Math.round(ev.clientY - r.top));
    if (!id) return;
    const rec = info[id];
    if (rec.kind === 'country' || rec.kind === 'territory') select(rec.iso);
  });
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && document.activeElement !== document.getElementById('search-input')) clearSelection();
  });
}

function flag(rec) {
  const a2 = rec && rec.a2;
  if (!a2 || a2.length !== 2) return '';
  return String.fromCodePoint(...[...a2.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function displayName(rec) {
  return countries[rec.iso] && rec.kind === 'country' ? countries[rec.iso].country : rec.name;
}
function statusLine(rec) {
  if (rec.kind === 'territory') {
    const sov = countries[rec.iso] ? countries[rec.iso].country : rec.sovName;
    return `${rec.type === 'Disputed' ? 'Disputed, administered by' : 'Territory of'} ${sov}`;
  }
  if (rec.kind === 'disputed') return rec.type === 'Sovereign country' ? 'Unrecognised state, no data' : 'Disputed territory, no data';
  return '';
}
function compareLine(iso, asHTML = true) {
  if (!state.selected || iso === state.selected) return '';
  const d = diffTo(iso);
  if (d === null) return '';
  const ref = countries[state.selected].country;
  if (d === 0) return asHTML ? `<div class="tt-cmp">Same year as ${ref}</div>` : `Same year as ${ref}`;
  const txt = `${Math.abs(d)} years ${d > 0 ? 'older' : 'younger'} than ${ref}`;
  return asHTML ? `<div class="tt-cmp ${d > 0 ? 'older' : 'younger'}">${txt}</div>` : txt;
}

const tooltip = document.getElementById('tooltip');
function showTooltip(id, ev) {
  const rec = info[id];
  const entry = countries[rec.iso];
  let html = `<div class="tt-name">${flag(rec) ? `<span>${flag(rec)}</span>` : ''}${esc(displayName(rec))}</div>`;
  const st = statusLine(rec);
  if (st) html += `<div class="tt-sub">${esc(st)}</div>`;
  if (entry) {
    const age = ageOf(entry);
    if (rec.kind === 'territory') html += `<div class="tt-sub">Coloured as ${esc(entry.country)}</div>`;
    html += `<div class="tt-row"><span>${TYPES[state.type].label}</span><b>${esc(dateRaw(entry))}</b></div>`;
    if (age !== null) html += `<div class="tt-row"><span>Age</span><b>${age} years</b></div>`;
    if (rec.kind === 'country') html += compareLine(rec.iso);
  }
  tooltip.innerHTML = html;
  tooltip.classList.remove('hidden');
  positionTooltip(ev);
}
function positionTooltip(ev) {
  const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
  let x = ev.clientX + 16, y = ev.clientY + 16;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - 12;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - 12;
  tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
}
function hideTooltip() { tooltip.classList.add('hidden'); }

// ── Selection ──────────────────────────────────────────────────────────────
function select(iso, opts = {}) {
  if (!countries[iso]) return;
  state.selected = iso;
  document.getElementById('search-input').value = countries[iso].country;
  document.getElementById('search-clear').hidden = false;
  closeDropdown();
  refresh();
  if (opts.zoom) zoomToFeature(info[iso]);
}
function clearSelection() {
  state.selected = null;
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').hidden = true;
  refresh();
}
function refresh() {
  renderBase(); renderOverlay();
  renderLegend(); renderInfobox(); renderHeadline();
  writeHash();
}

// ── Headline, legend, infobox ──────────────────────────────────────────────
function renderHeadline() {
  const t = TYPES[state.type];
  const title = document.getElementById('hl-title');
  const sub = document.getElementById('hl-sub');
  if (!state.selected) {
    title.innerHTML = 'How old is every country?';
    sub.innerHTML = `Coloured by age of the <b>${esc(t.phrase)}</b>. Click a country to compare everything against it.`;
    return;
  }
  const e = countries[state.selected];
  const note = state.type === 'regime' && e.political_date_note ? ` (${e.political_date_note})` : '';
  title.innerHTML = `Which countries are older than <em>${esc(e.country)}</em>?`;
  sub.innerHTML = `By <b>${esc(t.phrase)}</b> · ${esc(e.country)}: <b>${esc(dateRaw(e))}</b>${esc(note)} · <span style="color:#f7a58f">red = older</span>, <span style="color:#9ec9ef">blue = younger</span>`;
}

// Legend spec shared by the on-screen legend and the PNG export.
function legendSpec() {
  const spec = { title: '', ramps: [], items: [] };
  const extras = [
    { color: '#6b7789', label: 'Territory (sovereign’s colour)', hatch: true },
    { color: PALETTE.disputed, label: 'Disputed / no data', hatch: true },
  ];
  if (!state.selected) {
    spec.title = `Age of ${TYPES[state.type].phrase}`;
    spec.ramps.push({ label: 'years', colors: PALETTE.absolute, ticks: ['<25', '50', '100', '200', '500', '500+'] });
    spec.items = extras;
    return spec;
  }
  const ref = countries[state.selected].country;
  spec.title = `Compared with ${ref}`;
  if (state.mode === 'simple') {
    spec.items = [
      { color: PALETTE.simple.older, label: 'Older' },
      { color: PALETTE.selected, label: ref, sel: true },
      { color: PALETTE.simple.younger, label: 'Younger' },
      { color: PALETTE.same, label: 'Same year' },
      ...extras,
    ];
    return spec;
  }
  const ticks = ['<10', '25', '50', '100', '200', '200+'];
  spec.ramps.push({ label: 'older by', colors: PALETTE.older, ticks });
  spec.ramps.push({ label: 'younger by', colors: PALETTE.younger, ticks });
  spec.axis = 'years';
  spec.items = [
    { color: PALETTE.selected, label: ref, sel: true },
    { color: PALETTE.same, label: 'Same year' },
    ...extras,
  ];
  return spec;
}
function renderLegend() {
  const el = document.getElementById('legend');
  const sp = legendSpec();
  let html = `<div class="lg-title">${esc(sp.title)}</div>`;
  for (const r of sp.ramps) {
    html += `<div class="lg-ramp-row"><span class="lg-ramp-label">${esc(r.label)}</span><div class="lg-ramp">${r.colors.map(c => `<span style="background:${c}"></span>`).join('')}</div></div>`;
  }
  if (sp.ramps.length) {
    const t = sp.ramps[0].ticks;
    html += `<div class="lg-ramp-row"><span class="lg-ramp-label"></span><div class="lg-axis">${t.map(x => `<span>${esc(x)}</span>`).join('')}</div></div>`;
    html += `<div class="lg-sep"></div>`;
  }
  html += sp.items.map(r =>
    `<div class="lg-row${r.sel ? ' sel' : ''}"><div class="lg-swatch${r.hatch ? ' hatch' : ''}" style="background-color:${r.color}"></div>${esc(r.label)}</div>`
  ).join('');
  el.innerHTML = html;
}

function sourceLinks(e) {
  const links = [];
  const wikiName = WIKI_NAME[e.country] || e.country;
  links.push({ label: 'Wikipedia', url: WIKI + encodeURIComponent(wikiName.replace(/ /g, '_')) });
  if (state.type === 'regime' && e.political_source && e.political_source !== LIST_URL) {
    links.push({ label: 'Regime source', url: e.political_source });
  } else if (e.sources && e.sources.length) {
    links.push({ label: 'Source', url: e.sources[0] });
  } else {
    links.push({ label: 'List source', url: LIST_URL });
  }
  return links;
}
function renderInfobox() {
  const box = document.getElementById('infobox');
  if (!state.selected) { box.classList.add('hidden'); return; }
  const e = countries[state.selected];
  const rec = info[state.selected];
  const t = TYPES[state.type];
  const age = ageOf(e);
  const stats = comparisonStats();
  const others = Object.keys(TYPES).filter(k => k !== state.type);

  box.innerHTML = `
    <div class="ib-head">
      ${flag(rec) ? `<span class="ib-flag">${flag(rec)}</span>` : ''}
      <span class="ib-name">${esc(e.country)}</span>
      <button class="ib-close" title="Clear selection" aria-label="Clear selection">&times;</button>
    </div>
    <div class="ib-sub">${esc(e.continent || '')}${e.capital ? ` · Capital: ${esc(e.capital)}` : ''}</div>
    <div class="ib-age"><span class="n">${age !== null ? age : '?'}</span><span class="l">years since ${esc(t.phrase)}<br><b>${esc(dateRaw(e))}</b></span></div>
    ${state.type === 'regime' && e.political_date_note ? `<div class="ib-note">${esc(e.political_date_note)}</div>` : ''}
    ${state.type !== 'regime' && e.previous_power ? `<div class="ib-row"><span class="ib-label">From</span><span class="ib-value">${esc(e.previous_power.slice(0, 60))}</span></div>` : ''}
    ${others.map(k => `<div class="ib-row"><span class="ib-label">${esc(TYPES[k].label)}</span><span class="ib-value">${esc(dateRaw(e, k))}</span></div>`).join('')}
    <div class="ib-stats">
      <div class="ib-stat older"><b>${stats.older}</b>older</div>
      <div class="ib-stat younger"><b>${stats.younger}</b>younger</div>
      <div class="ib-stat"><b>${stats.same}</b>same year</div>
    </div>
    <div class="ib-foot">
      <span>${sourceLinks(e).map(l => `<a href="${l.url}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' · ')}</span>
    </div>`;
  box.classList.remove('hidden');
  box.querySelector('.ib-close').onclick = clearSelection;
}

// ── Search ─────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const dropdown = document.getElementById('search-dropdown');
let ddIndex = -1, ddItems = [];

function setupSearch() {
  searchInput.addEventListener('input', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('focus', () => { searchInput.select(); renderDropdown(searchInput.value); });
  searchInput.addEventListener('blur', () => setTimeout(closeDropdown, 150));
  searchInput.addEventListener('keydown', ev => {
    if (!dropdown.classList.contains('open')) { if (ev.key === 'ArrowDown') renderDropdown(searchInput.value); return; }
    if (ev.key === 'ArrowDown') { ddIndex = Math.min(ddItems.length - 1, ddIndex + 1); markActive(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { ddIndex = Math.max(0, ddIndex - 1); markActive(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { const it = ddItems[ddIndex] || ddItems[0]; if (it) { select(it.iso_a3, { zoom: true }); searchInput.blur(); } }
    else if (ev.key === 'Escape') { closeDropdown(); searchInput.blur(); }
  });
  document.getElementById('search-clear').onclick = clearSelection;
}
function renderDropdown(q) {
  q = q.trim().toLowerCase();
  const sel = state.selected && countries[state.selected].country.toLowerCase() === q;
  ddItems = (q && !sel ? countryList.filter(c => c.country.toLowerCase().includes(q)) : countryList).slice(0, 200);
  if (!ddItems.length) { closeDropdown(); return; }
  ddIndex = q && !sel ? 0 : -1;
  dropdown.innerHTML = ddItems.map(c => {
    const y = yearOf(c);
    return `<li data-iso="${c.iso_a3}" role="option">${flag(info[c.iso_a3]) ? flag(info[c.iso_a3]) + ' ' : ''}${esc(c.country)}<span class="dd-year">${y === null ? '' : y}</span></li>`;
  }).join('');
  dropdown.classList.add('open');
  dropdown.querySelectorAll('li').forEach(li => {
    li.addEventListener('mousedown', ev => { ev.preventDefault(); select(li.dataset.iso, { zoom: true }); searchInput.blur(); });
  });
  markActive();
}
function markActive() {
  dropdown.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === ddIndex));
  const a = dropdown.querySelector('li.active');
  if (a) a.scrollIntoView({ block: 'nearest' });
}
function closeDropdown() { dropdown.classList.remove('open'); }

// ── Controls, URL state ────────────────────────────────────────────────────
function setupButtons() {
  document.querySelectorAll('#seg-type button').forEach(b => b.onclick = () => { state.type = b.dataset.type; syncControls(); refresh(); });
  document.querySelectorAll('#seg-mode button').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; syncControls(); refresh(); });
  document.getElementById('btn-copy').onclick = copyLink;
  document.getElementById('btn-export').onclick = () => exportImage('download');
  document.getElementById('btn-image').onclick = () => exportImage('copy');
  const about = document.getElementById('about');
  document.getElementById('btn-about').onclick = () => about.showModal();
  document.getElementById('about-close').onclick = () => about.close();
  about.addEventListener('click', ev => { if (ev.target === about) about.close(); });
  window.addEventListener('hashchange', () => { readHash(); syncControls(); refresh(); });
}
function syncControls() {
  document.querySelectorAll('#seg-type button').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
  document.querySelectorAll('#seg-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  if (state.selected && countries[state.selected]) {
    searchInput.value = countries[state.selected].country;
    document.getElementById('search-clear').hidden = false;
  }
  renderLegend(); renderInfobox(); renderHeadline();
}
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const type = p.get('t'), mode = p.get('m'), c = (p.get('c') || '').toUpperCase();
  if (TYPES[type]) state.type = type;
  if (mode === 'simple' || mode === 'detailed') state.mode = mode;
  state.selected = countries[c] ? c : null;
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.selected) p.set('c', state.selected);
  p.set('t', state.type);
  p.set('m', state.mode);
  history.replaceState(null, '', '#' + p.toString());
}
async function copyLink() {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied'); }
  catch { toast('Copy failed, use the address bar'); }
}

// ── Export ─────────────────────────────────────────────────────────────────
function exportTitle() {
  const t = TYPES[state.type];
  if (!state.selected) return { title: 'How old is every country?', sub: `Coloured by age of the ${t.phrase} (${t.desc})` };
  const e = countries[state.selected];
  const note = state.type === 'regime' && e.political_date_note ? ` — ${e.political_date_note}` : '';
  return {
    title: `Which countries are older than ${e.country}?`,
    sub: `By ${t.phrase}: ${e.country} since ${dateRaw(e)}${note}. Red = older, blue = younger.`,
  };
}

async function buildExportCanvas() {
  try { await document.fonts.load('800 56px Inter'); await document.fonts.load('500 24px Inter'); } catch {}
  const W = 2400, H = 1500, M = 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PALETTE.bg; ctx.fillRect(0, 0, W, H);

  // Header
  const { title, sub } = exportTitle();
  ctx.fillStyle = '#eef2f8';
  ctx.font = '800 58px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(title, M, 62);
  ctx.fillStyle = '#b7c2d3';
  ctx.font = '500 25px Inter, system-ui, sans-serif';
  ctx.fillText(sub, M, 140);

  // Map panel (clipped), keeping the on-screen zoom/pan
  const mx = M, my = 200, mw = W - 2 * M, mh = H - my - 120;
  const proj = d3.geoEqualEarth();
  fitProjection(proj, mw, mh, 8);
  proj.translate([proj.translate()[0] + mx, proj.translate()[1] + my]);
  const r = proj.scale() / projection.scale();
  const t0 = state.transform, k = t0.k;
  const c0 = projection.translate(), c1 = proj.translate();
  const t = d3.zoomIdentity
    .translate(r * t0.x + (k - 1) * (r * c0[0] - c1[0]), r * t0.y + (k - 1) * (r * c0[1] - c1[1]))
    .scale(k);

  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 24); ctx.clip();
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const tctx = tmp.getContext('2d');
  drawMap(tctx, proj, t, W, H, 1);
  ctx.drawImage(tmp, 0, 0);
  const ov = document.createElement('canvas');
  ov.width = W; ov.height = H;
  const ovctx = ov.getContext('2d');
  drawHighlights(ovctx, proj, t, W, H, 1, false);
  ctx.drawImage(ov, 0, 0);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2;
  roundRect(ctx, mx, my, mw, mh, 24); ctx.stroke();

  drawLegendCard(ctx, mx + 24, my + mh - 24);

  // Footer
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7e8ba0';
  ctx.font = '500 21px Inter, system-ui, sans-serif';
  const src = state.type === 'regime'
    ? 'Sources: Wikipedia, List of modern sovereign states by date of formation; regime dates from linked Wikipedia articles. Boundaries: Natural Earth.'
    : 'Source: Wikipedia, List of modern sovereign states by date of formation. Boundaries: Natural Earth.';
  ctx.fillText(src, M, H - 52);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b7c2d3';
  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillText(`${SITE_HOST}  ·  ${new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`, W - M, H - 52);
  ctx.textAlign = 'left';
  return c;
}

async function exportImage(how) {
  const c = await buildExportCanvas();
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const name = `country-age-${state.selected ? state.selected.toLowerCase() + '-' : ''}${state.type}.png`;
  if (how === 'copy' && navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Image copied to clipboard');
      return;
    } catch (err) { console.warn('Clipboard write failed, downloading instead', err); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(how === 'copy' ? 'Clipboard unavailable, downloaded instead' : 'PNG downloaded');
}

function drawLegendCard(ctx, left, bottom) {
  const sp = legendSpec();
  const pad = 24, sw = 26, lineH = 36, cell = 42, rampW = 6 * cell, labelW = sp.ramps.length ? 120 : 0;
  ctx.font = '500 21px Inter, system-ui, sans-serif';
  let textW = 0;
  for (const r of sp.items) textW = Math.max(textW, ctx.measureText(r.label).width + sw + 14);
  ctx.font = '600 18px Inter, system-ui, sans-serif';
  textW = Math.max(textW, ctx.measureText(sp.title.toUpperCase()).width, labelW + rampW);
  const rampsH = sp.ramps.length ? sp.ramps.length * 34 + 34 + 12 : 0;
  const w = pad * 2 + textW;
  const h = pad * 2 + 34 + rampsH + sp.items.length * lineH - 8;
  const x = left, y = bottom - h;
  ctx.save();
  ctx.fillStyle = 'rgba(11,20,36,0.9)';
  roundRect(ctx, x, y, w, h, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  let cy = y + pad + 10;
  ctx.fillStyle = '#7e8ba0'; ctx.font = '600 18px Inter, system-ui, sans-serif';
  ctx.fillText(sp.title.toUpperCase(), x + pad, cy);
  cy += 34;
  for (const r of sp.ramps) {
    ctx.fillStyle = '#b7c2d3'; ctx.font = '500 19px Inter, system-ui, sans-serif';
    ctx.fillText(r.label, x + pad, cy);
    r.colors.forEach((c, i) => {
      ctx.fillStyle = c;
      roundRect(ctx, x + pad + labelW + i * cell, cy - 12, cell - 4, 24, 4); ctx.fill();
    });
    cy += 34;
  }
  if (sp.ramps.length) {
    ctx.fillStyle = '#7e8ba0'; ctx.font = '500 16px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    sp.ramps[0].ticks.forEach((t, i) => ctx.fillText(t, x + pad + labelW + i * cell + (cell - 4) / 2, cy - 2));
    ctx.textAlign = 'left';
    cy += 26;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 20;
  } else {
    cy += 6;
  }
  for (const r of sp.items) {
    ctx.fillStyle = r.color;
    roundRect(ctx, x + pad, cy - sw / 2, sw, sw, 5); ctx.fill();
    if (r.hatch) {
      ctx.save(); roundRect(ctx, x + pad, cy - sw / 2, sw, sw, 5); ctx.clip();
      ctx.strokeStyle = 'rgba(8,14,26,0.6)'; ctx.lineWidth = 3;
      for (let d = -sw; d < sw * 2; d += 8) { ctx.beginPath(); ctx.moveTo(x + pad + d, cy + sw / 2); ctx.lineTo(x + pad + d + sw, cy - sw / 2); ctx.stroke(); }
      ctx.restore();
    }
    ctx.fillStyle = r.sel ? '#eef2f8' : '#c9d2e0';
    ctx.font = `${r.sel ? 700 : 500} 21px Inter, system-ui, sans-serif`;
    ctx.fillText(r.label, x + pad + sw + 14, cy);
    cy += lineH;
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Utilities ──────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

init().catch(err => {
  console.error('Init failed:', err);
  toast('Failed to load map data');
});
