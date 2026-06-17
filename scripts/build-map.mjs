/**
 * scripts/build-map.mjs
 * Generates src/ui/map-geometry.ts from Natural Earth 110m public-domain data.
 * Run once: node scripts/build-map.mjs
 * Output is committed; the app build has no runtime dependency on this script.
 */

import * as d3geo from 'd3-geo';
import { feature, merge } from 'topojson-client';
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

/**
 * Geographic bounding box as a GeoJSON Polygon. The ring is wound
 * counterclockwise (GeoJSON exterior convention) so d3-geo treats the interior
 * as the small area inside the box, not the rest of the globe.
 * The `_center` property is stored for centroid projection (geoCentroid() is
 * unreliable for bbox polygons near the antimeridian or poles).
 */
function bbox(lonMin, lonMax, latMin, latMax) {
  const pts = 16;
  const dl = (lonMax - lonMin) / pts;
  const da = (latMax - latMin) / pts;
  // CCW: bottom-left → top-left → top-right → bottom-right → close
  const coords = [
    ...Array.from({ length: pts }, (_, i) => [lonMin, latMin + da * i]),
    ...Array.from({ length: pts }, (_, i) => [lonMin + dl * i, latMax]),
    ...Array.from({ length: pts }, (_, i) => [lonMax, latMax - da * i]),
    ...Array.from({ length: pts }, (_, i) => [lonMax - dl * i, latMin]),
    [lonMin, latMin],
  ];
  return {
    type: 'Feature',
    properties: { _center: [(lonMin + lonMax) / 2, (latMin + latMax) / 2] },
    geometry: { type: 'Polygon', coordinates: [coords] },
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
// Centroid overrides (lon, lat) — used when geographic centroid is off-land
// or inside a "hole" left by the land clip.
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
};

// ---------------------------------------------------------------------------
// Territory composition — every country in the dataset is assigned exactly once
// (except Antarctica, Falklands, and bbox-handled Russia/USA/Canada/Australia).
// ---------------------------------------------------------------------------

const COMPOSITION = {
  // ── North America ──────────────────────────────────────────────────────────
  alaska:                 bbox(-180, -141, 55, 72),
  'northwest-territory':  bbox(-141, -52, 60, 84),
  greenland:              countryFeat([304]),
  alberta:                bbox(-141, -100, 49, 60),
  ontario:                bbox(-100, -76, 42, 60),
  quebec:                 bbox(-76, -52, 44, 60),
  'western-us':           bbox(-125, -100, 24, 49),
  'eastern-us':           bbox(-100, -67, 24, 47),
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
  ukraine:                countryFeat([804, 112, 642, 498, 348, 440, 428, 233,
                                       268, 51, 31]),

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

  // ── Asia — Russia split into 5 strictly non-overlapping bboxes ────────────
  // ural bbox + Kazakhstan (398) + Uzbekistan (860) + Turkmenistan (795)
  ural:     mergeFeats([bbox(55, 70, 52, 76), countryFeat([398, 860, 795])]),
  siberia:                bbox(70,  105, 52, 76),
  irkutsk:                bbox(105, 140, 50, 62),
  yakutsk:                bbox(105, 140, 62, 76),
  kamchatka:              bbox(140, 180, 48, 76),
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
  'western-australia':    bbox(112, 129, -45, -14),
  // Eastern Australia + New Zealand (554) + New Caledonia (540) + Fiji (242)
  'eastern-australia':    mergeFeats([bbox(129, 155, -45, -10),
                                      countryFeat([554, 540, 242])]),
};

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

// Merge all land to get a bounding feature for fitExtent
const landGeom = merge(topo, topo.objects.countries.geometries);
const landFeat = { type: 'Feature', geometry: landGeom, properties: {} };

const projection = d3geo.geoEquirectangular()
  .rotate([-12, 0])
  .fitExtent([[4, 4], [MAP_W - 4, MAP_H - 4]], landFeat);

const pathGen = d3geo.geoPath(projection);

// ---------------------------------------------------------------------------
// Generate paths and centroids
// ---------------------------------------------------------------------------

const paths = {};
const centroids = {};
const missing = [];

for (const [id, feat] of Object.entries(COMPOSITION)) {
  if (!feat) { missing.push(id); continue; }
  const d = pathGen(feat);
  if (!d) { missing.push(id); continue; }
  paths[id] = d;
  // Priority: explicit override → bbox _center property → geoCentroid.
  const override = CENTROID_OVERRIDE[id];
  const precomputed = feat.properties?._center;
  const gc = override ?? precomputed ?? d3geo.geoCentroid(feat);
  const c = projection(gc);
  if (!c || isNaN(c[0]) || isNaN(c[1])) {
    centroids[id] = { x: MAP_W / 2, y: MAP_H / 2 };
  } else {
    centroids[id] = { x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10 };
  }
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

export const TERRITORY_CENTROID: Record<TerritoryId, { x: number; y: number }> = ${JSON.stringify(centroids, null, 2)} as any;

export const LAND_PATH = ${JSON.stringify(landPath)};
`;

writeFileSync(resolve(ROOT, 'src/ui/map-geometry.ts'), ts, 'utf8');
console.log(`Written src/ui/map-geometry.ts — ${Object.keys(paths).length}/42 territories`);
if (missing.length) process.exit(1);
