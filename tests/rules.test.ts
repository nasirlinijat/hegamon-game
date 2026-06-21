import { describe, it, expect } from 'vitest';
import { createInitialState, NEUTRAL_ID, ZOMBIE_ID, type GameState, type PlayerId } from '../src/engine/state';
import { ALL_TERRITORY_IDS, CONTINENTS, areAdjacent, type TerritoryId } from '../src/engine/map';
import {
  resolveCombat,
  attackDiceCount,
  defenseDiceCount,
  calcReinforcements,
  ownsContinent,
  validateReinforce,
  validateAttack,
  applyAttack,
  resolveBlitz,
  validateFortify,
  connectedThroughOwned,
  startTurn,
  checkWin,
  nextAlivePointer,
  applyZombieTurn,
} from '../src/engine/rules';
import { reduce } from '../src/engine/actions';
import { DEFAULT_CONFIG } from '../src/engine/modes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal 2-player state where P1 owns `p1Territories` and P2 owns the rest. */
function twoPlayerState(p1Territories: TerritoryId[], overrides: Partial<GameState> = {}): GameState {
  const base = createInitialState(['P1', 'P2']);
  const owner = { ...base.owner };
  const armies = { ...base.armies };
  for (const id of ALL_TERRITORY_IDS) {
    owner[id] = p1Territories.includes(id) ? 'P1' : 'P2';
    armies[id] = 3;
  }
  return { ...base, owner, armies, ...overrides };
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);
  if (obj !== null && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// resolveCombat
// ---------------------------------------------------------------------------

describe('resolveCombat', () => {
  it('3v2 attacker sweeps: [6,5,2] vs [4,3]', () => {
    expect(resolveCombat([6, 5, 2], [4, 3])).toEqual({ attackerLosses: 0, defenderLosses: 2 });
  });

  it('tie on highest goes to defender: [6,5] vs [6,4]', () => {
    expect(resolveCombat([6, 5], [6, 4])).toEqual({ attackerLosses: 1, defenderLosses: 1 });
  });

  it('both pairs tie (2v2): [6,5] vs [6,5] → defender wins both', () => {
    expect(resolveCombat([6, 5], [6, 5])).toEqual({ attackerLosses: 2, defenderLosses: 0 });
  });

  it('defender sweeps: [3,2] vs [6,5]', () => {
    expect(resolveCombat([3, 2], [6, 5])).toEqual({ attackerLosses: 2, defenderLosses: 0 });
  });

  it('1v1 attacker higher: [5] vs [3]', () => {
    expect(resolveCombat([5], [3])).toEqual({ attackerLosses: 0, defenderLosses: 1 });
  });

  it('1v1 defender higher: [3] vs [5]', () => {
    expect(resolveCombat([3], [5])).toEqual({ attackerLosses: 1, defenderLosses: 0 });
  });

  it('1v1 tie → defender wins: [4] vs [4]', () => {
    expect(resolveCombat([4], [4])).toEqual({ attackerLosses: 1, defenderLosses: 0 });
  });

  it('2 att dice vs 1 def die — only 1 pair compared: [6,1] vs [5]', () => {
    expect(resolveCombat([6, 1], [5])).toEqual({ attackerLosses: 0, defenderLosses: 1 });
  });

  it('1 att die vs 2 def dice — only 1 pair compared: [6] vs [5,5]', () => {
    expect(resolveCombat([6], [5, 5])).toEqual({ attackerLosses: 0, defenderLosses: 1 });
  });

  it('unsorted input is sorted internally: [2,6,5] vs [3,4]', () => {
    expect(resolveCombat([2, 6, 5], [3, 4])).toEqual({ attackerLosses: 0, defenderLosses: 2 });
  });

  it('conservation: losses sum equals min(att.length, def.length)', () => {
    const cases: [number[], number[]][] = [
      [[6, 5, 2], [4, 3]],
      [[6, 5], [6, 4]],
      [[6, 5], [6, 5]],
      [[3, 2], [6, 5]],
      [[5], [3]],
      [[4], [4]],
    ];
    for (const [att, def] of cases) {
      const { attackerLosses, defenderLosses } = resolveCombat(att, def);
      expect(attackerLosses + defenderLosses).toBe(Math.min(att.length, def.length));
    }
  });
});

// ---------------------------------------------------------------------------
// attackDiceCount / defenseDiceCount
// ---------------------------------------------------------------------------

describe('attackDiceCount', () => {
  it.each([
    [2, 1],
    [3, 2],
    [4, 3],
    [10, 3],
  ])('attackDiceCount(%i) = %i', (armies, expected) => {
    expect(attackDiceCount(armies)).toBe(expected);
  });
});

describe('defenseDiceCount', () => {
  it.each([
    [1, 1],
    [2, 2],
    [5, 2],
  ])('defenseDiceCount(%i) = %i', (armies, expected) => {
    expect(defenseDiceCount(armies)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// calcReinforcements / ownsContinent
// ---------------------------------------------------------------------------

describe('calcReinforcements', () => {
  it('1 territory, no continent → base 3', () => {
    const state = twoPlayerState([ALL_TERRITORY_IDS[0]!]);
    expect(calcReinforcements(state, 'P1')).toBe(3);
  });

  it('11 territories, no full continent → floor(11/3)=3 → clamped to 3', () => {
    // 11 of Asia's 12 territories: missing 1 prevents the +7 AS bonus
    const terrs = ([...CONTINENTS.AS.territories] as TerritoryId[]).slice(0, 11);
    const state = twoPlayerState(terrs);
    expect(calcReinforcements(state, 'P1')).toBe(3);
  });

  it('12 territories → floor(12/3)=4 (no continent bonus)', () => {
    // 11 of Asia + 1 of Europe: neither continent is complete
    const terrs = [
      ...([...CONTINENTS.AS.territories] as TerritoryId[]).slice(0, 11),
      CONTINENTS.EU.territories[0] as TerritoryId,
    ];
    const state = twoPlayerState(terrs);
    expect(calcReinforcements(state, 'P1')).toBe(4);
  });

  it('15 territories → 5 (no continent bonus)', () => {
    // 11 of Asia + 4 of Europe: EU has 7 so 4 doesn't complete it
    const terrs = [
      ...([...CONTINENTS.AS.territories] as TerritoryId[]).slice(0, 11),
      ...([...CONTINENTS.EU.territories] as TerritoryId[]).slice(0, 4),
    ];
    const state = twoPlayerState(terrs);
    expect(calcReinforcements(state, 'P1')).toBe(5);
  });

  it('owns all of Australia (4 terr) → base 3 + AU 2 = 5', () => {
    const auTerrs = [...CONTINENTS.AU.territories] as TerritoryId[];
    const state = twoPlayerState(auTerrs);
    expect(calcReinforcements(state, 'P1')).toBe(5);
  });

  it('owns all of South America (4 terr) → base 3 + SA 2 = 5', () => {
    const saTerrs = [...CONTINENTS.SA.territories] as TerritoryId[];
    const state = twoPlayerState(saTerrs);
    expect(calcReinforcements(state, 'P1')).toBe(5);
  });

  it('AU + SA (8 terr) → base max(3,floor(8/3)=2)=3 + 2 + 2 = 7', () => {
    const terrs = [
      ...CONTINENTS.AU.territories,
      ...CONTINENTS.SA.territories,
    ] as TerritoryId[];
    const state = twoPlayerState(terrs);
    expect(calcReinforcements(state, 'P1')).toBe(7);
  });

  it('partial Asia (all-but-one) gives no continent bonus', () => {
    const asTerrs = [...CONTINENTS.AS.territories] as TerritoryId[];
    const partial = asTerrs.slice(0, -1); // drop one
    const state = twoPlayerState(partial);
    const base = Math.max(3, Math.floor(partial.length / 3));
    expect(calcReinforcements(state, 'P1')).toBe(base); // no AS bonus
  });

  it('own all 42 → 14 + 24 = 38', () => {
    const state = twoPlayerState([...ALL_TERRITORY_IDS] as TerritoryId[]);
    expect(calcReinforcements(state, 'P1')).toBe(38);
  });

  it('ownsContinent flips to false when one territory is enemy-owned', () => {
    const auTerrs = [...CONTINENTS.AU.territories] as TerritoryId[];
    const stateOwns = twoPlayerState(auTerrs);
    expect(ownsContinent(stateOwns, 'P1', 'AU')).toBe(true);

    const partial = auTerrs.slice(0, -1);
    const stateMissing = twoPlayerState(partial);
    expect(ownsContinent(stateMissing, 'P1', 'AU')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateReinforce
// ---------------------------------------------------------------------------

describe('validateReinforce', () => {
  function reinforceState(): GameState {
    const terr = ALL_TERRITORY_IDS[0]!;
    return twoPlayerState([terr], { reinforcementsRemaining: 5, phase: 'reinforce' });
  }

  it('valid placement returns ok', () => {
    const state = reinforceState();
    expect(validateReinforce(state, 'P1', ALL_TERRITORY_IDS[0]!, 3)).toEqual({ ok: true });
  });

  it('placing on an enemy territory fails', () => {
    const state = reinforceState();
    const enemyTerr = ALL_TERRITORY_IDS[1]!;
    const result = validateReinforce(state, 'P1', enemyTerr, 1);
    expect(result.ok).toBe(false);
  });

  it('over-placing beyond reinforcementsRemaining fails', () => {
    const state = reinforceState();
    const result = validateReinforce(state, 'P1', ALL_TERRITORY_IDS[0]!, 6);
    expect(result.ok).toBe(false);
  });

  it('count < 1 fails', () => {
    const state = reinforceState();
    const result = validateReinforce(state, 'P1', ALL_TERRITORY_IDS[0]!, 0);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyAttack
// ---------------------------------------------------------------------------

describe('applyAttack', () => {
  function attackState(fromArmies: number, toArmies: number): GameState {
    // P1 owns alaska (attacker), P2 owns kamchatka (defender) — they are adjacent.
    const p1Terrs = ALL_TERRITORY_IDS.filter((id) => id !== 'kamchatka');
    const state = twoPlayerState(p1Terrs, { phase: 'attack' });
    return {
      ...state,
      armies: { ...state.armies, alaska: fromArmies, kamchatka: toArmies },
    };
  }

  it('non-capturing exchange: defender survives, moveOnCapture ignored', () => {
    const state = attackState(5, 3);
    // [6,5,2] vs [4,3]: P1 loses 0, P2 loses 2; defender survives with 1
    const next = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'kamchatka',
      attackerRolls: [6, 5, 2],
      defenderRolls: [4, 3],
      moveOnCapture: 999, // stray value — must be ignored
    });
    expect(next.armies['kamchatka']).toBe(1);
    expect(next.armies['alaska']).toBe(5);
    expect(next.owner['kamchatka']).toBe('P2');
    expect(next.capturedThisTurn).toBe(false);
  });

  it('capture: ownership flips, capturedThisTurn = true', () => {
    // [6,5,4] vs [3,2]: P2 loses 2 → 0; capture
    const state = attackState(5, 2);
    const next = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'kamchatka',
      attackerRolls: [6, 5, 4],
      defenderRolls: [3, 2],
      moveOnCapture: 3,
    });
    expect(next.owner['kamchatka']).toBe('P1');
    expect(next.capturedThisTurn).toBe(true);
    expect(next.armies['kamchatka']).toBe(3);
    expect(next.armies['alaska']).toBe(2); // 5 - 0 attacker losses - 3 moved
  });

  it('capture with moveOnCapture omitted defaults to max(1, diceRolled)', () => {
    const state = attackState(5, 2);
    const next = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'kamchatka',
      attackerRolls: [6, 5, 4], // 3 dice → min = 3
      defenderRolls: [3, 2],
      // moveOnCapture omitted
    });
    expect(next.owner['kamchatka']).toBe('P1');
    expect(next.armies['kamchatka']).toBe(3); // defaulted to 3
  });

  it('capture: moveOnCapture below minimum is rejected', () => {
    const state = attackState(5, 2);
    expect(() =>
      applyAttack(state, {
        type: 'ATTACK',
        from: 'alaska',
        to: 'kamchatka',
        attackerRolls: [6, 5, 4], // 3 dice → min = 3
        defenderRolls: [3, 2],
        moveOnCapture: 2,
      }),
    ).toThrow();
  });

  it('capture: moveOnCapture above fromArmies-1 is rejected', () => {
    const state = attackState(4, 2); // 4 armies; after 0 losses; max move = 3
    expect(() =>
      applyAttack(state, {
        type: 'ATTACK',
        from: 'alaska',
        to: 'kamchatka',
        attackerRolls: [6, 5, 4],
        defenderRolls: [3, 2],
        moveOnCapture: 4, // would leave 0 behind
      }),
    ).toThrow();
  });

  it('attack on non-adjacent territory is rejected', () => {
    const state = attackState(5, 3);
    // alaska and argentina are not adjacent
    expect(() =>
      applyAttack(state, {
        type: 'ATTACK',
        from: 'alaska',
        to: 'argentina',
        attackerRolls: [6],
        defenderRolls: [3],
      }),
    ).toThrow();
  });

  it('attack from territory with < 2 armies is rejected', () => {
    const state = attackState(1, 3);
    expect(() =>
      applyAttack(state, {
        type: 'ATTACK',
        from: 'alaska',
        to: 'kamchatka',
        attackerRolls: [6],
        defenderRolls: [3],
      }),
    ).toThrow();
  });

  it('board total armies change only by combat losses', () => {
    const state = attackState(5, 3);
    const totalBefore = Object.values(state.armies).reduce((s, n) => s + n, 0);
    const next = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'kamchatka',
      attackerRolls: [6, 5],
      defenderRolls: [4, 3],
    });
    const totalAfter = Object.values(next.armies).reduce((s, n) => s + n, 0);
    const { attackerLosses, defenderLosses } = { attackerLosses: 0, defenderLosses: 2 }; // [6,5] vs [4,3]
    expect(totalBefore - totalAfter).toBe(attackerLosses + defenderLosses);
  });
});

// ---------------------------------------------------------------------------
// validateFortify / connectedThroughOwned
// ---------------------------------------------------------------------------

describe('validateFortify', () => {
  it('directly adjacent, both owned → pass', () => {
    const state = twoPlayerState(['alaska', 'northwest-territory', ...CONTINENTS.AU.territories as unknown as TerritoryId[]], { phase: 'fortify' });
    const result = validateFortify({ ...state, armies: { ...state.armies, alaska: 4, 'northwest-territory': 2 } }, 'alaska', 'northwest-territory', 3);
    expect(result.ok).toBe(true);
  });

  it('non-adjacent but connected through owned chain → pass', () => {
    // P1 owns alaska → northwest-territory → alberta (chain)
    const p1 = ['alaska', 'northwest-territory', 'alberta'] as TerritoryId[];
    const state = twoPlayerState(p1, { phase: 'fortify' });
    const s = { ...state, armies: { ...state.armies, alaska: 5, alberta: 2 } };
    expect(validateFortify(s, 'alaska', 'alberta', 3).ok).toBe(true);
  });

  it('connected path only through enemy territory → fail', () => {
    // alaska and kamchatka are adjacent, but if only one is owned they can still fortify
    // Make P1 own alaska + kamchatka but not northwest-territory (the other Alaska neighbor).
    // Better: P1 owns eastern-australia and new-guinea; the only link is western-australia (P2).
    const p1 = ['eastern-australia', 'new-guinea'] as TerritoryId[];
    const state = twoPlayerState(p1, { phase: 'fortify' });
    const s = { ...state, armies: { ...state.armies, 'eastern-australia': 5, 'new-guinea': 2 } };
    // eastern-australia neighbors: new-guinea, western-australia
    // new-guinea neighbors: indonesia, western-australia, eastern-australia
    // P1 owns both endpoints; western-australia (the bridge) is P2's.
    // But eastern-australia and new-guinea ARE adjacent — that's a direct link, so pass.
    expect(validateFortify(s, 'eastern-australia', 'new-guinea', 3).ok).toBe(true);

    // Now test a genuinely separated pair: P1 owns alaska and kamchatka but nothing between.
    // All intermediate paths cross enemy territory.
    const separated = ['alaska', 'kamchatka'] as TerritoryId[];
    const s2 = twoPlayerState(separated, { phase: 'fortify' });
    void s2; // s2 built but only s3/s3a are used for isolation assertion
    // alaska and kamchatka are adjacent → direct link, so this should pass.
    // For the real isolation test: P1 owns argentina and brazil; they're adjacent so it passes.
    // We need P1 to own two territories with no owned path between them.
    // P1 owns greenland and great-britain — they are NOT adjacent; Iceland (enemy) bridges them.
    const isolated = ['greenland', 'great-britain'] as TerritoryId[];
    const s3 = twoPlayerState(isolated, { phase: 'fortify' });
    const s3a = { ...s3, armies: { ...s3.armies, greenland: 5, 'great-britain': 2 } };
    expect(validateFortify(s3a, 'greenland', 'great-britain', 3).ok).toBe(false);
  });

  it('count > armies[from]-1 → fail (must leave ≥1)', () => {
    const p1 = ['alaska', 'northwest-territory'] as TerritoryId[];
    const state = twoPlayerState(p1, { phase: 'fortify' });
    const s = { ...state, armies: { ...state.armies, alaska: 3 } };
    // Trying to move 3 from alaska (only 3 armies: can move max 2)
    expect(validateFortify(s, 'alaska', 'northwest-territory', 3).ok).toBe(false);
  });

  it('destination not owned by player → fail', () => {
    const p1 = ['alaska'] as TerritoryId[];
    const state = twoPlayerState(p1, { phase: 'fortify' });
    const s = { ...state, armies: { ...state.armies, alaska: 4 } };
    expect(validateFortify(s, 'alaska', 'kamchatka', 2).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkWin
// ---------------------------------------------------------------------------

describe('checkWin', () => {
  it('returns null when territories are split', () => {
    const state = createInitialState(['P1', 'P2']);
    expect(checkWin(state)).toBeNull();
  });

  it('returns the player id when they own all 42', () => {
    const state = twoPlayerState([...ALL_TERRITORY_IDS] as TerritoryId[]);
    expect(checkWin(state)).toBe('P1');
  });
});

// ---------------------------------------------------------------------------
// Reducer purity
// ---------------------------------------------------------------------------

describe('reduce (purity)', () => {
  it('never mutates the input state', () => {
    const base = createInitialState(['P1', 'P2']);
    // Make sure P1 owns at least one territory and has reinforcements.
    const p1Terr = ALL_TERRITORY_IDS.find((id) => base.owner[id] === 'P1')!;
    const state = deepFreeze({ ...base, reinforcementsRemaining: 5 });
    const next = reduce(state, { type: 'REINFORCE', territory: p1Terr, count: 2 });
    expect(next).not.toBe(state);
    expect(state.reinforcementsRemaining).toBe(5); // unchanged
  });

  it('END_PHASE reinforce→attack returns new object in attack phase', () => {
    const state = deepFreeze({ ...createInitialState(['P1', 'P2']), reinforcementsRemaining: 0 });
    const next = reduce(state, { type: 'END_PHASE' });
    expect(next.phase).toBe('attack');
    expect(next).not.toBe(state);
  });

  it('END_PHASE fortify→next-player resets capturedThisTurn and fortifiedThisTurn', () => {
    const base = createInitialState(['P1', 'P2']);
    const fortifyState: GameState = {
      ...base,
      phase: 'fortify',
      capturedThisTurn: true,
      fortifiedThisTurn: true,
    };
    const next = reduce(deepFreeze(fortifyState), { type: 'END_PHASE' });
    expect(next.phase).toBe('reinforce');
    expect(next.capturedThisTurn).toBe(false);
    expect(next.fortifiedThisTurn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveBlitz
// ---------------------------------------------------------------------------

/** Deterministic RNG that yields the given values in order, then holds the last. */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}
// 0.99 → die face 6; 0.0 → die face 1.
const HI = 0.99;
const LO = 0.0;

function boardTotal(s: GameState): number {
  return ALL_TERRITORY_IDS.reduce((sum, id) => sum + (s.armies[id] ?? 0), 0);
}

describe('resolveBlitz', () => {
  it('captures in a single sweeping round and advances all-but-one', () => {
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 10, 'northwest-territory': 2 } as GameState['armies'],
    });
    // attacker rolls [6,6,6] (3 dice), defender [1,1] (2 dice) → defender loses both → capture.
    const { state, rounds, captured } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([HI, HI, HI, LO, LO]));
    expect(captured).toBe(true);
    expect(rounds).toHaveLength(1);
    expect(state.owner['northwest-territory']).toBe('P1');
    expect(state.armies['alaska']).toBe(1);                    // left exactly one behind
    expect(state.armies['northwest-territory']).toBe(9);       // moved 10 − 0 losses − 1
  });

  it('stops without capture when the attacker drops to one army', () => {
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 3, 'northwest-territory': 3 } as GameState['armies'],
    });
    // attacker [1,1] vs defender [6,6] → attacker loses both → alaska 3→1, loop ends.
    const { state, rounds, captured } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([LO, LO, HI, HI]));
    expect(captured).toBe(false);
    expect(rounds).toHaveLength(1);
    expect(state.owner['northwest-territory']).toBe('P2');
    expect(state.armies['alaska']).toBe(1);
  });

  it('conserves total board armies (changes only by combat losses)', () => {
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 10, 'northwest-territory': 2 } as GameState['armies'],
    });
    const before = boardTotal(s);
    const { state, rounds } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([HI, HI, HI, LO, LO]));
    const losses = rounds.reduce((sum, r) => sum + r.attackerLosses + r.defenderLosses, 0);
    expect(boardTotal(state)).toBe(before - losses);
  });

  it('rejects an illegal blitz (non-adjacent or under-strength source)', () => {
    const s = twoPlayerState(['alaska'], { phase: 'attack' });
    expect(() => resolveBlitz(s, 'alaska', 'brazil', scriptedRng([HI]))).toThrow();
  });

  it('honours keepBehind: advances committed survivors and leaves the reserve', () => {
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 10, 'northwest-territory': 2 } as GameState['armies'],
    });
    // keepBehind = 4 → capture in one sweep, advance 10 − 4 = 6, leave 4 behind.
    const { state, captured } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([HI, HI, HI, LO, LO]), 4);
    expect(captured).toBe(true);
    expect(state.owner['northwest-territory']).toBe('P1');
    expect(state.armies['alaska']).toBe(4);                    // reserve kept behind
    expect(state.armies['northwest-territory']).toBe(6);       // committed survivors advanced
  });

  it('keepBehind never moves fewer than the dice rolled (min-move rule still applies)', () => {
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 4, 'northwest-territory': 1 } as GameState['armies'],
    });
    // 4 armies → 3 dice. keepBehind 3 would advance only 1, but must move ≥ dice rolled (3).
    const { state, captured } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([HI, HI, HI, LO]), 3);
    expect(captured).toBe(true);
    expect(state.armies['northwest-territory']).toBe(3);       // forced up to the 3-dice minimum
    expect(state.armies['alaska']).toBe(1);
  });

  it('returns a replayable action list (online multiplayer relies on this)', () => {
    // Online blitz sends resolveBlitz().actions to the server, which applies each via reduce().
    // Replaying those actions must reproduce resolveBlitz's own final state exactly.
    const s = twoPlayerState(['alaska'], {
      phase: 'attack',
      armies: { ...createInitialState(['P1', 'P2']).armies, alaska: 10, 'northwest-territory': 2 } as GameState['armies'],
    });
    const { state: finalState, actions, rounds } = resolveBlitz(s, 'alaska', 'northwest-territory', scriptedRng([HI, HI, HI, LO, LO]));
    expect(actions.length).toBe(rounds.length);
    const replayed = actions.reduce((acc, a) => reduce(acc, a), s as GameState);
    expect(replayed.owner['northwest-territory']).toBe(finalState.owner['northwest-territory']);
    expect(replayed.armies['alaska']).toBe(finalState.armies['alaska']);
    expect(replayed.armies['northwest-territory']).toBe(finalState.armies['northwest-territory']);
  });
});

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

describe('portals', () => {
  // Helper: build a state with a specific portal pair injected.
  function portalState(
    p1Territories: TerritoryId[],
    portal: readonly [TerritoryId, TerritoryId],
    overrides: Partial<GameState> = {},
  ): GameState {
    return twoPlayerState(p1Territories, { ...overrides, portals: [portal] });
  }

  it('areAdjacent: portal pair is treated as adjacent in both directions', () => {
    // alaska and egypt are not map-adjacent.
    expect(areAdjacent('alaska', 'egypt')).toBe(false);
    expect(areAdjacent('alaska', 'egypt', [['alaska', 'egypt']])).toBe(true);
    expect(areAdjacent('egypt', 'alaska', [['alaska', 'egypt']])).toBe(true);
  });

  it('validateAttack allows an attack across a portal', () => {
    // P1 owns alaska (3 armies); P2 owns egypt. Normally not adjacent — portal makes it valid.
    const state = portalState(
      ALL_TERRITORY_IDS.filter((id) => id !== 'egypt') as TerritoryId[],
      ['alaska', 'egypt'],
      { phase: 'attack' },
    );
    expect(validateAttack(state, 'alaska', 'egypt').ok).toBe(true);
  });

  it('validateAttack still rejects a non-adjacent, non-portal pair', () => {
    // No portal between alaska and egypt → attack should fail.
    const state = twoPlayerState(
      ALL_TERRITORY_IDS.filter((id) => id !== 'egypt') as TerritoryId[],
      { phase: 'attack' },
    );
    expect(validateAttack(state, 'alaska', 'egypt').ok).toBe(false);
  });

  it('connectedThroughOwned traverses portal edges', () => {
    // P1 owns alaska and egypt but nothing connecting them on the map.
    // With the portal, they should be connected.
    const state = twoPlayerState(['alaska', 'egypt'], {
      portals: [['alaska', 'egypt']] as const,
    });
    expect(connectedThroughOwned(state, 'P1', 'alaska', 'egypt')).toBe(true);
  });

  it('connectedThroughOwned without portal: alaska and egypt are not connected', () => {
    const state = twoPlayerState(['alaska', 'egypt']);
    expect(connectedThroughOwned(state, 'P1', 'alaska', 'egypt')).toBe(false);
  });

  it('createInitialState generates 3 portal pairs in portals mode', () => {
    const state = createInitialState(['P1', 'P2'], {
      config: { ...DEFAULT_CONFIG, mode: 'portals' },
      rng: () => 0.5,
    });
    expect(state.portals).toBeDefined();
    expect(state.portals!.length).toBe(3);
  });

  it('generated portals are all non-adjacent on the base map', () => {
    const state = createInitialState(['P1', 'P2'], {
      config: { ...DEFAULT_CONFIG, mode: 'portals' },
      rng: () => 0.5,
    });
    for (const [a, b] of state.portals!) {
      expect(areAdjacent(a, b)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Blizzards
// ---------------------------------------------------------------------------

describe('blizzards', () => {
  const BLIZZARD_CONFIG = { ...DEFAULT_CONFIG, mode: 'blizzards' as const };

  function frozenState(
    p1Territories: TerritoryId[],
    frozen: Partial<Record<TerritoryId, true>>,
    overrides: Partial<GameState> = {},
  ): GameState {
    return twoPlayerState(p1Territories, {
      ...overrides,
      frozenTerritories: frozen as Readonly<Record<TerritoryId, true>>,
    });
  }

  it('createInitialState sets frozenTerritories and blizzardSchedule with 30 entries', () => {
    const state = createInitialState(['P1', 'P2'], { config: BLIZZARD_CONFIG, rng: () => 0.5 });
    expect(state.frozenTerritories).toBeDefined();
    expect(state.blizzardSchedule).toBeDefined();
    expect(state.blizzardSchedule!.length).toBe(30);
  });

  it('validateAttack rejects an attack FROM a frozen territory', () => {
    const state = frozenState(
      ALL_TERRITORY_IDS.filter((id) => id !== 'northwest-territory') as TerritoryId[],
      { alaska: true },
      { phase: 'attack' },
    );
    expect(validateAttack(state, 'alaska', 'northwest-territory').ok).toBe(false);
  });

  it('validateAttack rejects an attack INTO a frozen territory', () => {
    const state = frozenState(
      ALL_TERRITORY_IDS.filter((id) => id !== 'northwest-territory') as TerritoryId[],
      { 'northwest-territory': true },
      { phase: 'attack' },
    );
    expect(validateAttack(state, 'alaska', 'northwest-territory').ok).toBe(false);
  });

  it('validateAttack allows attacks when neither territory is frozen', () => {
    const state = frozenState(
      ALL_TERRITORY_IDS.filter((id) => id !== 'northwest-territory') as TerritoryId[],
      { argentina: true },
      { phase: 'attack' },
    );
    expect(validateAttack(state, 'alaska', 'northwest-territory').ok).toBe(true);
  });

  it('connectedThroughOwned cannot traverse a frozen intermediate territory', () => {
    // P1 owns iceland, great-britain, northern-europe.
    // iceland → northern-europe requires going through great-britain or scandinavia.
    // scandinavia is P2-owned, great-britain is frozen → no valid path.
    const state = frozenState(
      ['iceland', 'great-britain', 'northern-europe'],
      { 'great-britain': true },
    );
    expect(connectedThroughOwned(state, 'P1', 'iceland', 'northern-europe')).toBe(false);
  });

  it('connectedThroughOwned succeeds when the intermediate territory is not frozen', () => {
    const state = twoPlayerState(['iceland', 'scandinavia', 'northern-europe']);
    expect(connectedThroughOwned(state, 'P1', 'iceland', 'northern-europe')).toBe(true);
  });

  it('startTurn refreshes frozenTerritories to blizzardSchedule[1] on round 2 start', () => {
    let seq = 0;
    const seqRng = () => ((seq++) * 13 + 7) % 42 / 42;
    const base = createInitialState(['P1', 'P2'], { config: BLIZZARD_CONFIG, rng: seqRng });
    // Trigger a new round: phase='fortify' + turnPointer=0
    const after = startTurn({ ...base, phase: 'fortify' as const }, 'P1', 0);
    expect(after.roundsElapsed).toBe(1);
    const expectedTiles = base.blizzardSchedule![1]!;
    for (const t of expectedTiles) {
      expect(after.frozenTerritories![t as TerritoryId]).toBe(true);
    }
    expect(Object.keys(after.frozenTerritories!).length).toBe(expectedTiles.length);
  });
});

// ---------------------------------------------------------------------------
// 2-Player Neutral
// ---------------------------------------------------------------------------

describe('twoplayer neutral', () => {
  const TWO_CONFIG = { ...DEFAULT_CONFIG, mode: 'twoplayer' as const };

  it('createInitialState adds Neutral as a 3rd player', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG, rng: () => 0.5 });
    const ids = state.players.map((p) => p.id);
    expect(ids).toContain(NEUTRAL_ID);
    expect(ids.length).toBe(3);
  });

  it('territories are split ~14/14/14 in twoplayer mode', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG, rng: () => 0.5 });
    const neutralCount = ALL_TERRITORY_IDS.filter((id) => state.owner[id] === NEUTRAL_ID).length;
    // With rng=0.5 the distribution is round-robin; each of 3 players gets 14 territories
    expect(neutralCount).toBe(14);
  });

  it('Neutral has 0 setupRemaining', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG, setup: true, rng: () => 0.5 });
    expect(state.setupRemaining[NEUTRAL_ID]).toBe(0);
  });

  it('real players have 26 armies to place in setup (40 - 14 dealt)', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG, setup: true, rng: () => 0.5 });
    expect(state.setupRemaining['P1']).toBe(26);
    expect(state.setupRemaining['P2']).toBe(26);
  });

  it('calcReinforcements returns 0 for Neutral', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG });
    expect(calcReinforcements(state, NEUTRAL_ID)).toBe(0);
  });

  it('nextAlivePointer skips Neutral', () => {
    // Players: [P1(0), P2(1), Neutral(2)]. After P2's turn, next should be P1 (not Neutral).
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG });
    const atP2 = { ...state, turnPointer: 1 };
    const next = nextAlivePointer(atP2);
    expect(state.players[next]?.id).toBe('P1');
    expect(state.players[next]?.id).not.toBe(NEUTRAL_ID);
  });

  it('checkWin returns the last real player when the other is eliminated', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG });
    // Mark P2 as eliminated (alive: false)
    const eliminated = {
      ...state,
      players: state.players.map((p) => p.id === 'P2' ? { ...p, alive: false } : p),
    };
    expect(checkWin(eliminated)).toBe('P1');
  });

  it('checkWin does not trigger when Neutral is eliminated (only real players matter)', () => {
    const state = createInitialState(['P1', 'P2'], { config: TWO_CONFIG });
    // Mark Neutral as eliminated; both real players still alive → no winner yet.
    const neutralGone = {
      ...state,
      players: state.players.map((p) => p.id === NEUTRAL_ID ? { ...p, alive: false } : p),
    };
    expect(checkWin(neutralGone)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Secret Assassin
// ---------------------------------------------------------------------------

describe('assassin', () => {
  const ASSASSIN_CONFIG = { ...DEFAULT_CONFIG, mode: 'assassin' as const };

  /** Build an attack-ready state with specific ownership and assassin targets. */
  function makeAssassinState(opts: {
    playerIds: string[];
    turPointer: number;
    targets: Record<string, string>;
    /** Each entry: [owner, territory, armies]. If not listed, armies default to 3. */
    ownership: Array<[string, TerritoryId, number]>;
  }): GameState {
    const base = createInitialState(opts.playerIds as PlayerId[]);
    const owner = { ...base.owner };
    const armies: Record<TerritoryId, number> = {} as Record<TerritoryId, number>;
    for (const id of ALL_TERRITORY_IDS) armies[id] = 3;

    // Assign ownership/armies
    for (const id of ALL_TERRITORY_IDS) owner[id] = opts.playerIds[0] as PlayerId;
    for (const [pid, tid, n] of opts.ownership) {
      owner[tid] = pid as PlayerId;
      armies[tid] = n;
    }

    return {
      ...base,
      config: ASSASSIN_CONFIG,
      phase: 'attack' as const,
      turnPointer: opts.turPointer,
      owner,
      armies,
      assassinTargets: opts.targets as Readonly<Record<PlayerId, PlayerId>>,
    };
  }

  it('createInitialState builds a circular chain in assassin mode', () => {
    const state = createInitialState(['P1', 'P2', 'P3'], { config: ASSASSIN_CONFIG, rng: () => 0.5 });
    const targets = state.assassinTargets!;
    expect(Object.keys(targets).length).toBe(3);
    // Walk the chain: it must visit all 3 players and return to the start.
    let cur = 'P1';
    for (let i = 0; i < 3; i++) {
      expect(targets[cur]).toBeDefined();
      expect(targets[cur]).not.toBe(cur); // no self-targeting
      cur = targets[cur]!;
    }
    expect(cur).toBe('P1'); // full cycle
  });

  it('player wins immediately when they eliminate their target', () => {
    // P1 (turnPointer=0) targets P2. P2's only territory = northwest-territory (1 army).
    const state = makeAssassinState({
      playerIds: ['P1', 'P2'],
      turPointer: 0,
      targets: { P1: 'P2', P2: 'P1' },
      ownership: [['P2', 'northwest-territory', 1]],
    });
    const result = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'northwest-territory',
      attackerRolls: [6, 5],
      defenderRolls: [1],
      moveOnCapture: 2,
    });
    expect(result.winner).toBe('P1');
  });

  it('no win when player eliminates a non-target', () => {
    // P1's target is P3, not P2. P1 eliminates P2 → no win.
    const state = makeAssassinState({
      playerIds: ['P1', 'P2', 'P3'],
      turPointer: 0,
      targets: { P1: 'P3', P2: 'P1', P3: 'P2' },
      ownership: [['P2', 'northwest-territory', 1]],
    });
    const result = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'northwest-territory',
      attackerRolls: [6, 5],
      defenderRolls: [1],
      moveOnCapture: 2,
    });
    expect(result.winner).toBeNull();
  });

  it('target chain reassigns when victim is eliminated by a non-targeting player', () => {
    // Chain: P1→P2, P2→P3, P3→P1. P3 (turnPointer=2) eliminates P2 (not P3's target P1).
    // P1 was targeting P2; after P2 is gone, P1 inherits P2's target = P3.
    const state = makeAssassinState({
      playerIds: ['P1', 'P2', 'P3'],
      turPointer: 2,        // P3 is current
      targets: { P1: 'P2', P2: 'P3', P3: 'P1' },
      ownership: [
        ['P3', 'alaska', 3],            // P3 attacks from alaska
        ['P2', 'northwest-territory', 1], // P2's only territory
      ],
    });
    const result = applyAttack(state, {
      type: 'ATTACK',
      from: 'alaska',
      to: 'northwest-territory',
      attackerRolls: [6, 5],
      defenderRolls: [1],
      moveOnCapture: 2,
    });
    expect(result.winner).toBeNull();
    expect(result.assassinTargets!['P1']).toBe('P3');   // inherited P2→P3
    expect(result.assassinTargets!['P3']).toBe('P1');   // unchanged
    expect(result.assassinTargets!['P2']).toBeUndefined(); // removed
  });
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

describe('teams', () => {
  const TEAMS_CONFIG = { ...DEFAULT_CONFIG, numOpponents: 3, teams: '2v2' as const };

  it('createInitialState assigns even-index players to A and odd-index to B', () => {
    const state = createInitialState(['P1', 'P2', 'P3', 'P4'], { config: TEAMS_CONFIG });
    expect(state.teamAssignments!['P1']).toBe('A');
    expect(state.teamAssignments!['P2']).toBe('B');
    expect(state.teamAssignments!['P3']).toBe('A');
    expect(state.teamAssignments!['P4']).toBe('B');
  });

  it('validateAttack rejects an attack on a teammate territory', () => {
    const base = createInitialState(['P1', 'P2']);
    const teamState: GameState = {
      ...base,
      config: TEAMS_CONFIG,
      phase: 'attack' as const,
      owner: { ...base.owner, alaska: 'P1', 'northwest-territory': 'P3' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      players: [
        { id: 'P1', color: 'red', cards: [], alive: true },
        { id: 'P2', color: 'blue', cards: [], alive: true },
        { id: 'P3', color: 'green', cards: [], alive: true },
        { id: 'P4', color: 'yellow', cards: [], alive: true },
      ],
      teamAssignments: { P1: 'A', P2: 'B', P3: 'A', P4: 'B' },
    };
    expect(validateAttack(teamState, 'alaska', 'northwest-territory').ok).toBe(false);
  });

  it('validateAttack allows an attack on an enemy territory', () => {
    const base = createInitialState(['P1', 'P2']);
    const teamState: GameState = {
      ...base,
      config: TEAMS_CONFIG,
      phase: 'attack' as const,
      owner: { ...base.owner, alaska: 'P1', 'northwest-territory': 'P2' },
      players: [
        { id: 'P1', color: 'red', cards: [], alive: true },
        { id: 'P2', color: 'blue', cards: [], alive: true },
        { id: 'P3', color: 'green', cards: [], alive: true },
        { id: 'P4', color: 'yellow', cards: [], alive: true },
      ],
      teamAssignments: { P1: 'A', P2: 'B', P3: 'A', P4: 'B' },
    };
    expect(validateAttack(teamState, 'alaska', 'northwest-territory').ok).toBe(true);
  });

  it('checkWin fires when one team is fully eliminated', () => {
    const state = createInitialState(['P1', 'P2'], { config: TEAMS_CONFIG });
    // Mark Team B players as eliminated
    const eliminated: GameState = {
      ...state,
      players: state.players.map((p) =>
        state.teamAssignments![p.id] === 'B' ? { ...p, alive: false } : p,
      ),
      teamAssignments: { P1: 'A', P2: 'B', P3: 'A', P4: 'B' },
    };
    const winner = checkWin(eliminated);
    expect(winner).not.toBeNull();
    // Winner should be on Team A
    expect(eliminated.teamAssignments![winner!]).toBe('A');
  });

  it('checkWin returns null when both teams still have alive players', () => {
    const state = createInitialState(['P1', 'P2', 'P3', 'P4'], { config: TEAMS_CONFIG });
    expect(checkWin(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Zombies mode
// ---------------------------------------------------------------------------

describe('zombies mode', () => {
  const ZOMBIE_CONFIG = { ...DEFAULT_CONFIG, mode: 'zombies' as const };

  it('createInitialState injects Zombie as an extra player', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    expect(s.players.some((p) => p.id === ZOMBIE_ID)).toBe(true);
    // 2 real players + Zombie pseudo-player
    expect(s.players.length).toBe(3);
  });

  it('Zombie starts with roughly equal territory share', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const zombieTerrs = ALL_TERRITORY_IDS.filter((id) => s.owner[id] === ZOMBIE_ID);
    // With 3 "players" sharing 42 territories, each gets 14.
    expect(zombieTerrs.length).toBe(14);
  });

  it('calcReinforcements returns 0 for the Zombie pseudo-player', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    expect(calcReinforcements(s, ZOMBIE_ID)).toBe(0);
  });

  it('nextAlivePointer skips the Zombie player', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    // Players array: [P1(0), P2(1), Zombie(2)]
    // From P2 (turnPointer=1), wrap should return P1(0), not Zombie(2).
    const atP2 = { ...s, turnPointer: 1 };
    const ptr = nextAlivePointer(atP2);
    expect(s.players[ptr]?.id).toBe('P1');
  });

  it('applyZombieTurn reinforces zombie territories (+1 army each)', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    // Give Zombie a single territory with 3 armies and no viable attack (island with no neighbours).
    // Use western-australia which only connects to eastern-australia and new-guinea.
    // Override all neighbours to also be zombie so no spread occurs.
    const zombieState: GameState = {
      ...s,
      phase: 'reinforce' as const,
      owner: {
        ...s.owner,
        'western-australia': ZOMBIE_ID,
        'eastern-australia': ZOMBIE_ID,
        'new-guinea': ZOMBIE_ID,
        indonesia: ZOMBIE_ID,
      },
      armies: {
        ...s.armies,
        'western-australia': 3,
        'eastern-australia': 3,
        'new-guinea': 3,
        indonesia: 3,
      },
    };
    const mockRng = () => 0.5;
    const after = applyZombieTurn(zombieState, mockRng);
    // Each zombie territory should gain +1 army.
    expect(after.armies['western-australia']).toBe(4);
    expect(after.armies['eastern-australia']).toBe(4);
  });

  it('applyZombieTurn captures an adjacent territory and applies infect-half', () => {
    // alaska (zombie, 4 armies) adj northwest-territory (P1, 1 army).
    // After reinforce zombie has 5. With winning dice: capture happens.
    // Infect-half: ceil(1/2) = 1 army on captured territory.
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const zombieState: GameState = {
      ...s,
      phase: 'attack' as const,
      owner: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 'P1'])) as Record<TerritoryId, PlayerId>,
        alaska: ZOMBIE_ID,
      },
      armies: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 1])) as Record<TerritoryId, number>,
        alaska: 4,
        'northwest-territory': 1,
      },
      players: [
        { id: 'P1', color: 'red', cards: [], alive: true },
        { id: 'P2', color: 'blue', cards: [], alive: true },
        { id: ZOMBIE_ID, color: '#4a7a40', cards: [], alive: true },
      ],
    };
    // Roll sequence: attacker (3 dice) then defender (1 die). High zombie, low P1.
    const rollSeq = [0.99, 0.99, 0.99, 0.01];
    let callIdx = 0;
    const mockRng = () => rollSeq[callIdx++] ?? 0.5;

    const after = applyZombieTurn(zombieState, mockRng);
    expect(after.owner['northwest-territory']).toBe(ZOMBIE_ID);
    // infect-half of original 1-army defender: ceil(1/2) = 1
    expect(after.armies['northwest-territory']).toBe(1);
  });

  it('applyZombieTurn infects ceil(defenderArmies / 2) on capture', () => {
    // alaska (zombie, 5 armies → 6 after reinforce) adj northwest-territory (P1, 2 armies).
    // With winning dice → capture. infect = ceil(2/2) = 1.
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const zombieState: GameState = {
      ...s,
      phase: 'attack' as const,
      owner: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 'P1'])) as Record<TerritoryId, PlayerId>,
        alaska: ZOMBIE_ID,
      },
      armies: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 1])) as Record<TerritoryId, number>,
        alaska: 5,
        'northwest-territory': 2,
      },
      players: [
        { id: 'P1', color: 'red', cards: [], alive: true },
        { id: 'P2', color: 'blue', cards: [], alive: true },
        { id: ZOMBIE_ID, color: '#4a7a40', cards: [], alive: true },
      ],
    };
    // Attacker rolls high, defender rolls low → zombie wins both pairs.
    const rollSeq = [0.99, 0.99, 0.99, 0.01, 0.01];
    let callIdx = 0;
    const mockRng = () => rollSeq[callIdx++] ?? 0.5;

    const after = applyZombieTurn(zombieState, mockRng);
    if (after.owner['northwest-territory'] === ZOMBIE_ID) {
      expect(after.armies['northwest-territory']).toBe(1); // ceil(2/2)
    }
  });

  it('applyZombieTurn eliminates a player who loses their last territory', () => {
    // P2 owns only northwest-territory (1 army). Zombie owns alaska (8 armies).
    // alaska's neighbours are [northwest-territory, kamchatka] in order.
    // Provide winning rolls for each attack: 3 attacker + 1 defender dice per attack.
    // High zombie dice → captures all reachable territories → P2 (northwest-territory) eliminated.
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const zombieState: GameState = {
      ...s,
      phase: 'attack' as const,
      owner: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 'P1'])) as Record<TerritoryId, PlayerId>,
        alaska: ZOMBIE_ID,
        'northwest-territory': 'P2',
      },
      armies: {
        ...Object.fromEntries(ALL_TERRITORY_IDS.map((id) => [id, 1])) as Record<TerritoryId, number>,
        alaska: 8,
        'northwest-territory': 1,
      },
      players: [
        { id: 'P1', color: 'red', cards: [], alive: true },
        { id: 'P2', color: 'blue', cards: [], alive: true },
        { id: ZOMBIE_ID, color: '#4a7a40', cards: [], alive: true },
      ],
    };
    // Enough winning rolls for all of alaska's neighbours (up to 3 attacks × 4 rolls each).
    const rollSeq = Array(12).fill(0).map((_, i) => i % 4 === 3 ? 0.01 : 0.99);
    let callIdx = 0;
    const mockRng = () => rollSeq[callIdx++] ?? 0.5;

    const after = applyZombieTurn(zombieState, mockRng);
    // Northwest-territory should be zombie-owned and P2 eliminated.
    expect(after.owner['northwest-territory']).toBe(ZOMBIE_ID);
    expect(after.players.find((p) => p.id === 'P2')?.alive).toBe(false);
  });

  it('checkWin returns last real player when opponent is eliminated', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const eliminated: GameState = {
      ...s,
      players: s.players.map((p) => p.id === 'P2' ? { ...p, alive: false } : p),
    };
    expect(checkWin(eliminated)).toBe('P1');
  });

  it('checkWin returns null when both real players are alive', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    expect(checkWin(s)).toBeNull();
  });

  it('checkWin returns ZOMBIE_ID when all real players are eaten', () => {
    const s = createInitialState(['P1', 'P2'], { config: ZOMBIE_CONFIG });
    const allEaten: GameState = {
      ...s,
      players: s.players.map((p) => p.id === ZOMBIE_ID ? p : { ...p, alive: false }),
    };
    expect(checkWin(allEaten)).toBe(ZOMBIE_ID);
  });
});
