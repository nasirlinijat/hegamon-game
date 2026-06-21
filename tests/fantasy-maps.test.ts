import { describe, it, expect } from 'vitest';
import { getMap } from '../src/engine/map-registry';
import { getMapRender } from '../src/ui/map-render';
import { createInitialState, type GameState } from '../src/engine/state';
import { DEFAULT_CONFIG, type MapId } from '../src/engine/modes';
import { validateAttack, applyAttack, calcReinforcements } from '../src/engine/rules';

const FANTASY: MapId[] = ['verdantia', 'isles', 'longmarch', 'twincrowns'];

// Parse an SVG path into its sub-polygon rings.
function rings(d: string): [number, number][][] {
  return d.split('M').filter(Boolean).map((g) => {
    const n = g.match(/-?\d+(?:\.\d+)?/g) ?? [];
    const r: [number, number][] = [];
    for (let i = 0; i + 1 < n.length; i += 2) r.push([+n[i]!, +n[i + 1]!]);
    return r;
  }).filter((r) => r.length >= 3);
}
function pointInRing(px: number, py: number, r: [number, number][]): boolean {
  let o = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) o = !o;
  }
  return o;
}
function minDistToAnyVertex(px: number, py: number, paths: string[]): number {
  let m = Infinity;
  for (const d of paths) {
    const n = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (let i = 0; i + 1 < n.length; i += 2) {
      const dx = px - +n[i]!, dy = py - +n[i + 1]!;
      m = Math.min(m, Math.hypot(dx, dy));
    }
  }
  return m;
}

describe.each(FANTASY)('fantasy map: %s — structure', (mapId) => {
  const map = getMap(mapId);

  it('registry resolves the board by id', () => {
    expect(map.id).toBe(mapId);
  });

  it('has territories across ≥4 continents', () => {
    expect(map.allTerritoryIds.length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(map.continents).length).toBeGreaterThanOrEqual(4);
  });

  it('every territory belongs to exactly one continent that lists it', () => {
    for (const id of map.allTerritoryIds) {
      const cont = map.continents[map.territories[id]!.continent]!;
      expect(cont).toBeDefined();
      expect(cont.territories).toContain(id);
    }
  });

  it('continent lists partition the full territory set with no overlap', () => {
    const all = Object.values(map.continents).flatMap((c) => c.territories);
    expect(all.length).toBe(map.allTerritoryIds.length);
    expect(new Set(all).size).toBe(map.allTerritoryIds.length);
  });

  it('adjacency is symmetric, with no self-edges or duplicates', () => {
    for (const a of map.allTerritoryIds) {
      const adj = map.adjacency[a]!;
      expect(adj).not.toContain(a);
      expect(new Set(adj).size).toBe(adj.length);
      for (const b of adj) expect(map.adjacency[b]!).toContain(a);
    }
  });

  it('every territory has at least one neighbour', () => {
    for (const a of map.allTerritoryIds) expect(map.adjacency[a]!.length).toBeGreaterThan(0);
  });

  it('the whole board is connected (BFS reaches every territory)', () => {
    const start = map.allTerritoryIds[0]!;
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of map.adjacency[cur]!) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    expect(seen.size).toBe(map.allTerritoryIds.length);
  });
});

describe.each(FANTASY)('fantasy map: %s — geometry/render', (mapId) => {
  const map = getMap(mapId);
  const render = getMapRender(mapId);

  it('renders a path for every territory and id lists match the engine', () => {
    expect(new Set(render.ALL_IDS)).toEqual(new Set(map.allTerritoryIds));
    for (const id of map.allTerritoryIds) {
      expect(render.TERRITORY_PATH[id]).toBeTruthy();
    }
  });

  it('every centroid sits inside its own territory shape', () => {
    const bad: string[] = [];
    for (const id of map.allTerritoryIds) {
      const c = render.TERRITORY_CENTROID[id]!;
      if (!rings(render.TERRITORY_PATH[id]!).some((r) => pointInRing(c.x, c.y, r))) bad.push(id);
    }
    expect(bad).toEqual([]);
  });

  it('sea-route connectors are in-bounds and land on rendered coast', () => {
    const paths = Object.values(render.TERRITORY_PATH);
    for (const c of render.GAP_CONNECTORS) {
      expect(c.x1).toBeGreaterThanOrEqual(0); expect(c.x1).toBeLessThanOrEqual(render.MAP_W);
      expect(c.y1).toBeGreaterThanOrEqual(0); expect(c.y1).toBeLessThanOrEqual(render.MAP_H);
      // Each endpoint should sit on (very near) some territory's outline.
      expect(minDistToAnyVertex(c.x1, c.y1, paths)).toBeLessThan(3);
      expect(minDistToAnyVertex(c.x2, c.y2, paths)).toBeLessThan(3);
    }
  });
});

describe.each(FANTASY)('fantasy map: %s — playability', (mapId) => {
  const config = { ...DEFAULT_CONFIG, mapId };
  const map = getMap(mapId);

  it('createInitialState deals every territory and sets state.map', () => {
    const s = createInitialState(['P1', 'P2'], { config });
    expect(s.map.id).toBe(mapId);
    for (const id of map.allTerritoryIds) expect(s.owner[id]).toBeDefined();
  });

  it('owning a whole continent grants its bonus', () => {
    const s = createInitialState(['P1', 'P2'], { config });
    const cont = Object.values(map.continents)[0]!;
    const owner = { ...s.owner };
    for (const id of cont.territories) owner[id] = 'P1';
    const withCont: GameState = { ...s, owner };
    const base = Math.max(3, Math.floor(map.allTerritoryIds.filter((id) => owner[id] === 'P1').length / 3));
    expect(calcReinforcements(withCont, 'P1')).toBe(base + cont.bonus);
  });

  it('an attack across a real edge resolves and can capture', () => {
    const s = createInitialState(['P1', 'P2'], { config });
    const a = map.allTerritoryIds[0]!;
    const b = map.adjacency[a]![0]!;
    const base: GameState = {
      ...s, phase: 'attack',
      owner: { ...s.owner, [a]: 'P1', [b]: 'P2' },
      armies: { ...s.armies, [a]: 5, [b]: 1 },
    };
    expect(validateAttack(base, a, b).ok).toBe(true);
    const after = applyAttack(base, { type: 'ATTACK', from: a, to: b, attackerRolls: [6, 5], defenderRolls: [1], moveOnCapture: 2 });
    expect(after.owner[b]).toBe('P1');
  });
});
