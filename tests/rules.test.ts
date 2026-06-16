import { describe, it, expect } from 'vitest';
import { createInitialState, type GameState, type PlayerId } from '../src/engine/state';
import { ALL_TERRITORY_IDS, CONTINENTS, type TerritoryId } from '../src/engine/map';
import {
  resolveCombat,
  attackDiceCount,
  defenseDiceCount,
  calcReinforcements,
  ownsContinent,
  validateReinforce,
  validateAttack,
  applyAttack,
  validateFortify,
  connectedThroughOwned,
  checkWin,
} from '../src/engine/rules';
import { reduce } from '../src/engine/actions';

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
    // P1 owns alaska → northwest-territory → ontario (chain)
    const p1 = ['alaska', 'northwest-territory', 'ontario'] as TerritoryId[];
    const state = twoPlayerState(p1, { phase: 'fortify' });
    const s = { ...state, armies: { ...state.armies, alaska: 5, ontario: 2 } };
    expect(validateFortify(s, 'alaska', 'ontario', 3).ok).toBe(true);
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
    const s2a = { ...s2, armies: { ...s2.armies, alaska: 5, kamchatka: 2 } };
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
