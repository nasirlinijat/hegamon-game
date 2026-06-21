/**
 * scripts/build-map.mjs
 * Generates src/ui/map-geometry.ts from Natural Earth 110m public-domain data.
 * Run once: node scripts/build-map.mjs
 * Output is committed; the app build has no runtime dependency on this script.
 */

import * as d3geo from 'd3-geo';
import { feature, merge } from 'topojson-client';
import { topology } from 'topojson-server';
import polygonClipping from 'polygon-clipping';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MAP_W = 1280;
const MAP_H = 720;

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const topo = JSON.parse(readFileSync(resolve(ROOT, 'data/countries-110m.json'), 'utf8'));
const countriesFC = feature(topo, topo.objects.countries);
// Index by ISO 3166-1 numeric string (world-atlas zero-pads to 3 digits: '076' not '76')
const BY_ID = Object.fromEntries(countriesFC.features.map(f => [String(f.id), f]));

// Natural Earth admin-1 states/provinces for the 4 federal countries that Risk splits
// internally (US, Canada, Russia, Australia). Each feature carries { admin, name, lon, lat }
// where lon/lat is the province label point — used to bin provinces into Risk territories so
// the territory borders follow REAL province boundaries instead of rectangular bboxes.
const admin1 = JSON.parse(readFileSync(resolve(ROOT, 'data/admin1-states.json'), 'utf8'));

// Build a QUANTIZED topology of all admin-1 provinces. Quantization snaps coordinates to a
// shared grid so adjacent provinces share identical arcs — which lets topojson `merge()`
// dissolve their common borders cleanly (raw 50m GeoJSON vertices don't line up exactly, so a
// plain polygon union leaves every province outlined). This is what removes the "insider" lines.
const admin1Topo = topology({ a: admin1 }, 1e5);
const admin1Geoms = admin1Topo.objects.a.geometries;

/**
 * Collect admin-1 provinces of one country into one DISSOLVED MultiPolygon feature, selecting by
 * a predicate over the province label point (lon, lat). Internal province borders are removed.
 */
function provinceGroup(admin, pick) {
  const geoms = admin1Geoms.filter(g => g.properties.admin === admin
    && pick(g.properties.lon, g.properties.lat, g.properties.name));
  if (geoms.length === 0) return null;
  return { type: 'Feature', properties: {}, geometry: merge(admin1Topo, geoms) };
}
const US = 'United States of America', CA = 'Canada', RU = 'Russia', AU = 'Australia';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-pad an ISO numeric code to 3 digits (world-atlas format). */
const pad3 = n => String(n).padStart(3, '0');

/** Build a GeoJSON Feature from one or more ISO-3166-1 numeric codes. */
function countryFeat(ids) {
  const feats = ids.map(id => BY_ID[pad3(id)]).filter(Boolean);
  if (feats.length === 0) return null;
  if (feats.length === 1) return feats[0];
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: feats.flatMap(f => {
        const g = f.geometry;
        if (!g) return [];
        if (g.type === 'Polygon') return [g.coordinates];
        if (g.type === 'MultiPolygon') return g.coordinates;
        return [];
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// mergeFeats — combine bbox + country features into one MultiPolygon feature
// ---------------------------------------------------------------------------

function mergeFeats(features) {
  const valid = features.filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: valid.flatMap(f => {
        const g = f.geometry;
        if (!g) return [];
        if (g.type === 'Polygon') return [g.coordinates];
        if (g.type === 'MultiPolygon') return g.coordinates;
        return [];
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// dissolvedPath — produce a territory's SVG path with internal seams (the
// province/country borders WITHIN one territory) removed, leaving only the outer
// perimeter so neighbouring territories are easy to tell apart.
//
// The union is done in PROJECTED pixel space: d3's geoPath already cuts the
// antimeridian and projects correctly (so far-east Russia doesn't smear across the
// map), and polygon-clipping then dissolves the touching sub-polygons. Holes are
// treated as fills — fine for a stylised Risk map (no lakes shown).
// ---------------------------------------------------------------------------

function pathToRings(d) {
  return d.split('M').filter(Boolean).map(seg => {
    const nums = seg.match(/-?\d+(?:\.\d+)?/g);
    const ring = [];
    if (nums) for (let i = 0; i + 1 < nums.length; i += 2) ring.push([+nums[i], +nums[i + 1]]);
    return ring;
  }).filter(r => r.length >= 3);
}

function ringsToPath(mp) {
  let s = '';
  for (const poly of mp) for (const ring of poly) {
    s += 'M' + ring.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z';
  }
  return s;
}

function dissolvedPath(feat) {
  const raw = pathGen(feat);
  if (!raw) return '';
  const rings = pathToRings(raw);
  if (rings.length < 2) return raw;
  const mps = rings.map(r => [[r]]); // each ring as its own MultiPolygon
  let merged;
  try {
    merged = polygonClipping.union(mps[0], ...mps.slice(1));
  } catch (e) {
    console.warn('dissolve failed, keeping raw path:', e.message);
    return raw;
  }
  return ringsToPath(merged);
}

// ---------------------------------------------------------------------------
// Label / coin placement: pole of inaccessibility on the largest piece.
// A geographic centroid can fall in the sea (concave coastlines) or between islands (multi-part
// shapes). Instead, place the label at the interior point of the LARGEST sub-polygon farthest from
// any edge — guaranteed on the visible landmass. `r` is that point's clearance (inscribed radius),
// used to bound how far the name label can sit above the coin without leaving the territory.
// ---------------------------------------------------------------------------

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function pointInRing(px, py, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
function distToRing(px, py, r) {
  let m = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) m = Math.min(m, distToSeg(px, py, r[i], r[j]));
  return m;
}
function labelPoint(d) {
  const rings = pathToRings(d);
  if (!rings.length) return { x: MAP_W / 2, y: MAP_H / 2, r: 0 };
  let ring = rings[0], bestArea = ringArea(rings[0]);
  for (const rg of rings) { const a = ringArea(rg); if (a > bestArea) { bestArea = a; ring = rg; } }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const step = Math.max(1, Math.min(maxX - minX, maxY - minY) / 30);
  let bx = (minX + maxX) / 2, by = (minY + maxY) / 2, bd = -Infinity;
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      if (!pointInRing(x, y, ring)) continue;
      const dd = distToRing(x, y, ring);
      if (dd > bd) { bd = dd; bx = x; by = y; }
    }
  }
  return { x: Math.round(bx * 10) / 10, y: Math.round(by * 10) / 10, r: Math.round(Math.max(0, bd) * 10) / 10 };
}

// ---------------------------------------------------------------------------
// Centroid overrides (lon, lat) — retained for reference; superseded by labelPoint above.
// ---------------------------------------------------------------------------

const CENTROID_OVERRIDE = {
  // Russia sub-territories — bbox midpoints land in open ocean/tundra
  ural:                  [62,  57],   // Russian Ural heartland
  siberia:               [82,  60],   // W Siberian plain
  irkutsk:               [108, 54],   // Lake Baikal region
  yakutsk:               [127, 66],   // Yakutia
  kamchatka:             [160, 60],   // Kamchatka peninsula
  // Canada sub-territories
  alaska:                [-153, 63],
  'northwest-territory': [-95,  68],
  alberta:               [-115, 54],
  ontario:               [-85,  50],
  quebec:                [-71,  52],
  'western-us':          [-112, 39],
  'eastern-us':          [-80,  38],
  // Australia sub-territories
  'western-australia':   [122, -26],
  'eastern-australia':   [146, -32],
  // Ukraine now spans Eastern Europe + Western (European) Russia — keep label in E. Europe,
  // not the new polygon's centroid which falls in central Russia.
  ukraine:               [35, 52],
};

// ---------------------------------------------------------------------------
// Territory composition — every country in the dataset is assigned exactly once
// (except Antarctica, Falklands, and bbox-handled Russia/USA/Canada/Australia).
// ---------------------------------------------------------------------------

const COMPOSITION = {
  // ── North America (US + Canada via real admin-1 borders) ───────────────────
  alaska:                 provinceGroup(US, (lon, lat, n) => n === 'Alaska'),
  greenland:              countryFeat([304]),
  // Canada: northern territories (lat≥60), then western / Ontario / eastern by longitude.
  'northwest-territory':  provinceGroup(CA, (lon, lat) => lat >= 60),
  alberta:                provinceGroup(CA, (lon, lat) => lat < 60 && lon < -95),
  ontario:                provinceGroup(CA, (lon, lat) => lat < 60 && lon >= -95 && lon < -78),
  quebec:                 provinceGroup(CA, (lon, lat) => lat < 60 && lon >= -78),
  // Lower-48 US split E/W at lon -100 (Hawaii excluded, Alaska is its own territory).
  'western-us':           provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon < -100),
  'eastern-us':           provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon >= -100),
  // Mexico + Central America + Caribbean (incl. Bahamas 44, T&T 780, Jamaica 388)
  'central-america':      countryFeat([484, 320, 84, 340, 222, 558, 188, 591,
                                       192, 332, 214, 630, 388, 780, 44]),

  // ── South America ─────────────────────────────────────────────────────────
  venezuela:              countryFeat([862, 170, 328, 740, 260]),
  brazil:                 countryFeat([76]),
  peru:                   countryFeat([604, 218, 68]),
  argentina:              countryFeat([32, 152, 858, 600]),

  // ── Europe ────────────────────────────────────────────────────────────────
  iceland:                countryFeat([352]),
  'great-britain':        countryFeat([826, 372]),
  scandinavia:            countryFeat([578, 752, 246, 208]),
  // Northern Europe: Germany, Poland, Czech Rep., Slovakia, Austria, Switzerland
  'northern-europe':      countryFeat([276, 616, 203, 703, 40, 756]),
  // Western Europe: France, Spain, Portugal, Netherlands, Belgium, Luxembourg
  'western-europe':       countryFeat([250, 724, 620, 528, 56, 442]),
  // Southern Europe: Italy, Greece, Balkans, Turkey (Turkey in SE in classic Risk)
  'southern-europe':      countryFeat([380, 300, 100, 688, 191, 705,
                                       807, 8, 70, 499, 792, 196]),
  // Ukraine: Ukraine, Belarus, Romania, Moldova, Hungary, Baltics,
  //          + Caucasus (Georgia 268, Armenia 51, Azerbaijan 31)
  //          + European Russia (admin-1 subjects west of the Urals, lon < 55) — in classic
  //          Risk the Ukraine territory IS European Russia.
  ukraine:                mergeFeats([
                            countryFeat([804, 112, 642, 498, 348, 440, 428, 233, 268, 51, 31]),
                            provinceGroup(RU, (lon) => lon < 55),
                          ]),

  // ── Africa ────────────────────────────────────────────────────────────────
  // North Africa: Maghreb + West Africa + W. Sahara
  'north-africa':         countryFeat([504, 12, 788, 434, 478, 466, 562, 686,
                                       566, 288, 384, 854, 204, 768, 324, 624,
                                       694, 430, 270, 732]),
  egypt:                  countryFeat([818]),
  // East Africa (Sudan → Tanzania corridor, incl. Chad which bridges to N Africa)
  'east-africa':          countryFeat([729, 728, 231, 706, 404, 800, 834,
                                       646, 108, 262, 232, 148]),
  // Congo: DRC, Rep. Congo, Gabon, Cameroon, CAR, Eq. Guinea
  congo:                  countryFeat([180, 178, 266, 120, 140, 226]),
  'south-africa':         countryFeat([710, 516, 72, 894, 716, 508, 454, 748, 426, 24]),
  madagascar:             countryFeat([450]),

  // ── Asia — Russia split into 5 territories via real admin-1 federal subjects ──
  // Binned by province label longitude/latitude; borders follow real subject boundaries.
  // ural = Urals band (lon 55–73) + Kazakhstan (398) + Uzbekistan (860) + Turkmenistan (795)
  ural:     mergeFeats([provinceGroup(RU, (lon) => lon >= 55 && lon < 73),
                        countryFeat([398, 860, 795])]),
  siberia:                provinceGroup(RU, (lon) => lon >= 73 && lon < 105),
  irkutsk:                provinceGroup(RU, (lon, lat) => lon >= 105 && lon < 133 && lat < 58),
  yakutsk:                provinceGroup(RU, (lon, lat) => lon >= 105 && lon < 133 && lat >= 58),
  kamchatka:              provinceGroup(RU, (lon) => lon >= 133),
  // Mongolia + North Korea (408) — adjacent in Risk
  mongolia:               countryFeat([496, 408]),
  // Japan + South Korea (410)
  japan:                  countryFeat([392, 410]),
  // Afghanistan + Pakistan (586) + Tajikistan (762) + Kyrgyzstan (417)
  afghanistan:            countryFeat([4, 586, 762, 417]),
  // China + Taiwan (158)
  china:                  countryFeat([156, 158]),
  // Middle East: core Arab world + Iran + Cyprus (196)
  'middle-east':          countryFeat([682, 368, 760, 364, 887, 512, 400,
                                       422, 376, 414, 784, 634, 48, 275]),
  india:                  countryFeat([356, 144, 524, 64, 50]),
  // Siam: SE Asia + Philippines (608) + Brunei (96)
  siam:                   countryFeat([764, 104, 116, 418, 704, 458, 608, 96]),

  // ── Australia ─────────────────────────────────────────────────────────────
  // Indonesia + Timor-Leste (626)
  indonesia:              countryFeat([360, 626]),
  // New Guinea + Pacific islands near it
  'new-guinea':           countryFeat([598, 90, 548]),
  // Western Australia = WA + NT + SA (lon < 140)
  'western-australia':    provinceGroup(AU, (lon) => lon < 140),
  // Eastern Australia = QLD + NSW + VIC + TAS (lon ≥ 140) + NZ (554) + New Caledonia (540) + Fiji (242)
  'eastern-australia':    mergeFeats([provinceGroup(AU, (lon) => lon >= 140),
                                      countryFeat([554, 540, 242])]),
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

// Merge all land (minus Antarctica — id '010') into a bounding feature for fitExtent and the
// coastline glow. Antarctica is not a playable territory and only added an empty southern strip.
const landGeometries = topo.objects.countries.geometries.filter((g) => String(g.id) !== '010');
const landGeom = merge(topo, landGeometries);
const landFeat = { type: 'Feature', geometry: landGeom, properties: {} };

// Margins so the map sits centred with ocean on every side (no land touching the viewport
// edge — Alaska / Kamchatka were getting clipped). Side margins are larger than top/bottom.
const PAD_X = 110;
const PAD_TOP = 80;
const PAD_BOTTOM = 60;
const projection = d3geo.geoEquirectangular()
  .rotate([-12, 0])
  .fitExtent([[PAD_X, PAD_TOP], [MAP_W - PAD_X, MAP_H - PAD_BOTTOM]], landFeat);

const pathGen = d3geo.geoPath(projection);

// ---------------------------------------------------------------------------
// Generate paths and centroids
// ---------------------------------------------------------------------------

const paths = {};
const centroids = {};
const missing = [];

for (const [id, feat] of Object.entries(COMPOSITION)) {
  if (!feat) { missing.push(id); continue; }
  // Dissolve internal seams (in projected space) so only the outer border remains.
  const d = dissolvedPath(feat);
  if (!d) { missing.push(id); continue; }
  paths[id] = d;
  // Place the label/coin on the largest landmass, farthest from any edge — never off-shape.
  centroids[id] = labelPoint(d);
}

if (missing.length) {
  console.warn('WARNING — no geometry for territories:', missing.join(', '));
}

const landPath = pathGen(landFeat) ?? '';

// ---------------------------------------------------------------------------
// Emit TypeScript
// ---------------------------------------------------------------------------

mkdirSync(resolve(ROOT, 'src/ui'), { recursive: true });

const ts = `// AUTO-GENERATED by scripts/build-map.mjs — do not edit by hand.
// Source: Natural Earth 110m (public domain). Projection: geoEquirectangular rotate([-12,0])
// Regenerate: node scripts/build-map.mjs
/* eslint-disable */
import type { TerritoryId } from '../engine/map';

export const MAP_W = ${MAP_W};
export const MAP_H = ${MAP_H};

export const TERRITORY_PATH: Record<TerritoryId, string> = ${JSON.stringify(paths, null, 2)} as any;

export const TERRITORY_CENTROID: Record<TerritoryId, { x: number; y: number; r: number }> = ${JSON.stringify(centroids, null, 2)} as any;

export const LAND_PATH = ${JSON.stringify(landPath)};
`;

writeFileSync(resolve(ROOT, 'src/ui/map-geometry.ts'), ts, 'utf8');
console.log(`Written src/ui/map-geometry.ts — ${Object.keys(paths).length}/42 territories`);
if (missing.length) process.exit(1);
