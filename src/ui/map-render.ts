// Per-board rendering data for <Board>. Each playable map projects to its own SVG geometry
// (src/ui/map-geometry*.ts). This module turns that raw geometry plus the engine's adjacency graph
// into everything the board draws: pruned territory paths, the land outline, the id list, and the
// "gap connector" sea-route lines between adjacent territories whose drawn shapes don't touch.
//
// Bundles are computed once at module load and selected per game by `getMapRender(mapId)`.

import { CLASSIC_MAP, type GameMap, type TerritoryId } from '../engine/map';
import { IMPERIAL_MAP } from '../engine/imperial-map';
import { VERDANTIA_MAP } from '../engine/verdantia-map';
import { ISLES_MAP } from '../engine/isles-map';
import { LONGMARCH_MAP } from '../engine/longmarch-map';
import { TWINCROWNS_MAP } from '../engine/twincrowns-map';
import { AURELIA_MAP } from '../engine/aurelia-map';
import { EUROPE_MAP } from '../engine/europe-map';
import { UK_MAP } from '../engine/uk-map';
import { STORYBOOK_MAP } from '../engine/storybook-map';
import * as classicGeo from './map-geometry';
import * as imperialGeo from './map-geometry-imperial';
import * as verdantiaGeo from './map-geometry-verdantia';
import * as islesGeo from './map-geometry-isles';
import * as longmarchGeo from './map-geometry-longmarch';
import * as twincrownsGeo from './map-geometry-twincrowns';
import * as aureliaGeo from './map-geometry-aurelia';
import * as europeGeo from './map-geometry-europe';
import * as ukGeo from './map-geometry-uk';
import * as storybookGeo from './map-geometry-storybook';

export interface Connector { x1: number; y1: number; x2: number; y2: number; c?: number }
export interface WrapStub { from: TerritoryId; toEdge: number; label: string }

export interface MapRender {
  MAP_W: number;
  MAP_H: number;
  TERRITORY_PATH: Record<string, string>;
  TERRITORY_CENTROID: Record<string, { x: number; y: number; r?: number }>;
  LAND_PATH: string;
  ALL_IDS: TerritoryId[];
  GAP_CONNECTORS: Connector[];
  WRAP_STUBS: WrapStub[];
}

interface RawGeo {
  MAP_W: number;
  MAP_H: number;
  TERRITORY_PATH: Record<string, string>;
  TERRITORY_CENTROID: Record<string, { x: number; y: number; r?: number }>;
  LAND_PATH: string;
}

interface Tuning {
  /** Per-territory minimum sub-polygon area (drops stray specks). */
  pruneMin?: Record<string, number>;
  /** Hand-tuned connector endpoints for routes whose nearest points land in a misleading spot. */
  overrides?: Record<string, Connector>;
  /** Adjacent pairs that should NOT draw a connector line (near borders convey adjacency). */
  noConnector?: string[];
  /** Adjacent pairs to skip entirely (e.g. a trans-map dateline wrap drawn as edge stubs instead). */
  excludePairs?: Array<[TerritoryId, TerritoryId]>;
  wrapStubs?: WrapStub[];
  /** Max sampled outline points per territory for gap detection (higher = more accurate). */
  sampleCap?: number;
  /** Minimum pixel gap between two adjacent shapes before a connector line is drawn. */
  gapThreshold?: number;
  /** When set, treat two territories that share an outline vertex (snapped to this px grid) as
   *  touching — no connector — independent of how coarsely their outlines were sampled. */
  touchGrid?: number;
}

// Prune tiny sub-polygons (speck islands) that just add visual noise. Each shape keeps its real
// outline and at least its largest piece.
function pruneSubpaths(d: string, minArea: number, keepLargest: boolean): string {
  const subs = d.split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
  const areaOf = (sp: string): number => {
    const n = sp.match(/-?\d+(?:\.\d+)?/g);
    if (!n) return 0;
    const p: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) p.push([+n[i]!, +n[i + 1]!]);
    let a = 0;
    for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i]![0] * p[j]![1] - p[j]![0] * p[i]![1]; }
    return Math.abs(a / 2);
  };
  const scored = subs.map((s) => ({ s, area: areaOf(s) }));
  let kept = scored.filter((x) => x.area >= minArea);
  if (keepLargest && kept.length === 0 && scored.length) kept = [scored.reduce((a, b) => (a.area > b.area ? a : b))];
  return kept.map((x) => x.s).join('');
}

function pathPoints(d: string, cap: number): [number, number][] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([+nums[i]!, +nums[i + 1]!]);
  const step = Math.max(1, Math.floor(pts.length / cap)); // sample down for speed
  return pts.filter((_, i) => i % step === 0);
}

/** Set of outline vertices snapped to a `grid`-px lattice — used to detect shared borders. */
function vertexCells(d: string, grid: number): Set<string> {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  const cells = new Set<string>();
  if (!nums) return cells;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    cells.add(`${Math.round(+nums[i]! / grid)},${Math.round(+nums[i + 1]! / grid)}`);
  }
  return cells;
}
function shareVertex(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of small) if (big.has(k)) return true;
  return false;
}

function nearest(a: [number, number][], b: [number, number][]) {
  let m = Infinity, pa = a[0] ?? [0, 0] as [number, number], pb = b[0] ?? [0, 0] as [number, number];
  for (const p of a) for (const q of b) {
    const dx = p[0] - q[0], dy = p[1] - q[1];
    const d2 = dx * dx + dy * dy;
    if (d2 < m) { m = d2; pa = p; pb = q; }
  }
  return { gap: Math.sqrt(m), pa, pb };
}

function build(geo: RawGeo, map: GameMap, tuning: Tuning = {}): MapRender {
  const pruneMin = tuning.pruneMin ?? {};
  const TERRITORY_PATH: Record<string, string> = Object.fromEntries(
    Object.entries(geo.TERRITORY_PATH).map(([k, v]) => [k, pruneSubpaths(v, pruneMin[k] ?? 30, true)]),
  );
  const LAND_PATH = pruneSubpaths(geo.LAND_PATH, 30, false);
  const ALL_IDS = Object.keys(TERRITORY_PATH) as TerritoryId[];

  const overrides = tuning.overrides ?? {};
  const noConnector = new Set(tuning.noConnector ?? []);
  const excluded = new Set((tuning.excludePairs ?? []).map(([a, b]) => [a, b].sort().join('|')));
  const sampleCap = tuning.sampleCap ?? 80;
  const gapThreshold = tuning.gapThreshold ?? 8;
  const touchGrid = tuning.touchGrid;

  const pts: Record<string, [number, number][]> = {};
  for (const id of ALL_IDS) pts[id] = pathPoints(TERRITORY_PATH[id] ?? '', sampleCap);
  // Full-resolution vertex lattices for shared-border detection (only built when touchGrid is set).
  const cells: Record<string, Set<string>> = {};
  if (touchGrid) for (const id of ALL_IDS) cells[id] = vertexCells(TERRITORY_PATH[id] ?? '', touchGrid);

  const seen = new Set<string>();
  const GAP_CONNECTORS: Connector[] = [];
  for (const a of ALL_IDS) {
    for (const b of map.adjacency[a] ?? []) {
      const key = [a, b].sort().join('|');
      if (excluded.has(key) || seen.has(key)) continue;
      seen.add(key);
      if (noConnector.has(key)) continue;
      // Hand-tuned overrides are placed deliberately (a chosen crossing point) — use them verbatim.
      const override = overrides[key];
      if (override) { GAP_CONNECTORS.push(override); continue; }
      // Territories that share a border vertex are touching — never draw a connector through land.
      if (touchGrid && cells[a] && cells[b] && shareVertex(cells[a]!, cells[b]!)) continue;
      const pa = pts[a], pb = pts[b];
      if (!pa || !pb || pa.length === 0 || pb.length === 0) continue;
      // Computed connectors span the nearest sampled edge points, so they already sit on each coast.
      const { gap, pa: from, pb: to } = nearest(pa, pb);
      if (gap > gapThreshold) GAP_CONNECTORS.push({ x1: from[0], y1: from[1], x2: to[0], y2: to[1] });
    }
  }

  return {
    MAP_W: geo.MAP_W,
    MAP_H: geo.MAP_H,
    TERRITORY_PATH,
    TERRITORY_CENTROID: geo.TERRITORY_CENTROID,
    LAND_PATH,
    ALL_IDS,
    GAP_CONNECTORS,
    WRAP_STUBS: tuning.wrapStubs ?? [],
  };
}

const CLASSIC: MapRender = build(classicGeo, CLASSIC_MAP, {
  pruneMin: { mongolia: 200, 'western-europe': 200 },
  overrides: {
    // From Indonesia's main landmass south coast (with the coin) to Australia's NW coast — the
    // closer specks are tiny islands that read as sea, so anchor on the big visible blob.
    'indonesia|western-australia': { x1: 946.7, y1: 423.1, x2: 974.5, y2: 453.3 },
    'eastern-australia|new-guinea': { x1: 1046, y1: 443, x2: 1035, y2: 465, c: -10 },
    'china|japan': { x1: 989, y1: 319, x2: 954, y2: 339, c: -12 },
    'japan|kamchatka': { x1: 1032, y1: 280, x2: 1063, y2: 252, c: 12 },
    'north-africa|western-europe': { x1: 595, y1: 304, x2: 580, y2: 315, c: 9 },
    'great-britain|scandinavia': { x1: 598.9, y1: 241.4, x2: 619.4, y2: 228.8 },
    // Great Britain's continental link is the English Channel to Western Europe (France), not the
    // North Sea to Northern Europe — draw the Channel crossing and suppress the N.E line below.
    'great-britain|western-europe': { x1: 606.3, y1: 261.8, x2: 612.1, y2: 260.7 },
  },
  noConnector: ['northwest-territory|ontario', 'alaska|northwest-territory', 'kamchatka|mongolia', 'great-britain|northern-europe'],
  excludePairs: [['alaska', 'kamchatka']],
  wrapStubs: [
    { from: 'alaska', toEdge: 4, label: '↜' },
    { from: 'kamchatka', toEdge: classicGeo.MAP_W - 4, label: '↝' },
  ],
});

// The imperial board has many large, land-adjacent territories. A shared-border vertex test
// (touchGrid) suppresses connectors between touching territories regardless of outline sampling, so
// only genuine sea crossings keep a dotted line. sampleCap is high because, after the touch filter,
// the nearest-point gap is computed for just the handful of non-touching (sea) pairs.
const IMPERIAL: MapRender = build(imperialGeo, IMPERIAL_MAP, {
  touchGrid: 2,
  // Draw a connector for any adjacency with a visible gap (≥3px). Below that the territories read as
  // touching, so a line would just be clutter. This keeps every neighbour reachable-looking: each
  // adjacency either visibly shares a border or has a sea-route line.
  gapThreshold: 3,
  sampleCap: 2000,
  // China is carved from the country polygon by box-clips (uyghur west, manchuria NE); the diff can
  // leave small slivers near Mongolia. Prune China's specks so only the main landmass renders.
  pruneMin: { china: 120 },
  // India/Uyghur and China/India are Himalayan land borders that visibly touch — the small gap there
  // would draw a redundant line, so suppress it (the shared border conveys the adjacency).
  noConnector: ['india|uyghur', 'china|india'],
  overrides: {
    // Indonesia↔W.Australia: same geometry as the classic board → same Timor crossing (its computed
    // nearest point lands on the misleading east tip otherwise).
    'indonesia|w-australia': { x1: 946.7, y1: 423.1, x2: 974.5, y2: 453.3 },
    // Greece↔Turkiye: cross the open Aegean from Greece's central-east coast to Turkiye's west coast,
    // not the Dardanelles corner the nearest-point picks.
    'greece|turkiye': { x1: 675, y1: 294, x2: 682, y2: 295 },
  },
});

// Imaginary boards: territories tile each continent (sharing exact Voronoi borders), so the shared-
// vertex test (touchGrid) suppresses all internal connectors; only cross-continent sea routes draw a
// line. Generated coords are rounded to 0.1px, so a touchGrid of 2 reliably catches shared borders.
const FANTASY_TUNING = { touchGrid: 2, gapThreshold: 4, sampleCap: 2000 } as const;
const VERDANTIA: MapRender  = build(verdantiaGeo,  VERDANTIA_MAP,  FANTASY_TUNING);
const ISLES: MapRender      = build(islesGeo,      ISLES_MAP,      FANTASY_TUNING);
const LONGMARCH: MapRender  = build(longmarchGeo,  LONGMARCH_MAP,  FANTASY_TUNING);
const TWINCROWNS: MapRender = build(twincrownsGeo, TWINCROWNS_MAP, FANTASY_TUNING);
const AURELIA: MapRender    = build(aureliaGeo,    AURELIA_MAP,    FANTASY_TUNING);
// Atlas board: positioned-seed Voronoi clipped to landmasses; touching provinces share borders, sea
// routes get connectors. Larger canvas (2000×1480) so a slightly bigger gap threshold reads cleanly.
const EUROPE: MapRender = build(europeGeo, EUROPE_MAP, { touchGrid: 2, gapThreshold: 6, sampleCap: 2400 });
const UK: MapRender = build(ukGeo, UK_MAP, { touchGrid: 2, gapThreshold: 6, sampleCap: 2400 });
const STORYBOOK: MapRender = build(storybookGeo, STORYBOOK_MAP, { touchGrid: 2, gapThreshold: 6, sampleCap: 2400 });

export function getMapRender(mapId: string): MapRender {
  switch (mapId) {
    case 'imperial':   return IMPERIAL;
    case 'verdantia':  return VERDANTIA;
    case 'isles':      return ISLES;
    case 'longmarch':  return LONGMARCH;
    case 'twincrowns': return TWINCROWNS;
    case 'aurelia':    return AURELIA;
    case 'europe':     return EUROPE;
    case 'uk':         return UK;
    case 'storybook':  return STORYBOOK;
    default:           return CLASSIC;
  }
}
