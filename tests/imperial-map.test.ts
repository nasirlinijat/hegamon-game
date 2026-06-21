import { describe, it, expect } from 'vitest';
import { IMPERIAL_MAP } from '../src/engine/imperial-map';
import { getMap } from '../src/engine/map-registry';
import { areAdjacent, neighbors } from '../src/engine/map';
import { createInitialState, type GameState } from '../src/engine/state';
import { DEFAULT_CONFIG } from '../src/engine/modes';
import { validateAttack, applyAttack, calcReinforcements } from '../src/engine/rules';

const IMPERIAL_CONFIG = { ...DEFAULT_CONFIG, mapId: 'imperial' as const };

describe('imperial map: structure', () => {
  it('registry resolves the imperial board by id', () => {
    expect(getMap('imperial')).toBe(IMPERIAL_MAP);
    expect(getMap('classic').id).toBe('classic');
    expect(getMap(undefined).id).toBe('classic');
  });

  it('has 79 territories across 8 continents', () => {
    expect(IMPERIAL_MAP.allTerritoryIds.length).toBe(79);
    expect(Object.keys(IMPERIAL_MAP.continents).length).toBe(8);
  });

  it('every territory belongs to exactly one continent that lists it', () => {
    for (const id of IMPERIAL_MAP.allTerritoryIds) {
      const terr = IMPERIAL_MAP.territories[id]!;
      const continent = IMPERIAL_MAP.continents[terr.continent]!;
      expect(continent).toBeDefined();
      expect(continent.territories).toContain(id);
    }
  });

  it('continent territory lists sum to the full territory set with no overlap', () => {
    const fromContinents = Object.values(IMPERIAL_MAP.continents).flatMap((c) => c.territories);
    expect(fromContinents.length).toBe(IMPERIAL_MAP.allTerritoryIds.length);
    expect(new Set(fromContinents).size).toBe(IMPERIAL_MAP.allTerritoryIds.length);
  });

  it('adjacency is symmetric (A→B implies B→A)', () => {
    for (const a of IMPERIAL_MAP.allTerritoryIds) {
      for (const b of IMPERIAL_MAP.adjacency[a]!) {
        expect(IMPERIAL_MAP.adjacency[b]!).toContain(a);
      }
    }
  });

  it('no territory is adjacent to itself or has duplicate edges', () => {
    for (const a of IMPERIAL_MAP.allTerritoryIds) {
      const adj = IMPERIAL_MAP.adjacency[a]!;
      expect(adj).not.toContain(a);
      expect(new Set(adj).size).toBe(adj.length);
    }
  });

  it('every territory has at least one neighbour', () => {
    for (const a of IMPERIAL_MAP.allTerritoryIds) {
      expect(IMPERIAL_MAP.adjacency[a]!.length).toBeGreaterThan(0);
    }
  });

  it('the whole board is connected (BFS reaches every territory)', () => {
    const start = IMPERIAL_MAP.allTerritoryIds[0]!;
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of IMPERIAL_MAP.adjacency[cur]!) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    expect(seen.size).toBe(IMPERIAL_MAP.allTerritoryIds.length);
  });

  it('map-aware helpers operate on the imperial graph', () => {
    expect(areAdjacent('alaska', 'w-canada', undefined, IMPERIAL_MAP)).toBe(true);
    expect(areAdjacent('alaska', 'japan', undefined, IMPERIAL_MAP)).toBe(false);
    expect(neighbors('china', IMPERIAL_MAP)).toContain('mongolia');
  });
});

describe('imperial map: playability', () => {
  it('createInitialState deals every imperial territory and sets state.map', () => {
    const s = createInitialState(['P1', 'P2'], { config: IMPERIAL_CONFIG });
    expect(s.map.id).toBe('imperial');
    for (const id of IMPERIAL_MAP.allTerritoryIds) {
      expect(s.owner[id]).toBeDefined();
    }
    // No classic-only territory leaks onto the imperial board.
    expect(s.owner['alberta']).toBeUndefined();
  });

  it('reinforcements use imperial continents (owning a continent grants its bonus)', () => {
    const s = createInitialState(['P1', 'P2'], { config: IMPERIAL_CONFIG });
    // Hand all of Oceania to P1 and verify the +4 bonus lands on top of the base.
    const oceania = IMPERIAL_MAP.continents['OC']!;
    const owner = { ...s.owner };
    for (const id of oceania.territories) owner[id] = 'P1';
    const withOceania: GameState = { ...s, owner };
    const base = Math.max(3, Math.floor(
      IMPERIAL_MAP.allTerritoryIds.filter((id) => owner[id] === 'P1').length / 3,
    ));
    expect(calcReinforcements(withOceania, 'P1')).toBe(base + oceania.bonus);
  });

  it('a real attack across an imperial edge resolves and can capture', () => {
    const s = createInitialState(['P1', 'P2'], { config: IMPERIAL_CONFIG });
    const base: GameState = {
      ...s,
      phase: 'attack',
      owner: { ...s.owner, alaska: 'P1', 'w-canada': 'P2' },
      armies: { ...s.armies, alaska: 5, 'w-canada': 1 },
    };
    expect(validateAttack(base, 'alaska', 'w-canada').ok).toBe(true);
    const after = applyAttack(base, {
      type: 'ATTACK', from: 'alaska', to: 'w-canada',
      attackerRolls: [6, 5], defenderRolls: [1], moveOnCapture: 2,
    });
    expect(after.owner['w-canada']).toBe('P1');
  });
});
