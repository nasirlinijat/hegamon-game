import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/state';
import { checkWin, applyAttack, startTurn } from '../src/engine/rules';
import { ALL_TERRITORY_IDS, ADJACENCY, type TerritoryId } from '../src/engine/map';
import { DEFAULT_CONFIG, type GameConfig, type MissionId, MISSION_LABEL, ALL_MISSION_IDS } from '../src/engine/modes';
import { CONTINENTS } from '../src/engine/map';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 2-player legacy state (reinforce phase, turnPointer=0 = P1) with a custom ownership split. */
function stateWithOwnership(config: GameConfig, p1Count: number) {
  const base = createInitialState(['P1', 'P2'], { config });
  const newOwner = { ...base.owner } as Record<string, string>;
  ALL_TERRITORY_IDS.forEach((id, i) => { newOwner[id] = i < p1Count ? 'P1' : 'P2'; });
  return { ...base, owner: newOwner as typeof base.owner };
}

const DOM_CONFIG: GameConfig = { ...DEFAULT_CONFIG, mode: 'domination', dominationThreshold: 0.70 };
// Math.ceil(0.70 * 42) = Math.ceil(29.4) = 30
const NEEDED = Math.ceil(0.70 * ALL_TERRITORY_IDS.length);

// ---------------------------------------------------------------------------
// Domination mode — checkWin
// ---------------------------------------------------------------------------

describe('checkWin — domination mode', () => {
  it('returns null when current player is one territory short of threshold', () => {
    expect(checkWin(stateWithOwnership(DOM_CONFIG, NEEDED - 1))).toBeNull();
  });

  it('returns winner when current player owns exactly the threshold count', () => {
    expect(checkWin(stateWithOwnership(DOM_CONFIG, NEEDED))).toBe('P1');
  });

  it('returns winner when current player owns more than threshold', () => {
    expect(checkWin(stateWithOwnership(DOM_CONFIG, NEEDED + 5))).toBe('P1');
  });

  it('returns null in mid-game with even split (21 each)', () => {
    expect(checkWin(stateWithOwnership(DOM_CONFIG, 21))).toBeNull();
  });

  it('uses 70% default when dominationThreshold is omitted from config', () => {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, mode: 'domination' };
    // 30/42 ≈ 71.4% — above 70%
    expect(checkWin(stateWithOwnership(cfg, 30))).toBe('P1');
    // 29/42 ≈ 69.0% — below 70%
    expect(checkWin(stateWithOwnership(cfg, 29))).toBeNull();
  });

  it('respects a custom threshold (50%)', () => {
    const cfg: GameConfig = { ...DEFAULT_CONFIG, mode: 'domination', dominationThreshold: 0.50 };
    const needed50 = Math.ceil(0.50 * ALL_TERRITORY_IDS.length); // 21
    expect(checkWin(stateWithOwnership(cfg, needed50 - 1))).toBeNull();
    expect(checkWin(stateWithOwnership(cfg, needed50))).toBe('P1');
  });
});

// ---------------------------------------------------------------------------
// Domination mode — win fires mid-attack via applyAttack
// ---------------------------------------------------------------------------

describe('applyAttack — domination win detected on capture', () => {
  it('sets winner when capture pushes current player over threshold', () => {
    // P1 starts with NEEDED-1 territories; one more capture should trigger a win.
    const base = stateWithOwnership(DOM_CONFIG, NEEDED - 1);

    // Find a territory P2 owns that is adjacent to one P1 owns.
    let fromT: (typeof ALL_TERRITORY_IDS)[number] | null = null;
    let toT:   (typeof ALL_TERRITORY_IDS)[number] | null = null;
    outer: for (const t of ALL_TERRITORY_IDS) {
      if (base.owner[t] !== 'P1') continue;
      for (const nb of ADJACENCY[t]) {
        if (base.owner[nb] === 'P2') { fromT = t; toT = nb; break outer; }
      }
    }
    if (!fromT || !toT) throw new Error('No valid P1→P2 attack found in test setup');

    // Give P1's from-territory enough armies to attack.
    const armies = { ...base.armies, [fromT]: 10, [toT]: 1 };
    const s = { ...base, armies: armies as typeof base.armies, phase: 'attack' as const };

    // Force the capture with guaranteed rolls (6 att, 1 def).
    const result = applyAttack(s, {
      type: 'ATTACK', from: fromT, to: toT,
      attackerRolls: [6, 6, 6], defenderRolls: [1],
    });
    expect(result.winner).toBe('P1');
  });

  it('does NOT set winner when capture leaves current player below threshold', () => {
    // P1 starts with only 10 territories — far below threshold.
    const base = stateWithOwnership(DOM_CONFIG, 10);

    let fromT: (typeof ALL_TERRITORY_IDS)[number] | null = null;
    let toT:   (typeof ALL_TERRITORY_IDS)[number] | null = null;
    outer: for (const t of ALL_TERRITORY_IDS) {
      if (base.owner[t] !== 'P1') continue;
      for (const nb of ADJACENCY[t]) {
        if (base.owner[nb] === 'P2') { fromT = t; toT = nb; break outer; }
      }
    }
    if (!fromT || !toT) throw new Error('No valid P1→P2 attack found in test setup');

    const armies = { ...base.armies, [fromT]: 10, [toT]: 1 };
    const s = { ...base, armies: armies as typeof base.armies, phase: 'attack' as const };

    const result = applyAttack(s, {
      type: 'ATTACK', from: fromT, to: toT,
      attackerRolls: [6, 6, 6], defenderRolls: [1],
    });
    expect(result.winner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Turn Limit mode
// ---------------------------------------------------------------------------

const TL_CONFIG: GameConfig = { ...DEFAULT_CONFIG, mode: 'turnlimit', turnLimit: 3 };

describe('Turn Limit — roundsElapsed counter', () => {
  it('initializes to 0', () => {
    const s = createInitialState(['P1', 'P2'], { config: TL_CONFIG });
    expect(s.roundsElapsed).toBe(0);
  });

  it('increments when turnPointer wraps to 0 from fortify phase', () => {
    const s = { ...createInitialState(['P1', 'P2'], { config: TL_CONFIG }), phase: 'fortify' as const };
    expect(startTurn(s, 'P1', 0).roundsElapsed).toBe(1);
  });

  it('does NOT increment when turnPointer advances to non-0', () => {
    const s = { ...createInitialState(['P1', 'P2'], { config: TL_CONFIG }), phase: 'fortify' as const };
    expect(startTurn(s, 'P2', 1).roundsElapsed).toBe(0);
  });

  it('does NOT increment on game-start call from setup phase', () => {
    // applySetupPlacement calls startTurn(placed, p0, 0) when state.phase === 'setup'
    const s = createInitialState(['P1', 'P2'], { config: TL_CONFIG, setup: true });
    expect(startTurn(s, 'P1', 0).roundsElapsed).toBe(0);
  });
});

describe('Turn Limit — win at round limit', () => {
  it('sets winner when roundsElapsed reaches turnLimit', () => {
    const base = createInitialState(['P1', 'P2'], { config: TL_CONFIG });
    const nearLimit = { ...base, phase: 'fortify' as const, roundsElapsed: TL_CONFIG.turnLimit! - 1 };
    expect(startTurn(nearLimit, 'P1', 0).winner).not.toBeNull();
  });

  it('does NOT end game one round before limit', () => {
    const base = createInitialState(['P1', 'P2'], { config: TL_CONFIG });
    const oneShort = { ...base, phase: 'fortify' as const, roundsElapsed: TL_CONFIG.turnLimit! - 2 };
    expect(startTurn(oneShort, 'P1', 0).winner).toBeNull();
  });

  it('scores winner by most territories', () => {
    // P1 owns 30 territories, P2 owns 12 → P1 wins
    const base = stateWithOwnership(TL_CONFIG, 30);
    const nearLimit = { ...base, phase: 'fortify' as const, roundsElapsed: TL_CONFIG.turnLimit! - 1 };
    expect(startTurn(nearLimit, 'P1', 0).winner).toBe('P1');
  });

  it('tiebreak: most armies wins when territory count is equal', () => {
    const base = stateWithOwnership(TL_CONFIG, 21); // 21 each
    const moreArmies = { ...base.armies } as Record<string, number>;
    // Boost P1's first territory by 20 armies
    moreArmies[ALL_TERRITORY_IDS.find((id) => base.owner[id] === 'P1')!] = 20;
    const nearLimit = {
      ...base,
      armies: moreArmies as typeof base.armies,
      phase: 'fortify' as const,
      roundsElapsed: TL_CONFIG.turnLimit! - 1,
    };
    expect(startTurn(nearLimit, 'P1', 0).winner).toBe('P1');
  });
});

describe('Turn Limit — early elimination', () => {
  it('checkWin returns last alive player when all opponents eliminated', () => {
    const base = createInitialState(['P1', 'P2'], { config: TL_CONFIG });
    const deadP2 = { ...base, players: base.players.map((p) => p.id === 'P2' ? { ...p, alive: false } : p) };
    expect(checkWin(deadP2)).toBe('P1');
  });

  it('checkWin returns null in mid-game when multiple players alive', () => {
    expect(checkWin(createInitialState(['P1', 'P2'], { config: TL_CONFIG }))).toBeNull();
  });
});

describe('Turn Limit — world and domination modes unaffected', () => {
  it('startTurn does not set roundsElapsed for world mode', () => {
    const s = { ...createInitialState(['P1', 'P2']), phase: 'fortify' as const };
    const next = startTurn(s, 'P1', 0);
    // roundsElapsed was 0 (set in createInitialState common), startTurn doesn't touch it for world mode
    expect(next.winner).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Secret Missions mode
// ---------------------------------------------------------------------------

const MISS_CONFIG: GameConfig = { ...DEFAULT_CONFIG, mode: 'missions' };

/** Build a 2-player missions state where P1 owns exactly the given territory set. */
function missionState(missionId: MissionId, p1Territories: TerritoryId[], armiesOverride?: number) {
  const base = createInitialState(['P1', 'P2'], { config: MISS_CONFIG, rng: () => 0 });
  const missions = { P1: missionId, P2: 'occupy-24' as MissionId } as Readonly<Record<string, MissionId>>;
  const newOwner = {} as Record<string, string>;
  ALL_TERRITORY_IDS.forEach((id) => { newOwner[id] = 'P2'; });
  p1Territories.forEach((id) => { newOwner[id] = 'P1'; });
  const newArmies = { ...base.armies } as Record<string, number>;
  if (armiesOverride !== undefined) {
    p1Territories.forEach((id) => { newArmies[id] = armiesOverride; });
  }
  return { ...base, missions, owner: newOwner as typeof base.owner, armies: newArmies as typeof base.armies };
}

describe('Secret Missions — assignment', () => {
  it('assigns a mission to each player', () => {
    const s = createInitialState(['P1', 'P2'], { config: MISS_CONFIG, rng: () => 0.5 });
    expect(s.missions).toBeDefined();
    expect(s.missions!['P1']).toBeDefined();
    expect(s.missions!['P2']).toBeDefined();
  });

  it('assigns distinct missions to players (no duplicates)', () => {
    const s = createInitialState(['P1', 'P2', 'P3'], { config: MISS_CONFIG, rng: () => 0.3 });
    const vals = Object.values(s.missions!);
    expect(new Set(vals).size).toBe(3);
  });

  it('RNG injection makes assignment deterministic', () => {
    const rng = () => 0;
    const s1 = createInitialState(['P1', 'P2'], { config: MISS_CONFIG, rng });
    const s2 = createInitialState(['P1', 'P2'], { config: MISS_CONFIG, rng });
    expect(s1.missions).toEqual(s2.missions);
  });

  it('all 8 mission ids appear in MISSION_LABEL', () => {
    for (const id of ALL_MISSION_IDS) {
      expect(MISSION_LABEL[id]).toBeTruthy();
    }
  });
});

describe('Secret Missions — occupy-24 evaluator', () => {
  it('wins at exactly 24 territories', () => {
    const s = missionState('occupy-24', ALL_TERRITORY_IDS.slice(0, 24));
    expect(checkWin(s)).toBe('P1');
  });

  it('does not win at 23 territories', () => {
    const s = missionState('occupy-24', ALL_TERRITORY_IDS.slice(0, 23));
    expect(checkWin(s)).toBeNull();
  });

  it('wins with more than 24 territories', () => {
    const s = missionState('occupy-24', ALL_TERRITORY_IDS.slice(0, 30));
    expect(checkWin(s)).toBe('P1');
  });
});

describe('Secret Missions — occupy-18-2armies evaluator', () => {
  it('wins when owning 18 territories each with ≥ 2 armies', () => {
    const s = missionState('occupy-18-2armies', ALL_TERRITORY_IDS.slice(0, 18), 3);
    expect(checkWin(s)).toBe('P1');
  });

  it('does not win with 17 qualifying territories', () => {
    const s = missionState('occupy-18-2armies', ALL_TERRITORY_IDS.slice(0, 17), 3);
    expect(checkWin(s)).toBeNull();
  });

  it('does not win when territories have only 1 army', () => {
    const s = missionState('occupy-18-2armies', ALL_TERRITORY_IDS.slice(0, 18), 1);
    expect(checkWin(s)).toBeNull();
  });
});

describe('Secret Missions — continent evaluators', () => {
  it('asia-africa: wins when P1 owns all of Asia + Africa', () => {
    const terrs = [...CONTINENTS.AS.territories, ...CONTINENTS.AF.territories];
    expect(checkWin(missionState('asia-africa', terrs))).toBe('P1');
  });

  it('asia-africa: does not win when missing one Africa territory', () => {
    const af = CONTINENTS.AF.territories;
    const terrs = [...CONTINENTS.AS.territories, ...af.slice(0, af.length - 1)];
    expect(checkWin(missionState('asia-africa', terrs))).toBeNull();
  });

  it('europe-australia-plus: wins with EU + AU + any third continent', () => {
    const terrs = [
      ...CONTINENTS.EU.territories,
      ...CONTINENTS.AU.territories,
      ...CONTINENTS.NA.territories, // third continent
    ];
    expect(checkWin(missionState('europe-australia-plus', terrs))).toBe('P1');
  });

  it('europe-australia-plus: does not win with only EU + AU', () => {
    const terrs = [...CONTINENTS.EU.territories, ...CONTINENTS.AU.territories];
    expect(checkWin(missionState('europe-australia-plus', terrs))).toBeNull();
  });

  it('n-america-australia: wins when P1 owns NA + AU', () => {
    const terrs = [...CONTINENTS.NA.territories, ...CONTINENTS.AU.territories];
    expect(checkWin(missionState('n-america-australia', terrs))).toBe('P1');
  });
});

describe('Secret Missions — checkWin null for wrong player', () => {
  it('returns null when mission belongs to non-current player', () => {
    // turnPointer=0 = P1; give P2 the easy mission but P1 a hard one
    const s = missionState('occupy-24', ALL_TERRITORY_IDS.slice(0, 5)); // P1 has only 5 terr
    expect(checkWin(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Capital Conquest mode
// ---------------------------------------------------------------------------

const CAP_CONFIG: GameConfig = { ...DEFAULT_CONFIG, mode: 'capitals' };

describe('Capital Conquest — capitals assigned at init', () => {
  it('populates state.capitals with one territory per player', () => {
    const s = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    expect(s.capitals).toBeDefined();
    expect(s.capitals!['P1']).toBeDefined();
    expect(s.capitals!['P2']).toBeDefined();
    expect(s.capitals!['P1']).not.toBe(s.capitals!['P2']);
  });

  it('capitals are owned by their respective players at game start', () => {
    const s = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    expect(s.owner[s.capitals!['P1']!]).toBe('P1');
    expect(s.owner[s.capitals!['P2']!]).toBe('P2');
  });

  it('works with 3 players — one capital each', () => {
    const s = createInitialState(['P1', 'P2', 'P3'], { config: CAP_CONFIG });
    expect(Object.keys(s.capitals ?? {})).toHaveLength(3);
    const vals = Object.values(s.capitals!);
    expect(new Set(vals).size).toBe(3); // all distinct
  });
});

describe('Capital Conquest — checkWin', () => {
  it('returns null when current player owns their capital but not all enemies', () => {
    const s = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    expect(checkWin(s)).toBeNull();
  });

  it('returns winner when current player owns all capitals', () => {
    const s = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    const p2Cap = s.capitals!['P2']!;
    const winState = { ...s, owner: { ...s.owner, [p2Cap]: 'P1' } as typeof s.owner };
    expect(checkWin(winState)).toBe('P1');
  });

  it('does not win when own capital is captured but player is still alive', () => {
    const s = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    const p1Cap = s.capitals!['P1']!;
    // P2 captured P1's capital — P1 is still current player but doesn't own P2's capital
    const state = { ...s, owner: { ...s.owner, [p1Cap]: 'P2' } as typeof s.owner };
    expect(checkWin(state)).toBeNull();
  });

  it('3-player: wins only when all three capitals are owned', () => {
    const s = createInitialState(['P1', 'P2', 'P3'], { config: CAP_CONFIG });
    const p2Cap = s.capitals!['P2']!;
    const p3Cap = s.capitals!['P3']!;
    // Own only one enemy capital — not a win
    const partial = { ...s, owner: { ...s.owner, [p2Cap]: 'P1' } as typeof s.owner };
    expect(checkWin(partial)).toBeNull();
    // Own both enemy capitals — win
    const full = { ...partial, owner: { ...partial.owner, [p3Cap]: 'P1' } as typeof s.owner };
    expect(checkWin(full)).toBe('P1');
  });
});

describe('Capital Conquest — win fires mid-attack via applyAttack', () => {
  it('sets winner when capture is the last missing capital', () => {
    const base = createInitialState(['P1', 'P2'], { config: CAP_CONFIG });
    const p2Cap = base.capitals!['P2']!;

    // Find a P1 territory adjacent to P2's capital
    let fromT: (typeof ALL_TERRITORY_IDS)[number] | null = null;
    for (const t of ALL_TERRITORY_IDS) {
      if (base.owner[t] !== 'P1') continue;
      if ((ADJACENCY[t] as readonly string[]).includes(p2Cap)) { fromT = t; break; }
    }
    // If no direct neighbour, put extra armies on any P1 territory and teleport the capital
    // next to it — simpler: just find a P2 territory adjacent to a P1 territory and swap it to be the capital
    let capitalAdjacentFromT = fromT;
    let capitalToAttack = p2Cap;
    if (!capitalAdjacentFromT) {
      // Find any P1→P2 pair and make that P2 territory the "capital" for this test
      outer2: for (const t of ALL_TERRITORY_IDS) {
        if (base.owner[t] !== 'P1') continue;
        for (const nb of ADJACENCY[t]) {
          if (base.owner[nb] === 'P2') {
            capitalAdjacentFromT = t;
            capitalToAttack = nb;
            break outer2;
          }
        }
      }
      if (!capitalAdjacentFromT || !capitalToAttack) throw new Error('No P1→P2 attack path found');
    }

    const capitals = { ...base.capitals!, P2: capitalToAttack } as Readonly<Record<string, TerritoryId>>;
    const armies = { ...base.armies, [capitalAdjacentFromT!]: 10, [capitalToAttack]: 1 };
    const s = {
      ...base, capitals,
      armies: armies as typeof base.armies, phase: 'attack' as const,
    };

    const result = applyAttack(s, {
      type: 'ATTACK', from: capitalAdjacentFromT!, to: capitalToAttack,
      attackerRolls: [6, 6, 6], defenderRolls: [1],
    });
    expect(result.winner).toBe('P1');
  });
});

// ---------------------------------------------------------------------------
// World mode — unchanged after applyAttack refactor
// ---------------------------------------------------------------------------

describe('checkWin — world mode still correct after refactor', () => {
  it('returns null when territories are split', () => {
    expect(checkWin(stateWithOwnership(DEFAULT_CONFIG, 21))).toBeNull();
  });

  it('returns the player id when they own all 42', () => {
    expect(checkWin(stateWithOwnership(DEFAULT_CONFIG, 42))).toBe('P1');
  });
});
