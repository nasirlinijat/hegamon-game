import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  type GameState,
  type PlayerId,
  type Phase,
  type Card,
} from '../src/engine/state';
import { ALL_TERRITORY_IDS, type TerritoryId } from '../src/engine/map';
import { reduce } from '../src/engine/actions';
import { calcReinforcements } from '../src/engine/rules';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Two-player state where P1 owns exactly p1Territories; P2 owns the rest. */
function stateWith(
  p1Territories: TerritoryId[],
  opts: {
    phase?: Phase;
    reinforcementsRemaining?: number;
    armiesOverride?: Partial<Record<TerritoryId, number>>;
    p1Cards?: Card[];
    p2Cards?: Card[];
    fortifiedThisTurn?: boolean;
  } = {},
): GameState {
  const base = createInitialState(['P1', 'P2']);
  const owner = { ...base.owner } as Record<TerritoryId, PlayerId>;
  const armies = { ...base.armies } as Record<TerritoryId, number>;

  for (const id of ALL_TERRITORY_IDS) {
    owner[id] = p1Territories.includes(id) ? 'P1' : 'P2';
    armies[id] = opts.armiesOverride?.[id] ?? 3;
  }

  return {
    ...base,
    owner,
    armies,
    phase: opts.phase ?? 'reinforce',
    reinforcementsRemaining: opts.reinforcementsRemaining ?? 0,
    fortifiedThisTurn: opts.fortifiedThisTurn ?? false,
    players: base.players.map((p) => ({
      ...p,
      cards: p.id === 'P1' ? (opts.p1Cards ?? []) : (opts.p2Cards ?? []),
    })),
  };
}

/** Three-player state for testing turn-skip logic. */
function threePlayerState(
  ownership: Record<'P1' | 'P2' | 'P3', TerritoryId[]>,
  opts: { phase?: Phase; currentPointer?: number } = {},
): GameState {
  const base = createInitialState(['P1', 'P2', 'P3']);
  const owner = { ...base.owner } as Record<TerritoryId, PlayerId>;
  const armies = { ...base.armies } as Record<TerritoryId, number>;

  for (const [pid, terrs] of Object.entries(ownership) as [string, TerritoryId[]][]) {
    for (const t of terrs) {
      owner[t] = pid;
      armies[t] = 3;
    }
  }

  return {
    ...base,
    owner,
    armies,
    phase: opts.phase ?? 'fortify',
    reinforcementsRemaining: 0,
    turnPointer: opts.currentPointer ?? 0,
    players: base.players.map((p) => ({
      ...p,
      // Mark P2 as eliminated so the turn skips them.
      alive: p.id !== 'P2',
    })),
  };
}

// ---------------------------------------------------------------------------
// Phase order enforcement
// ---------------------------------------------------------------------------

describe('phase order enforcement', () => {
  const p1 = ALL_TERRITORY_IDS.filter((id) => id !== 'alaska');

  it('REINFORCE rejected in attack phase', () => {
    const state = stateWith(['alaska', 'northwest-territory'], { phase: 'attack' });
    expect(() =>
      reduce(state, { type: 'REINFORCE', territory: 'alaska', count: 1 }),
    ).toThrow();
  });

  it('REINFORCE rejected in fortify phase', () => {
    const state = stateWith(['alaska', 'northwest-territory'], { phase: 'fortify' });
    expect(() =>
      reduce(state, { type: 'REINFORCE', territory: 'alaska', count: 1 }),
    ).toThrow();
  });

  it('ATTACK rejected in reinforce phase', () => {
    const state = stateWith(p1, {
      phase: 'reinforce',
      reinforcementsRemaining: 3,
      armiesOverride: { kamchatka: 5, alaska: 1 },
    });
    expect(() =>
      reduce(state, {
        type: 'ATTACK',
        from: 'kamchatka',
        to: 'alaska',
        attackerRolls: [6],
        defenderRolls: [1],
      }),
    ).toThrow();
  });

  it('ATTACK rejected in fortify phase', () => {
    const state = stateWith(p1, {
      phase: 'fortify',
      armiesOverride: { kamchatka: 5, alaska: 1 },
    });
    expect(() =>
      reduce(state, {
        type: 'ATTACK',
        from: 'kamchatka',
        to: 'alaska',
        attackerRolls: [6],
        defenderRolls: [1],
      }),
    ).toThrow();
  });

  it('FORTIFY rejected in reinforce phase', () => {
    const state = stateWith(['alaska', 'northwest-territory'], {
      phase: 'reinforce',
      armiesOverride: { alaska: 4, 'northwest-territory': 2 },
    });
    expect(() =>
      reduce(state, { type: 'FORTIFY', from: 'alaska', to: 'northwest-territory', count: 2 }),
    ).toThrow();
  });

  it('FORTIFY rejected in attack phase', () => {
    const state = stateWith(['alaska', 'northwest-territory'], {
      phase: 'attack',
      armiesOverride: { alaska: 4, 'northwest-territory': 2 },
    });
    expect(() =>
      reduce(state, { type: 'FORTIFY', from: 'alaska', to: 'northwest-territory', count: 2 }),
    ).toThrow();
  });

  it('FORTIFY rejected when already used this turn', () => {
    const state = stateWith(['alaska', 'northwest-territory', 'alberta'], {
      phase: 'fortify',
      armiesOverride: { alaska: 6, 'northwest-territory': 2, alberta: 2 },
    });
    const s1 = reduce(state, {
      type: 'FORTIFY',
      from: 'alaska',
      to: 'northwest-territory',
      count: 2,
    });
    expect(s1.fortifiedThisTurn).toBe(true);
    expect(() =>
      reduce(s1, { type: 'FORTIFY', from: 'alaska', to: 'alberta', count: 1 }),
    ).toThrow();
  });

  it('END_PHASE from reinforce rejected when reinforcementsRemaining > 0', () => {
    const state = stateWith(['alaska'], {
      phase: 'reinforce',
      reinforcementsRemaining: 3,
    });
    expect(() => reduce(state, { type: 'END_PHASE' })).toThrow();
  });

  it('END_PHASE from reinforce (0 remaining) advances to attack', () => {
    const state = stateWith(['alaska'], { phase: 'reinforce', reinforcementsRemaining: 0 });
    expect(reduce(state, { type: 'END_PHASE' }).phase).toBe('attack');
  });

  it('END_PHASE from attack advances to fortify', () => {
    const state = stateWith(['alaska', 'kamchatka'], { phase: 'attack' });
    expect(reduce(state, { type: 'END_PHASE' }).phase).toBe('fortify');
  });

  it('END_PHASE from fortify advances to next player in reinforce and resets per-turn flags', () => {
    const state = stateWith(['alaska', 'kamchatka'], {
      phase: 'fortify',
      fortifiedThisTurn: true,
    });
    // Manually set capturedThisTurn too
    const s: GameState = { ...state, capturedThisTurn: true };
    const next = reduce(s, { type: 'END_PHASE' });
    expect(next.phase).toBe('reinforce');
    expect(next.players[next.turnPointer]!.id).toBe('P2');
    expect(next.capturedThisTurn).toBe(false);
    expect(next.fortifiedThisTurn).toBe(false);
    expect(next.reinforcementsRemaining).toBe(calcReinforcements(next, 'P2'));
  });
});

// ---------------------------------------------------------------------------
// Elimination
// ---------------------------------------------------------------------------

describe('elimination', () => {
  const p1All = [...ALL_TERRITORY_IDS] as TerritoryId[];
  const p1Without = (t: TerritoryId) => p1All.filter((id) => id !== t);

  it('player with 0 territories is marked alive: false', () => {
    const state = stateWith(p1Without('alaska'), {
      phase: 'attack',
      armiesOverride: { kamchatka: 5, alaska: 1 },
    });
    const next = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });
    expect(next.players.find((p) => p.id === 'P2')!.alive).toBe(false);
  });

  it("eliminated player's cards transfer to the attacker", () => {
    const p2Card: Card = { type: 'infantry', territory: 'alaska' };
    const state = stateWith(p1Without('alaska'), {
      phase: 'attack',
      armiesOverride: { kamchatka: 5, alaska: 1 },
      p2Cards: [p2Card],
    });
    const next = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });
    const p1 = next.players.find((p) => p.id === 'P1')!;
    expect(p1.cards).toHaveLength(1);
    expect(p1.cards[0]).toEqual(p2Card);
    expect(next.players.find((p) => p.id === 'P2')!.cards).toHaveLength(0);
  });

  it('turn skips eliminated players (3-player game)', () => {
    // P2 already eliminated; it's P1's turn (fortify phase).
    // END_PHASE should jump to P3, not P2.
    const state = threePlayerState(
      {
        P1: ['alaska', 'northwest-territory'],
        P2: [], // eliminated
        P3: ['kamchatka', 'alberta'],
      },
      { currentPointer: 0 },
    );
    const next = reduce(state, { type: 'END_PHASE' });
    expect(next.players[next.turnPointer]!.id).toBe('P3');
  });
});

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

describe('win condition', () => {
  it('winner is null while territories are split', () => {
    // P1 owns 40 territories, P2 owns alaska and kamchatka. Attack doesn't capture.
    const p1Terrs = ALL_TERRITORY_IDS.filter(
      (id) => id !== 'alaska' && id !== 'kamchatka',
    ) as TerritoryId[];
    const state = stateWith(p1Terrs, {
      phase: 'attack',
      // yakutsk (P1) is adjacent to kamchatka (P2); defender wins the exchange
      armiesOverride: { yakutsk: 4, kamchatka: 5 },
    });
    // Defender wins ([1] vs [6]) — no capture, winner stays null
    const next = reduce(state, {
      type: 'ATTACK',
      from: 'yakutsk',
      to: 'kamchatka',
      attackerRolls: [1],
      defenderRolls: [6],
    });
    expect(next.winner).toBeNull();
  });

  it('winner is set to the conquering player when all 42 are owned', () => {
    const state = stateWith(
      ALL_TERRITORY_IDS.filter((id) => id !== 'alaska') as TerritoryId[],
      { phase: 'attack', armiesOverride: { kamchatka: 5, alaska: 1 } },
    );
    const next = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });
    expect(next.winner).toBe('P1');
  });

  it('any action after the game is over throws', () => {
    const state = stateWith(
      ALL_TERRITORY_IDS.filter((id) => id !== 'alaska') as TerritoryId[],
      { phase: 'attack', armiesOverride: { kamchatka: 5, alaska: 1 } },
    );
    const finished = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });
    expect(finished.winner).toBe('P1');
    expect(() => reduce(finished, { type: 'END_PHASE' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scripted game reaching a win state
// ---------------------------------------------------------------------------

describe('scripted game', () => {
  it('P1 conquers the last territory and wins', () => {
    // Setup: P1 owns 41 territories, P2 owns only alaska with 1 army.
    // P1 starts in reinforce phase with exactly 3 reinforcements remaining.
    const p1Territories = ALL_TERRITORY_IDS.filter((id) => id !== 'alaska') as TerritoryId[];
    const armiesOverride: Partial<Record<TerritoryId, number>> = {};
    for (const id of p1Territories) armiesOverride[id] = 4;
    armiesOverride['alaska'] = 1;
    armiesOverride['kamchatka'] = 4; // adjacent to alaska

    let state = stateWith(p1Territories, {
      phase: 'reinforce',
      reinforcementsRemaining: 3,
      armiesOverride,
    });

    // Step 1: place all 3 reinforcements on kamchatka (now has 7 armies)
    state = reduce(state, { type: 'REINFORCE', territory: 'kamchatka', count: 3 });
    expect(state.armies['kamchatka']).toBe(7);
    expect(state.reinforcementsRemaining).toBe(0);
    expect(state.phase).toBe('reinforce'); // still placing

    // Step 2: advance to attack phase
    state = reduce(state, { type: 'END_PHASE' });
    expect(state.phase).toBe('attack');

    // Step 3: attack alaska from kamchatka — guaranteed win (3 dice vs 1 army)
    state = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });

    // Verify the game is over
    expect(state.winner).toBe('P1');
    expect(state.owner['alaska']).toBe('P1');
    expect(state.players.find((p) => p.id === 'P2')!.alive).toBe(false);

    // Verify P1 truly owns all 42
    expect(ALL_TERRITORY_IDS.every((id) => state.owner[id] === 'P1')).toBe(true);

    // Any further action is rejected
    expect(() => reduce(state, { type: 'END_PHASE' })).toThrow();
  });
});
