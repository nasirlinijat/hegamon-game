// Generator for ATLAS-style boards: every territory is a positioned seed at its real-world location.
// One global Voronoi is clipped to authored landmasses (mainland + islands), so coasts and islands
// form correctly. Adjacency is derived from shared clipped borders (≈ real geography because seeds
// are real-positioned) plus explicit sea routes. Emits engine + geometry modules.
//
// Run: node scripts/build-atlas-map.mjs            (all atlas specs)
//      node scripts/build-atlas-map.mjs europe     (one)

import polygonClipping from 'polygon-clipping';
import { Delaunay } from 'd3-delaunay';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const round1 = (v) => Math.round(v * 10) / 10;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function polyArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return Math.abs(a / 2); }
function polyCentroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; const c = r[i][0] * r[j][1] - r[j][0] * r[i][1]; a += c; x += (r[i][0] + r[j][0]) * c; y += (r[i][1] + r[j][1]) * c; }
  if (Math.abs(a) < 1e-6) { const m = r.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]); return [m[0] / r.length, m[1] / r.length]; }
  a *= 0.5; return [x / (6 * a), y / (6 * a)];
}
function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function minDistToEdges(p, r) { let m = Infinity; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; m = Math.min(m, distToSeg(p, r[i], r[j])); } return m; }
function labelPoint(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let best = polyCentroid(ring), bestD = pointInRing(best, ring) ? minDistToEdges(best, ring) : -1;
  let box = Math.max(maxX - minX, maxY - minY), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let pass = 0; pass < 5; pass++) {
    const step = box / 8;
    for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) {
      const p = [cx + gx * step, cy + gy * step];
      if (!pointInRing(p, ring)) continue;
      const d = minDistToEdges(p, ring); if (d > bestD) { bestD = d; best = p; }
    }
    cx = best[0]; cy = best[1]; box *= 0.5;
  }
  return { x: round1(best[0]), y: round1(best[1]), r: round1(Math.max(4, bestD)) };
}
function circleRing(cx, cy, r, n = 18) {
  const ring = []; for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; ring.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return ring;
}
function clipCell(cell, landPoly) {
  let res; try { res = polygonClipping.intersection([cell], [landPoly]); } catch { return null; }
  if (!res || res.length === 0) return null;
  let best = null, bestA = -1;
  for (const poly of res) { const a = polyArea(poly[0]); if (a > bestA) { bestA = a; best = poly[0]; } }
  return best;
}
function vertexKeys(ring, snap = 2) { const s = new Set(); for (const [x, y] of ring) s.add(`${Math.round(x / snap)},${Math.round(y / snap)}`); return s; }
function sharedCount(a, b) { let n = 0; for (const k of a) if (b.has(k)) n++; return n; }
function ringToPath(ring) {
  if (!ring || ring.length < 3) return '';
  let d = `M${round1(ring[0][0])},${round1(ring[0][1])}`;
  for (let i = 1; i < ring.length; i++) d += `L${round1(ring[i][0])},${round1(ring[i][1])}`;
  return d + 'Z';
}
function roman(n) { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, sym] of m) while (n >= v) { s += sym; n -= v; } return s; }

function generate(spec) {
  // The Board renders every map into a fixed 1280×720 viewBox, so fit the authored coordinates
  // (which may use any canvas) uniformly into 1280×720 with a small margin, centred.
  const W = 1280, H = 720, margin = 16;
  {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pts = [...spec.territories.map((t) => [t.x, t.y]), ...(spec.landmasses ?? []).flatMap((lm) => lm.ring)];
    for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const s = Math.min((W - 2 * margin) / (maxX - minX), (H - 2 * margin) / (maxY - minY));
    const ox = (W - (maxX - minX) * s) / 2 - minX * s;
    const oy = (H - (maxY - minY) * s) / 2 - minY * s;
    const fx = (x) => x * s + ox, fy = (y) => y * s + oy;
    spec = {
      ...spec,
      territories: spec.territories.map((t) => ({ ...t, x: fx(t.x), y: fy(t.y), ...(t.r ? { r: t.r * s } : {}) })),
      landmasses: (spec.landmasses ?? []).map((lm) => ({ ...lm, ring: lm.ring.map(([x, y]) => [fx(x), fy(y)]) })),
      islandR: (spec.islandR ?? 26) * s,
    };
  }
  const seeds = spec.territories.map((t) => [t.x, t.y]);
  const vor = Delaunay.from(seeds).voronoi([0, 0, W, H]);
  const landmasses = (spec.landmasses ?? []).map((lm) => lm.ring);
  const islandR = spec.islandR ?? 26;

  const containing = (p) => landmasses.find((r) => pointInRing(p, r)) ?? null;

  const ringById = {}, keysById = {}, contOf = {};
  spec.territories.forEach((t, i) => {
    const cell = vor.cellPolygon(i);
    const land = containing([t.x, t.y]);
    const clipPoly = land ?? circleRing(t.x, t.y, t.r ?? islandR);
    let ring = cell ? clipCell(cell.map(([x, y]) => [x, y]), clipPoly) : null;
    if (!ring || polyArea(ring) < 40) ring = circleRing(t.x, t.y, t.r ?? islandR);
    ring = ring.map(([x, y]) => [round1(x), round1(y)]);
    ringById[t.id] = ring; keysById[t.id] = vertexKeys(ring); contOf[t.id] = t.cont;
  });

  // Adjacency from shared clipped borders (within a landmass), plus authored sea routes.
  const edges = new Set();
  const addEdge = (a, b) => { if (a !== b && ringById[a] && ringById[b]) edges.add([a, b].sort().join('|')); };
  const ids = spec.territories.map((t) => t.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (sharedCount(keysById[ids[i]], keysById[ids[j]]) >= 2) addEdge(ids[i], ids[j]);
  }
  for (const [a, b] of (spec.seaRoutes ?? [])) addEdge(a, b);

  // Connectivity fix: connect any remaining components by nearest territory pair.
  const adjList = () => { const m = {}; for (const id of ids) m[id] = []; for (const e of edges) { const [a, b] = e.split('|'); m[a].push(b); m[b].push(a); } return m; };
  let guard = 0;
  while (guard++ < ids.length) {
    const m = adjList();
    const seen = new Set([ids[0]]); const st = [ids[0]];
    while (st.length) { const c = st.pop(); for (const n of m[c]) if (!seen.has(n)) { seen.add(n); st.push(n); } }
    if (seen.size === ids.length) break;
    const inSet = [...seen], out = ids.filter((x) => !seen.has(x));
    const pos = (id) => { const t = spec.territories.find((tt) => tt.id === id); return [t.x, t.y]; };
    let best = null, bestD = Infinity;
    for (const a of inSet) for (const b of out) { const d = dist(pos(a), pos(b)); if (d < bestD) { bestD = d; best = [a, b]; } }
    if (best) addEdge(best[0], best[1]); else break;
  }

  // LAND_PATH = union of all territory rings.
  let land = [];
  try { land = polygonClipping.union(...ids.map((id) => [ringById[id]])); } catch { land = ids.map((id) => [ringById[id]]); }
  const landPath = land.map((poly) => ringToPath(poly[0])).join('');

  const centroids = {}; for (const id of ids) centroids[id] = labelPoint(ringById[id]);

  // continent -> ordered territory ids
  const contTerr = {};
  for (const t of spec.territories) (contTerr[t.cont] ??= []).push(t.id);

  generate._edges = [...edges];
  writeEngine(spec, contTerr);
  writeGeometry(spec, ids, ringById, centroids, landPath, W, H);

  // connectivity report
  const m = adjList(); const seen = new Set([ids[0]]); const st = [ids[0]];
  while (st.length) { const c = st.pop(); for (const n of m[c]) if (!seen.has(n)) { seen.add(n); st.push(n); } }
  console.log(`${spec.id}: ${ids.length} territories, ${edges.size} edges, ${spec.continents.length} continents — ${seen.size === ids.length ? 'CONNECTED ✓' : 'DISCONNECTED ✗ (' + seen.size + '/' + ids.length + ')'}`);
}

function writeEngine(spec, contTerr) {
  const contDefs = spec.continents.map((c) => {
    const terr = contTerr[c.key] ?? [];
    const lines = terr.map((id) => `      ['${id}', ${JSON.stringify(spec.territories.find((t) => t.id === id).name)}],`).join('\n');
    return `  {\n    id: '${c.key}',\n    name: ${JSON.stringify(c.name)},\n    bonus: ${c.bonus},\n    territories: [\n${lines}\n    ],\n  },`;
  }).join('\n');
  const edgeLines = generate._edges.map((e) => { const [a, b] = e.split('|'); return `  ['${a}', '${b}'],`; }).join('\n');
  const CONST = spec.id.toUpperCase().replace(/-/g, '_') + '_MAP';
  const out = `// AUTO-GENERATED by scripts/build-atlas-map.mjs — do not edit by hand.
// Board "${spec.name}". Positioned-seed atlas; adjacency from shared borders + sea routes.
import {
  type GameMap, type Continent, type Territory, type TerritoryId, type ContinentId,
} from './map';

const CONTINENT_DEFS: ReadonlyArray<{
  id: ContinentId; name: string; bonus: number;
  territories: ReadonlyArray<readonly [TerritoryId, string]>;
}> = [
${contDefs}
];

const EDGES: ReadonlyArray<readonly [TerritoryId, TerritoryId]> = [
${edgeLines}
];

const continents: Record<ContinentId, Continent> = {};
const territories: Record<TerritoryId, Territory> = {};
const allTerritoryIds: TerritoryId[] = [];
const adjacency: Record<TerritoryId, TerritoryId[]> = {};

for (const def of CONTINENT_DEFS) {
  const cids = def.territories.map(([id]) => id);
  continents[def.id] = { id: def.id, name: def.name, bonus: def.bonus, territories: cids };
  for (const [id, name] of def.territories) {
    territories[id] = { id, name, continent: def.id };
    allTerritoryIds.push(id);
    adjacency[id] = [];
  }
}
for (const [a, b] of EDGES) {
  if (!territories[a]) throw new Error(\`${spec.id} map: edge references unknown territory '\${a}'\`);
  if (!territories[b]) throw new Error(\`${spec.id} map: edge references unknown territory '\${b}'\`);
  if (!adjacency[a]!.includes(b)) adjacency[a]!.push(b);
  if (!adjacency[b]!.includes(a)) adjacency[b]!.push(a);
}

export const ${CONST}: GameMap = {
  id: '${spec.id}',
  name: ${JSON.stringify(spec.name)},
  continents,
  territories,
  adjacency,
  allTerritoryIds,
};
`;
  writeFileSync(join(ROOT, `src/engine/${spec.id}-map.ts`), out);
}

function writeGeometry(spec, ids, ringById, centroids, landPath, W, H) {
  const paths = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(ringToPath(ringById[id]))},`).join('\n');
  const cents = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(centroids[id])},`).join('\n');
  const out = `// AUTO-GENERATED by scripts/build-atlas-map.mjs — do not edit by hand.
/* eslint-disable */
import type { TerritoryId } from '../engine/map';

export const MAP_W = ${W};
export const MAP_H = ${H};

export const TERRITORY_PATH: Record<TerritoryId, string> = {
${paths}
} as any;

export const TERRITORY_CENTROID: Record<TerritoryId, { x: number; y: number; r: number }> = {
${cents}
} as any;

export const LAND_PATH = ${JSON.stringify(landPath)};
`;
  writeFileSync(join(ROOT, `src/ui/map-geometry-${spec.id}.ts`), out);
}

export { generate, roman };

import { EUROPE_SPEC } from './europe-spec.mjs';
const SPECS = [EUROPE_SPEC];
const only = process.argv[2];
for (const spec of SPECS) if (!only || spec.id === only) generate(spec);
