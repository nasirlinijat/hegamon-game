/**
 * scripts/build-imperial-map.mjs
 * Generates src/ui/map-geometry-imperial.ts from Natural Earth 110m public-domain data,
 * for the 79-territory "Imperial World" board (src/engine/imperial-map.ts).
 *
 * Same projection as build-map.mjs so both boards share the 1280×720 viewBox. Territories are
 * composed from whole countries, real admin-1 province groups (US/Canada/Russia/Australia), and
 * lon/lat box clips for sub-country regions the image splits (Uyghur/Manchuria, the Arabias,
 * the Turkistans, Italy/Sicily, Crimea).
 *
 * Clipping is done in PROJECTED PIXEL space (not lon/lat) and paths are emitted directly, because
 * feeding clipped lon/lat rings back through d3's spherical geoPath mis-renders reversed-winding
 * rings as the whole-sphere complement. Pixel-space polygon ops + raw M/L/Z output avoid that.
 *
 * Run: node scripts/build-imperial-map.mjs
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
const EXPECTED_COUNT = 79;

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const topo = JSON.parse(readFileSync(resolve(ROOT, 'data/countries-110m.json'), 'utf8'));
const countriesFC = feature(topo, topo.objects.countries);
const BY_ID = Object.fromEntries(countriesFC.features.map((f) => [String(f.id), f]));

const admin1 = JSON.parse(readFileSync(resolve(ROOT, 'data/admin1-states.json'), 'utf8'));
const admin1Topo = topology({ a: admin1 }, 1e5);
const admin1Geoms = admin1Topo.objects.a.geometries;

function provinceGroup(admin, pick) {
  const geoms = admin1Geoms.filter(
    (g) => g.properties.admin === admin && pick(g.properties.lon, g.properties.lat, g.properties.name),
  );
  if (geoms.length === 0) return null;
  return { type: 'Feature', properties: {}, geometry: merge(admin1Topo, geoms) };
}
const US = 'United States of America', CA = 'Canada', RU = 'Russia', AU = 'Australia';

const pad3 = (n) => String(n).padStart(3, '0');
const usedCountryIds = new Set();

/** Build a GeoJSON Feature from ISO numeric codes; tracks usage so duplicates are flagged. */
function countryFeat(ids) {
  const feats = [];
  for (const id of ids) {
    const key = pad3(id);
    if (usedCountryIds.has(key)) console.warn(`  duplicate country ${id} assigned twice`);
    usedCountryIds.add(key);
    const f = BY_ID[key];
    if (f) feats.push(f);
  }
  if (feats.length === 0) return null;
  if (feats.length === 1) return feats[0];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates: feats.flatMap((f) => featToMP(f)) },
  };
}
/** Raw country feature WITHOUT marking it used — for clip/diff sources that get split. */
const rawCountry = (id) => BY_ID[pad3(id)] ?? null;

function featToMP(feat) {
  const g = feat && feat.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

// ---------------------------------------------------------------------------
// Projection (identical to the classic board so both share the viewBox)
// ---------------------------------------------------------------------------

const landGeometries = topo.objects.countries.geometries.filter((g) => String(g.id) !== '010');
const landFeat = { type: 'Feature', geometry: merge(topo, landGeometries), properties: {} };

const PAD_X = 110, PAD_TOP = 80, PAD_BOTTOM = 60;
const projection = d3geo.geoEquirectangular()
  .rotate([-12, 0])
  .fitExtent([[PAD_X, PAD_TOP], [MAP_W - PAD_X, MAP_H - PAD_BOTTOM]], landFeat);
const pathGen = d3geo.geoPath(projection);

// ---------------------------------------------------------------------------
// Pixel-space geometry helpers
// ---------------------------------------------------------------------------

function pathToRings(d) {
  return d.split('M').filter(Boolean).map((seg) => {
    const nums = seg.match(/-?\d+(?:\.\d+)?/g);
    const ring = [];
    if (nums) for (let i = 0; i + 1 < nums.length; i += 2) ring.push([+nums[i], +nums[i + 1]]);
    return ring;
  }).filter((r) => r.length >= 3);
}
function ringsToPath(mp) {
  let s = '';
  for (const poly of mp) for (const ring of poly) {
    s += 'M' + ring.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z';
  }
  return s;
}
/** Project a feature and return its rings as a polygon-clipping multipolygon (each ring a polygon). */
function projectedMP(feat) {
  const raw = pathGen(feat);
  if (!raw) return [];
  return pathToRings(raw).map((r) => [r]);
}
/** Project a lon/lat box to an axis-aligned pixel rectangle multipolygon. */
function projBoxMP([lonMin, latMin, lonMax, latMax]) {
  const corners = [[lonMin, latMin], [lonMax, latMin], [lonMax, latMax], [lonMin, latMax]]
    .map((c) => projection(c));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]];
}
/** A pixel-space region (already projected). `mp` is a polygon-clipping multipolygon. */
const pxRegion = (mp) => ({ __px: true, mp });
const toMP = (x) => (x && x.__px ? x.mp : projectedMP(x));

/** Intersect a feature with a lon/lat box, in pixel space. */
function clip(feat, box) {
  if (!feat) return null;
  const r = polygonClipping.intersection(projectedMP(feat), projBoxMP(box));
  return r.length ? pxRegion(r) : null;
}
/** Feature/region minus other features/regions, in pixel space. */
function diff(base, ...others) {
  if (!base) return null;
  let mp = toMP(base);
  for (const o of others) if (o) mp = polygonClipping.difference(mp, toMP(o));
  return mp.length ? pxRegion(mp) : null;
}
/** Union features/regions into one pixel region. */
function mergePx(items) {
  const valid = items.filter(Boolean).map(toMP).filter((mp) => mp.length);
  if (valid.length === 0) return null;
  let mp = valid[0];
  for (let i = 1; i < valid.length; i++) mp = polygonClipping.union(mp, valid[i]);
  return pxRegion(mp);
}

/** Dissolve a plain feature's internal seams (in projected space) → outer-perimeter path. */
function dissolvedPath(feat) {
  const raw = pathGen(feat);
  if (!raw) return '';
  const rings = pathToRings(raw);
  if (rings.length < 2) return raw;
  try {
    return ringsToPath(polygonClipping.union(rings.map((r) => [[r]])[0], ...rings.slice(1).map((r) => [[r]])));
  } catch (e) {
    console.warn('dissolve failed, keeping raw path:', e.message);
    return raw;
  }
}
/** Path for any composition entry — pixel region or plain GeoJSON feature. */
const entryPath = (entry) => (entry && entry.__px ? ringsToPath(entry.mp) : dissolvedPath(entry));

// --- Label / coin placement: pole of inaccessibility on the largest piece ---------------------
// A territory's geographic centroid can fall in the sea (concave coastlines) or between islands
// (multi-part shapes). Instead, place the label at the interior point of the LARGEST sub-polygon
// that is farthest from any edge — guaranteed to sit on the visible landmass.

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
/** Centroid-like label point guaranteed inside the largest sub-polygon of a projected path. */
function labelPoint(d) {
  const rings = pathToRings(d);
  if (!rings.length) return { x: MAP_W / 2, y: MAP_H / 2 };
  let ring = rings[0], bestArea = ringArea(rings[0]);
  for (const r of rings) { const a = ringArea(r); if (a > bestArea) { bestArea = a; ring = r; } }
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
  // `r` is the inscribed-circle radius (clearance to the nearest edge), used to bound how far a
  // name label can sit above the point without leaving the territory.
  return { x: Math.round(bx * 10) / 10, y: Math.round(by * 10) / 10, r: Math.round(Math.max(0, bd) * 10) / 10 };
}

// ---------------------------------------------------------------------------
// Sub-country sources that get split into multiple territories
// ---------------------------------------------------------------------------

const CHINA = rawCountry(156);
const uyghurF = clip(CHINA, [73, 27, 100, 50]);          // western China
const manchuriaF = clip(CHINA, [118, 40, 135, 54]);      // north-east China
const chinaCore = diff(CHINA, uyghurF, manchuriaF);      // the rest
const SAUDI = rawCountry(682);
const nArabiaSaudi = clip(SAUDI, [34, 24, 56, 33]);
const sArabiaSaudi = clip(SAUDI, [34, 12, 60, 24]);
const KAZAKH = rawCountry(398);
const nTurkistan = clip(KAZAKH, [46, 48, 88, 56]);
const sTurkistan = clip(KAZAKH, [46, 40, 88, 48]);
const ITALY = rawCountry(380);
const italyNorth = clip(ITALY, [6, 41, 19, 47.5]);
const sicilyF = clip(ITALY, [11, 35, 19, 41]);
const UKRAINE = rawCountry(804);
const crimeaF = clip(UKRAINE, [32, 44, 37.5, 46.5]);
const ukraineCore = diff(UKRAINE, crimeaF);
usedCountryIds.add(pad3(398)); // Kazakhstan consumed via rawCountry split
usedCountryIds.add(pad3(250)); // France consumed via rawCountry clip (metropolitan only)

// ---------------------------------------------------------------------------
// Territory composition — one entry per imperial territory
// ---------------------------------------------------------------------------

const COMPOSITION = {
  // North America
  alaska:        provinceGroup(US, (lon, lat, n) => n === 'Alaska'),
  'w-canada':    provinceGroup(CA, (lon) => lon < -95),
  'e-canada':    provinceGroup(CA, (lon) => lon >= -95),
  greenland:     countryFeat([304]),
  california:    provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon < -111),
  washington:    provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon >= -111 && lon < -90 && lat >= 40),
  texas:         provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon >= -111 && lon < -90 && lat < 40),
  maine:         provinceGroup(US, (lon, lat, n) => n !== 'Alaska' && n !== 'Hawaii' && lon >= -90),
  mexico:        countryFeat([484]),

  // South America
  salvador:      countryFeat([320, 84, 340, 222, 558, 188, 591]),
  columbia:      countryFeat([170, 862, 218, 328, 740]),
  brazil:        countryFeat([76]),
  'new-germany': countryFeat([68, 604]),
  paraguay:      countryFeat([600, 858]),
  argentina:     countryFeat([32, 152]),

  // Western Europe
  iceland:       countryFeat([352]),
  ireland:       countryFeat([372]),
  england:       countryFeat([826]),
  denmark:       countryFeat([208]),
  germany:       countryFeat([276]),
  // Metropolitan France only — clip away French Guiana (renders as a stray piece in South America).
  france:        clip(rawCountry(250), [-6, 41, 10, 52]),
  burgundy:      countryFeat([56, 528, 442]),
  swiss:         countryFeat([756]),
  portugal:      countryFeat([620]),
  spain:         countryFeat([724]),
  italy:         italyNorth,
  sicily:        mergePx([sicilyF, countryFeat([470])]),

  // Eastern Europe
  norway:        countryFeat([578]),
  sweden:        countryFeat([752]),
  finland:       countryFeat([246]),
  latvia:        countryFeat([428, 440, 233]),
  poland:        countryFeat([616, 203, 703]),
  austria:       countryFeat([40, 705, 191]),
  hungary:       countryFeat([348, 688, 70, 807, 499, 8]),
  greece:        countryFeat([300]),
  bulgaria:      countryFeat([100, 642, 498]),
  ukraine:       mergePx([ukraineCore, countryFeat([112])]),
  crimea:        crimeaF,
  russia:        provinceGroup(RU, (lon) => lon < 44),
  tatarland:     provinceGroup(RU, (lon) => lon >= 44 && lon < 60),

  // Africa
  morocco:       countryFeat([504, 732]),
  algeria:       countryFeat([12, 788]),
  'w-desert':    countryFeat([478, 466, 686, 270, 624, 324, 694, 430, 384, 854, 204, 768, 288]),
  'e-desert':    countryFeat([434, 148, 562, 566, 120]),
  's-desert':    countryFeat([729, 728, 231, 232, 262, 706]),
  egypt:         countryFeat([818]),
  jungle:        countryFeat([180, 178, 266, 226, 140, 800, 404, 834, 646, 108]),
  rhodesia:      countryFeat([24, 894, 716, 508, 454]),
  'new-holland': countryFeat([710, 516, 72, 426, 748]),
  madagascar:    countryFeat([450]),

  // Middle East
  turkiye:       countryFeat([792, 196]),
  lebanon:       countryFeat([422, 376, 400, 760, 275]),
  azerbaijan:    countryFeat([31, 268, 51]),
  'n-arabia':    mergePx([nArabiaSaudi, countryFeat([368, 414])]),
  's-arabia':    mergePx([sArabiaSaudi, countryFeat([887])]),
  dubay:         countryFeat([784, 512, 634, 48]),
  iran:          countryFeat([364]),

  // Asia
  ural:          provinceGroup(RU, (lon) => lon >= 60 && lon < 73),
  siberia:       provinceGroup(RU, (lon) => lon >= 73),
  turkmenistan:  countryFeat([795]),
  uzbekistan:    countryFeat([860, 762, 417]),
  'north-turkistan': nTurkistan,
  'south-turkistan': sTurkistan,
  uyghur:        uyghurF,
  mongolia:      countryFeat([496]),
  manchuria:     manchuriaF,
  china:         chinaCore,
  korea:         countryFeat([408, 410]),
  japan:         countryFeat([392]),
  taiwan:        countryFeat([158]),
  india:         countryFeat([356, 586, 50, 524, 144, 64, 4]),
  thailand:      countryFeat([764, 104, 418, 116, 704]),

  // Oceania
  malayia:       countryFeat([458, 96, 702]),
  indonesia:     countryFeat([360, 626]),
  guinea:        countryFeat([598, 90]),
  'w-australia': provinceGroup(AU, (lon) => lon < 135),
  'e-australia': provinceGroup(AU, (lon, lat) => lon >= 135 && lat > -40),
  tazmania:      provinceGroup(AU, (lon, lat) => lat <= -40),
  'n-zealand':   countryFeat([554]),
};

// ---------------------------------------------------------------------------
// Generate paths and centroids
// ---------------------------------------------------------------------------

const paths = {};
const centroids = {};
const missing = [];

for (const [id, entry] of Object.entries(COMPOSITION)) {
  if (!entry) { missing.push(id); continue; }
  const d = entryPath(entry);
  if (!d) { missing.push(id); continue; }
  paths[id] = d;
  // Place the label/coin on the largest landmass, farthest from any edge — never off-shape.
  centroids[id] = labelPoint(d);
}

const compositionCount = Object.keys(COMPOSITION).length;
if (compositionCount !== EXPECTED_COUNT) console.warn(`Composition has ${compositionCount} entries, expected ${EXPECTED_COUNT}`);
if (missing.length) console.warn('Territories with NO geometry:', missing.join(', '));

const landPath = pathGen(landFeat) ?? '';

// ---------------------------------------------------------------------------
// Emit TypeScript
// ---------------------------------------------------------------------------

mkdirSync(resolve(ROOT, 'src/ui'), { recursive: true });

const ts = `// AUTO-GENERATED by scripts/build-imperial-map.mjs — do not edit by hand.
// Source: Natural Earth 110m (public domain). Projection: geoEquirectangular rotate([-12,0])
// Regenerate: node scripts/build-imperial-map.mjs
/* eslint-disable */
import type { TerritoryId } from '../engine/map';

export const MAP_W = ${MAP_W};
export const MAP_H = ${MAP_H};

export const TERRITORY_PATH: Record<TerritoryId, string> = ${JSON.stringify(paths, null, 2)} as any;

export const TERRITORY_CENTROID: Record<TerritoryId, { x: number; y: number; r: number }> = ${JSON.stringify(centroids, null, 2)} as any;

export const LAND_PATH = ${JSON.stringify(landPath)};
`;

writeFileSync(resolve(ROOT, 'src/ui/map-geometry-imperial.ts'), ts, 'utf8');
console.log(`Written src/ui/map-geometry-imperial.ts — ${Object.keys(paths).length}/${compositionCount} territories`);
if (missing.length || compositionCount !== EXPECTED_COUNT) process.exit(1);
