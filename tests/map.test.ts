import { describe, it, expect } from 'vitest';
import {
  ADJACENCY,
  ALL_TERRITORY_IDS,
  CONTINENTS,
  TERRITORIES,
  areAdjacent,
  neighbors,
  type TerritoryId,
} from '../src/engine/map';

describe('map: territory totals', () => {
  it('has exactly 42 territories', () => {
    expect(ALL_TERRITORY_IDS).toHaveLength(42);
    expect(Object.keys(TERRITORIES)).toHaveLength(42);
  });

  it('partitions all 42 territories across the six continents exactly once', () => {
    const fromContinents = Object.values(CONTINENTS).flatMap((c) => c.territories);
    expect(fromContinents).toHaveLength(42);
    // No territory appears in two continents.
    expect(new Set(fromContinents).size).toBe(42);
    // Every territory's declared continent matches the continent that lists it.
    for (const continent of Object.values(CONTINENTS)) {
      for (const id of continent.territories) {
        expect(TERRITORIES[id].continent).toBe(continent.id);
      }
    }
  });

  it('uses the continent bonuses from the spec', () => {
    expect(CONTINENTS.NA.bonus).toBe(5);
    expect(CONTINENTS.SA.bonus).toBe(2);
    expect(CONTINENTS.EU.bonus).toBe(5);
    expect(CONTINENTS.AF.bonus).toBe(3);
    expect(CONTINENTS.AS.bonus).toBe(7);
    expect(CONTINENTS.AU.bonus).toBe(2);
  });
});

describe('map: adjacency', () => {
  it('is symmetric — A→B implies B→A', () => {
    for (const a of ALL_TERRITORY_IDS) {
      for (const b of ADJACENCY[a]) {
        expect(
          ADJACENCY[b].includes(a),
          `${a} lists ${b} but ${b} does not list ${a}`,
        ).toBe(true);
      }
    }
  });

  it('references only known territory ids and never self-loops', () => {
    const known = new Set<TerritoryId>(ALL_TERRITORY_IDS);
    for (const a of ALL_TERRITORY_IDS) {
      const list = ADJACENCY[a];
      expect(list.includes(a), `${a} is adjacent to itself`).toBe(false);
      expect(new Set(list).size, `${a} has duplicate neighbors`).toBe(list.length);
      for (const b of list) {
        expect(known.has(b), `${a} references unknown ${b}`).toBe(true);
      }
    }
  });

  it('has an adjacency entry for every territory (no isolated land)', () => {
    for (const id of ALL_TERRITORY_IDS) {
      expect(neighbors(id).length).toBeGreaterThan(0);
    }
  });

  it('areAdjacent agrees with the adjacency table both ways', () => {
    expect(areAdjacent('alaska', 'kamchatka')).toBe(true);
    expect(areAdjacent('kamchatka', 'alaska')).toBe(true);
    expect(areAdjacent('brazil', 'north-africa')).toBe(true);
    expect(areAdjacent('alaska', 'brazil')).toBe(false);
  });

  it('spot-checks the most error-prone cross-continent bridges (both directions)', () => {
    const bridges: [TerritoryId, TerritoryId][] = [
      ['alaska', 'kamchatka'],
      ['greenland', 'iceland'],
      ['brazil', 'north-africa'],
      ['southern-europe', 'egypt'],
      ['siam', 'indonesia'],
      ['kamchatka', 'japan'],
    ];
    for (const [a, b] of bridges) {
      expect(areAdjacent(a, b), `missing bridge ${a}↔${b}`).toBe(true);
      expect(areAdjacent(b, a), `missing bridge ${b}↔${a}`).toBe(true);
    }
  });

  it('inter-continent edge set matches the complete canonical list exactly', () => {
    // Canonical cross-continent bridges for standard Risk — catches missing AND spurious links.
    const canonical: [TerritoryId, TerritoryId][] = [
      ['alaska', 'kamchatka'],
      ['greenland', 'iceland'],
      ['central-america', 'venezuela'],
      ['brazil', 'north-africa'],
      ['western-europe', 'north-africa'],
      ['southern-europe', 'north-africa'],
      ['southern-europe', 'egypt'],
      ['southern-europe', 'middle-east'],
      ['ukraine', 'ural'],
      ['ukraine', 'afghanistan'],
      ['ukraine', 'middle-east'],
      ['egypt', 'middle-east'],
      ['east-africa', 'middle-east'],
      ['siam', 'indonesia'],
    ];

    // Collect actual inter-continent edges as sorted "a|b" strings.
    const actual = new Set<string>();
    for (const a of ALL_TERRITORY_IDS) {
      for (const b of ADJACENCY[a]) {
        if (TERRITORIES[a].continent !== TERRITORIES[b].continent) {
          const key = [a, b].sort().join('|');
          actual.add(key);
        }
      }
    }
    const expected = new Set(canonical.map(([a, b]) => [a, b].sort().join('|')));

    for (const e of expected) {
      expect(actual.has(e), `canonical bridge missing: ${e}`).toBe(true);
    }
    for (const e of actual) {
      expect(expected.has(e), `spurious inter-continent edge: ${e}`).toBe(true);
    }
  });

  it('total undirected edge count is 83 (regression guard)', () => {
    const degreeSum = ALL_TERRITORY_IDS.reduce((s, id) => s + ADJACENCY[id].length, 0);
    expect(degreeSum / 2).toBe(83);
  });
});
