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
// Territory composition
// Each entry is either an array of ISO numeric codes OR a GeoJSON Feature (bbox).
// ---------------------------------------------------------------------------

const COMPOSITION = {
  // ── North America ──────────────────────────────────────────────────────────
  // Alaska is a sub-national territory of the USA (840).
  // Use a bbox covering the Alaskan peninsula and interior.
  alaska:                 bbox(-180, -130, 54, 72),
  // NW Territory covers northern Canada broadly.
  'northwest-territory':  bbox(-141, -60, 58, 84),
  greenland:              countryFeat([304]),
  // Alberta covers western Canada (south of NW Territory).
  alberta:                bbox(-141, -96, 49, 60),
  // Ontario covers central Canada.
  ontario:                bbox(-96, -74, 42, 60),
  // Quebec covers eastern Canada.
  quebec:                 bbox(-79, -52, 44, 62),
  'western-us':           bbox(-125, -100, 24, 49),
  'eastern-us':           bbox(-100, -67, 24, 47),
  // Mexico + Central America + Caribbean
  'central-america':      countryFeat([484, 320, 84, 340, 222, 558, 188, 591,
                                       192, 332, 214, 630, 388, 780, 388]),

  // ── South America ─────────────────────────────────────────────────────────
  // Venezuela territory covers northern SA + Caribbean coast
  venezuela:              countryFeat([862, 170, 328, 740, 260]),
  brazil:                 countryFeat([76]),
  // Peru territory covers western/central SA
  peru:                   countryFeat([604, 218, 68]),
  // Argentina covers southern SA
  argentina:              countryFeat([32, 152, 858, 600]),

  // ── Europe ────────────────────────────────────────────────────────────────
  iceland:                countryFeat([352]),
  // Great Britain covers UK + Ireland
  'great-britain':        countryFeat([826, 372]),
  // Scandinavia: Norway, Sweden, Finland, Denmark
  scandinavia:            countryFeat([578, 752, 246, 208]),
  // Northern Europe: Germany, Poland, Czech Republic, Slovakia
  'northern-europe':      countryFeat([276, 616, 203, 703]),
  // Western Europe: France, Netherlands, Belgium, Luxembourg
  'western-europe':       countryFeat([250, 528, 56, 442]),
  // Southern Europe: Spain, Portugal, Italy, Greece, Turkey, Balkans
  'southern-europe':      countryFeat([724, 620, 380, 300, 100, 688, 191, 705,
                                       807, 8, 70, 499, 792]),
  // Ukraine covers eastern Europe: Ukraine, Belarus, Romania, Moldova,
  // Hungary, Lithuania, Latvia, Estonia
  ukraine:                countryFeat([804, 112, 642, 498, 348, 440, 428, 233]),

  // ── Africa ────────────────────────────────────────────────────────────────
  // North Africa: Morocco, Algeria, Tunisia, Libya, Mauritania, Mali, Niger
  'north-africa':         countryFeat([504, 12, 788, 434, 478, 466, 562, 686]),
  egypt:                  countryFeat([818]),
  // East Africa: Sudan, Ethiopia, Somalia, Kenya, Uganda, Tanzania, Rwanda, Burundi, Djibouti, Eritrea, Chad
  'east-africa':          countryFeat([729, 728, 231, 706, 404, 800, 834, 646, 108, 262, 232, 148]),
  // Congo territory: DRC, Rep. Congo, Gabon, Cameroon, Central African Republic, Eq. Guinea
  congo:                  countryFeat([180, 178, 266, 120, 140, 226]),
  // South Africa: RSA, Namibia, Botswana, Zambia, Zimbabwe, Mozambique,
  //               Malawi, Eswatini, Lesotho, Angola
  'south-africa':         countryFeat([710, 516, 72, 894, 716, 508, 454, 748, 426, 24]),
  madagascar:             countryFeat([450]),

  // ── Asia — Russia is split into 5 territories via bounding boxes ──────────
  ural:                   bbox(55, 70, 52, 72),
  // Siberia covers a broad central swath
  siberia:                bbox(70, 109, 52, 76),
  // Yakutsk: far north-east Russia
  yakutsk:                bbox(108, 145, 60, 76),
  // Kamchatka: far east peninsula (antimeridian area)
  kamchatka:              bbox(140, 180, 48, 68),
  // Irkutsk: south-central Russia, Lake Baikal region
  irkutsk:                bbox(95, 125, 50, 61),
  mongolia:               countryFeat([496]),
  japan:                  countryFeat([392]),
  afghanistan:            countryFeat([4]),
  // China includes Taiwan
  china:                  countryFeat([156, 158]),
  // Middle East: Saudi Arabia, Iraq, Syria, Iran, Yemen, Oman, Jordan,
  //              Lebanon, Israel, Kuwait, UAE, Qatar, Bahrain, Palestine
  'middle-east':          countryFeat([682, 368, 760, 364, 887, 512, 400,
                                       422, 376, 414, 784, 634, 48, 275]),
  // India territory: India, Sri Lanka, Nepal, Bhutan, Bangladesh
  india:                  countryFeat([356, 144, 524, 64, 50]),
  // Siam: Thailand, Myanmar, Cambodia, Laos, Vietnam, Malaysia
  siam:                   countryFeat([764, 104, 116, 418, 704, 458]),

  // ── Australia ─────────────────────────────────────────────────────────────
  // Indonesia includes East Timor; use official IDs
  indonesia:              countryFeat([360, 626]),
  'new-guinea':           countryFeat([598]),
  // Western Australia is roughly west of 129°E
  'western-australia':    bbox(112, 129, -45, -14),
  // Eastern Australia covers the rest of the continent + Tasmania
  'eastern-australia':    bbox(129, 155, -45, -10),
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
  // For bbox features, use the stored midpoint; for country features, use geoCentroid.
  // pathGen.centroid() is unreliable near the antimeridian; geoCentroid() has winding
  // issues for rectangular bbox polygons.
  const precomputed = feat.properties?._center;
  const gc = precomputed ?? d3geo.geoCentroid(feat);
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
