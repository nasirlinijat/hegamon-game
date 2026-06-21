// Procedural generator for IMAGINARY boards (no real-world geography).
//
// Each continent is an organic "blob" polygon; seeds are scattered inside and Lloyd-relaxed, then a
// Voronoi diagram clipped to the blob carves the continent into territories. Because territories TILE
// their continent, neighbours share exact borders — so adjacency is derived from shared edges and the
// visuals always fit. Continents are separated by sea; cross-continent links become sea-route
// connectors (drawn by map-render's gap detector).
//
// Outputs per map: src/engine/<id>-map.ts (engine data) + src/ui/map-geometry-<id>.ts (geometry).
// Regenerate: node scripts/build-fantasy-maps.mjs

import polygonClipping from 'polygon-clipping';
import { Delaunay } from 'd3-delaunay';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_W = 1280, MAP_H = 720;

// ── tiny utilities ──────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function polyArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1]; } return Math.abs(a / 2); }
function polyCentroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < r.length; i++) {
    const j = (i + 1) % r.length;
    const cross = r[i][0] * r[j][1] - r[j][0] * r[i][1];
    a += cross; x += (r[i][0] + r[j][0]) * cross; y += (r[i][1] + r[j][1]) * cross;
  }
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
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function minDistToEdges(p, r) {
  let m = Infinity;
  for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; m = Math.min(m, distToSeg(p, r[i], r[j])); }
  return m;
}
// Pole of inaccessibility (interior point farthest from edges) via coarse-then-fine grid search.
function labelPoint(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let best = polyCentroid(ring), bestD = pointInRing(best, ring) ? minDistToEdges(best, ring) : -1;
  let box = Math.max(maxX - minX, maxY - minY);
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let pass = 0; pass < 4; pass++) {
    const step = box / 8;
    for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) {
      const p = [cx + gx * step, cy + gy * step];
      if (!pointInRing(p, ring)) continue;
      const d = minDistToEdges(p, ring);
      if (d > bestD) { bestD = d; best = p; }
    }
    cx = best[0]; cy = best[1]; box *= 0.5;
  }
  return { x: best[0], y: best[1], r: Math.max(4, bestD) };
}

// ── organic continent blob ───────────────────────────────────────────────────────
function blob(cx, cy, rx, ry, wobble, rand, n = 80) {
  // Smooth radial wobble = sum of a few harmonics with random phase → organic, non-self-intersecting.
  const harmonics = [2, 3, 5].map((k) => ({ k, amp: wobble * (0.5 + rand()), phase: rand() * Math.PI * 2 }));
  const ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    let m = 1;
    for (const h of harmonics) m += h.amp * Math.sin(h.k * t + h.phase);
    m = Math.max(0.45, m);
    ring.push([cx + Math.cos(t) * rx * m, cy + Math.sin(t) * ry * m]);
  }
  return ring;
}

function scatterSeeds(ring, count, rand) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const seeds = [];
  let guard = 0;
  while (seeds.length < count && guard++ < count * 400) {
    const p = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
    if (pointInRing(p, ring)) seeds.push(p);
  }
  return seeds;
}

// Clip a Voronoi cell (ring) to the blob; return the largest resulting outer ring or null.
function clipCell(cell, blobRing) {
  const res = polygonClipping.intersection([cell], [blobRing]);
  if (!res || res.length === 0) return null;
  let best = null, bestA = -1;
  for (const poly of res) {
    const outer = poly[0];
    const a = polyArea(outer);
    if (a > bestA) { bestA = a; best = outer; }
  }
  return best;
}

// Tile a continent blob into `count` territory rings via relaxed Voronoi.
function tileContinent(blobRing, count, rand) {
  let seeds = scatterSeeds(blobRing, count, rand);
  if (seeds.length < count) count = seeds.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of blobRing) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const bounds = [minX - 20, minY - 20, maxX + 20, maxY + 20];

  // Lloyd relaxation for even cells.
  for (let iter = 0; iter < 5; iter++) {
    const vor = Delaunay.from(seeds).voronoi(bounds);
    const next = [];
    for (let i = 0; i < seeds.length; i++) {
      const cell = vor.cellPolygon(i);
      if (!cell) { next.push(seeds[i]); continue; }
      const clipped = clipCell(cell.map(([x, y]) => [x, y]), blobRing);
      next.push(clipped ? polyCentroid(clipped) : seeds[i]);
    }
    seeds = next;
  }

  const vor = Delaunay.from(seeds).voronoi(bounds);
  const rings = [];
  for (let i = 0; i < seeds.length; i++) {
    const cell = vor.cellPolygon(i);
    if (!cell) continue;
    const clipped = clipCell(cell.map(([x, y]) => [x, y]), blobRing);
    if (clipped && polyArea(clipped) > 80) rings.push(clipped.map(([x, y]) => [round1(x), round1(y)]));
  }
  return rings;
}

const round1 = (v) => Math.round(v * 10) / 10;

// ── adjacency from shared borders ──────────────────────────────────────────────
// Snap-keyed vertex sets; two territories in the same continent are adjacent when they share ≥2
// near-identical vertices (a shared edge). Voronoi neighbours share an edge's 2 endpoints exactly.
function vertexKeys(ring, snap = 1) {
  const s = new Set();
  for (const [x, y] of ring) s.add(`${Math.round(x / snap)},${Math.round(y / snap)}`);
  return s;
}
function sharedCount(a, b) { let n = 0; for (const k of a) if (b.has(k)) n++; return n; }

// ── name pools ─────────────────────────────────────────────────────────────────
function roman(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, sym] of map) while (n >= v) { s += sym; n -= v; } return s;
}

// ── per-map generation ───────────────────────────────────────────────────────────
function generate(spec) {
  const rand = mulberry32(spec.seed);
  const territories = []; // { id, name, cont }
  const contTerr = {};    // contKey -> [ids]
  const ringById = {};    // id -> ring
  const keysById = {};     // id -> vertex key set
  const blobs = [];        // continent blob rings (for LAND_PATH)

  const pool = (spec.namePool ?? []).slice();
  let poolIdx = 0;
  for (const c of spec.continents) {
    const blobRing = blob(c.cx, c.cy, c.rx, c.ry, c.wobble ?? 0.16, rand);
    blobs.push(blobRing);
    const rings = tileContinent(blobRing, c.seeds, rand);
    contTerr[c.key] = [];
    rings.forEach((ring, i) => {
      const id = `${c.key.toLowerCase()}-${i + 1}`;
      const name = pool[poolIdx++] ?? `${c.name} ${roman(i + 1)}`;
      territories.push({ id, name, cont: c.key });
      contTerr[c.key].push(id);
      ringById[id] = ring;
      keysById[id] = vertexKeys(ring);
    });
  }

  // Within-continent adjacency (shared border).
  const edges = new Set();
  const addEdge = (a, b) => { if (a !== b) edges.add([a, b].sort().join('|')); };
  for (const c of spec.continents) {
    const ids = contTerr[c.key];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (sharedCount(keysById[ids[i]], keysById[ids[j]]) >= 2) addEdge(ids[i], ids[j]);
    }
  }

  // Cross-continent sea routes: for each linked continent pair, connect the closest territory pair
  // (plus a second distinct pair when nearly as close, for a richer map).
  for (const [ka, kb] of spec.links) {
    const A = contTerr[ka], B = contTerr[kb];
    const cand = [];
    for (const a of A) for (const b of B) {
      let m = Infinity;
      for (const pa of ringById[a]) for (const pb of ringById[b]) m = Math.min(m, dist(pa, pb));
      cand.push({ a, b, d: m });
    }
    cand.sort((x, y) => x.d - y.d);
    if (cand[0]) addEdge(cand[0].a, cand[0].b);
    if (cand[1] && cand[1].a !== cand[0].a && cand[1].b !== cand[0].b && cand[1].d < cand[0].d * 1.8) {
      addEdge(cand[1].a, cand[1].b);
    }
  }

  // LAND_PATH = union of continent blobs.
  let land = [];
  try { land = polygonClipping.union(...blobs.map((b) => [b])); } catch { land = blobs.map((b) => [b]); }
  const landPath = land.map((poly) => ringToPath(poly[0])).join('');

  // Centroids (label points).
  const centroids = {};
  for (const t of territories) centroids[t.id] = roundC(labelPoint(ringById[t.id]));

  writeEngine(spec, territories, contTerr, [...edges]);
  writeGeometry(spec, territories, ringById, centroids, landPath);

  // Quick connectivity check (BFS) for the console.
  const adj = {};
  for (const t of territories) adj[t.id] = [];
  for (const e of edges) { const [a, b] = e.split('|'); adj[a].push(b); adj[b].push(a); }
  const seen = new Set([territories[0].id]); const stack = [territories[0].id];
  while (stack.length) { const cur = stack.pop(); for (const n of adj[cur]) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
  const connected = seen.size === territories.length;
  console.log(`${spec.id}: ${territories.length} territories, ${edges.size} edges, ${spec.continents.length} continents — ${connected ? 'CONNECTED ✓' : 'DISCONNECTED ✗ (' + seen.size + '/' + territories.length + ')'}`);
}

function ringToPath(ring) {
  if (!ring || ring.length < 3) return '';
  let d = `M${round1(ring[0][0])},${round1(ring[0][1])}`;
  for (let i = 1; i < ring.length; i++) d += `L${round1(ring[i][0])},${round1(ring[i][1])}`;
  return d + 'Z';
}
const roundC = (c) => ({ x: round1(c.x), y: round1(c.y), r: round1(c.r) });

// ── emit engine module ───────────────────────────────────────────────────────────
function writeEngine(spec, territories, contTerr, edges) {
  const contDefs = spec.continents.map((c) => {
    const terrLines = contTerr[c.key].map((id) => {
      const name = territories.find((t) => t.id === id).name;
      return `      ['${id}', ${JSON.stringify(name)}],`;
    }).join('\n');
    return `  {\n    id: '${c.key}',\n    name: ${JSON.stringify(c.name)},\n    bonus: ${c.bonus},\n    territories: [\n${terrLines}\n    ],\n  },`;
  }).join('\n');

  const edgeLines = edges.map((e) => { const [a, b] = e.split('|'); return `  ['${a}', '${b}'],`; }).join('\n');
  const CONST = spec.id.toUpperCase().replace(/-/g, '_') + '_MAP';

  const out = `// AUTO-GENERATED by scripts/build-fantasy-maps.mjs — do not edit by hand.
// Imaginary board "${spec.name}". Adjacency derived from shared Voronoi borders + sea-route links.
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
  const ids = def.territories.map(([id]) => id);
  continents[def.id] = { id: def.id, name: def.name, bonus: def.bonus, territories: ids };
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

// ── emit geometry module ─────────────────────────────────────────────────────────
function writeGeometry(spec, territories, ringById, centroids, landPath) {
  const paths = territories.map((t) => `  ${JSON.stringify(t.id)}: ${JSON.stringify(ringToPath(ringById[t.id]))},`).join('\n');
  const cents = territories.map((t) => `  ${JSON.stringify(t.id)}: ${JSON.stringify(centroids[t.id])},`).join('\n');
  const out = `// AUTO-GENERATED by scripts/build-fantasy-maps.mjs — do not edit by hand.
/* eslint-disable */
import type { TerritoryId } from '../engine/map';

export const MAP_W = ${MAP_W};
export const MAP_H = ${MAP_H};

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

// ── map specs ──────────────────────────────────────────────────────────────────
import { SPECS } from './fantasy-map-specs.mjs';
for (const spec of SPECS) generate(spec);
