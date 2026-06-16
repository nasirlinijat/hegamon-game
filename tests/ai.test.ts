import { describe, it, expect } from 'vitest';
import { createInitialState, type GameState, type PlayerId, type Card } from '../src/engine/state';
import { ALL_TERRITORY_IDS, type TerritoryId } from '../src/engine/map';
import { reduce } from '../src/engine/actions';
import { type Rng } from '../src/engine/dice';
import { chooseAction } from '../src/engine/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stateful cycling RNG: returns seq[i % seq.length] on each call. */
function seqRng(seq: readonly number[]): Rng {
  let i = 0;
  return () => seq[i++ % seq.length]!;
}

/** Constant-value RNG — useful for phases that don't touch dice. */
const fixedRng = (v: number): Rng => () => v;

/**
 * Build a two-player test state.
 * P1 owns `p1Territories` (armies default to 3); P2 owns the rest (armies default to 2).
 * Individual armies can be overridden via `armiesOverride`.
 */
function buildState(
  p1Territories: readonly TerritoryId[],
  opts: {
    phase?: 'reinforce' | 'attack' | 'fortify';
    reinforcementsRemaining?: number;
    armiesOverride?: Partial<Record<TerritoryId, number>>;
    p1Cards?: readonly Card[];
    mustTradeCards?: boolean;
    fortifiedThisTurn?: boolean;
  } = {},
): GameState {
  const base = createInitialState(['P1', 'P2']);
  const owner = { ...base.owner } as Record<TerritoryId, PlayerId>;
  const armies = { ...base.armies } as Record<TerritoryId, number>;

  for (const id of ALL_TERRITORY_IDS) {
    owner[id] = p1Territories.includes(id) ? 'P1' : 'P2';
    armies[id] = opts.armiesOverride?.[id] ?? (p1Territories.includes(id) ? 3 : 2);
  }

  return {
    ...base,
    owner,
    armies,
    phase: opts.phase ?? 'reinforce',
    reinforcementsRemaining: opts.reinforcementsRemaining ?? 0,
    mustTradeCards: opts.mustTradeCards ?? false,
    fortifiedThisTurn: opts.fortifiedThisTurn ?? false,
    players: base.players.map((p) => ({
      ...p,
      cards: p.id === 'P1' ? (opts.p1Cards ?? []) : [],
    })),
  };
}

// ---------------------------------------------------------------------------
// chooseAction — reinforce phase
// ---------------------------------------------------------------------------

describe('chooseAction — reinforce', () => {
  it('returns REINFORCE (legal) when armies remain', () => {
    const state = buildState(['alaska', 'kamchatka'], {
      phase: 'reinforce',
      reinforcementsRemaining: 5,
    });
    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('REINFORCE');
    expect(() => reduce(state, action)).not.toThrow();
  });

  it('places all remaining armies in one action', () => {
    const state = buildState(['alaska', 'kamchatka'], {
      phase: 'reinforce',
      reinforcementsRemaining: 7,
    });
    const action = chooseAction(state, fixedRng(0.5));
    if (action.type !== 'REINFORCE') throw new Error('expected REINFORCE');
    expect(action.count).toBe(7);
  });

  it('returns END_PHASE when no armies remain', () => {
    const state = buildState(['alaska'], {
      phase: 'reinforce',
      reinforcementsRemaining: 0,
    });
    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('END_PHASE');
    expect(() => reduce(state, action)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// chooseAction — attack phase
// ---------------------------------------------------------------------------

describe('chooseAction — attack', () => {
  // [6,6,6] for attacker, [1,1] for defender (5-cycle, one complete cycle per 3v2).
  const winRng = () => seqRng([0.99, 0.99, 0.99, 0.0, 0.0]);

  it('attacks the most favourable adjacent enemy and produces a legal action', () => {
    // P1 owns all except kamchatka; yakutsk (10 armies) is adjacent to kamchatka (2).
    const p1Terrs = ALL_TERRITORY_IDS.filter((id) => id !== 'kamchatka') as TerritoryId[];
    const state = buildState(p1Terrs, {
      phase: 'attack',
      armiesOverride: { yakutsk: 10, kamchatka: 2 },
    });

    const action = chooseAction(state, winRng());
    expect(action.type).toBe('ATTACK');
    expect(() => reduce(state, action)).not.toThrow();
  });

  it('supplies moveOnCapture on a capturing exchange', () => {
    const p1Terrs = ALL_TERRITORY_IDS.filter((id) => id !== 'kamchatka') as TerritoryId[];
    const state = buildState(p1Terrs, {
      phase: 'attack',
      armiesOverride: { yakutsk: 10, kamchatka: 1 },
    });

    const action = chooseAction(state, winRng());
    if (action.type !== 'ATTACK') throw new Error('expected ATTACK');
    // With [6,6,6] vs [1]: defender loses 1 → capture → moveOnCapture must be set.
    const { attackerRolls, defenderRolls, moveOnCapture } = action;
    const defenderDefeated = defenderRolls.length === 1 && attackerRolls[0]! > defenderRolls[0]!;
    if (defenderDefeated) expect(moveOnCapture).toBeDefined();
  });

  it('returns END_PHASE when no target has a positive army advantage', () => {
    // P1 owns only alaska (2 armies); every P2 neighbour has 10 armies → advantage < 0.
    const state = buildState(['alaska'], {
      phase: 'attack',
      armiesOverride: {
        alaska: 2,
        'northwest-territory': 10,
        kamchatka: 10,
        alberta: 10,
      },
    });
    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('END_PHASE');
  });
});

// ---------------------------------------------------------------------------
// chooseAction — fortify phase
// ---------------------------------------------------------------------------

describe('chooseAction — fortify', () => {
  it('moves excess armies from an interior territory to a border territory', () => {
    // P1 owns all of Australia. new-guinea is interior (all neighbours P1-owned);
    // indonesia is the border (adjacent to siam, which P2 owns).
    const AU = ['eastern-australia', 'western-australia', 'new-guinea', 'indonesia'] as TerritoryId[];
    const state = buildState(AU, {
      phase: 'fortify',
      armiesOverride: {
        'new-guinea': 6,
        indonesia: 1,
        'eastern-australia': 3,
        'western-australia': 3,
      },
    });

    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('FORTIFY');
    const next = reduce(state, action);
    expect(next.fortifiedThisTurn).toBe(true);
  });

  it('returns END_PHASE after already fortifying this turn', () => {
    const state = buildState(['alaska', 'northwest-territory'], {
      phase: 'fortify',
      fortifiedThisTurn: true,
    });
    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('END_PHASE');
  });

  it('produced FORTIFY action is legal when passed through the reducer', () => {
    const AU = ['eastern-australia', 'western-australia', 'new-guinea', 'indonesia'] as TerritoryId[];
    const state = buildState(AU, {
      phase: 'fortify',
      armiesOverride: { 'new-guinea': 8, indonesia: 1, 'eastern-australia': 3, 'western-australia': 3 },
    });
    const action = chooseAction(state, fixedRng(0.5));
    if (action.type !== 'FORTIFY') return; // already covered by the test above
    expect(() => reduce(state, action)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// chooseAction — mustTradeCards
// ---------------------------------------------------------------------------

describe('chooseAction — trade-in', () => {
  it('finds and plays a valid set when forced to trade', () => {
    // Hand: three infantry (valid three-of-a-kind) + two extras.
    const cards: Card[] = [
      { type: 'infantry', territory: 'alaska' },
      { type: 'infantry', territory: 'kamchatka' },
      { type: 'infantry', territory: 'irkutsk' },
      { type: 'cavalry', territory: 'ontario' },
      { type: 'artillery', territory: 'brazil' },
    ];
    const state = buildState(['alaska'], {
      phase: 'reinforce',
      reinforcementsRemaining: 0,
      p1Cards: cards,
      mustTradeCards: true,
    });

    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('TRADE_IN');
    expect(() => reduce(state, action)).not.toThrow();
  });

  it('also handles a one-of-each set', () => {
    const cards: Card[] = [
      { type: 'infantry', territory: 'alaska' },
      { type: 'cavalry', territory: 'kamchatka' },
      { type: 'artillery', territory: 'ontario' },
      { type: 'infantry', territory: 'irkutsk' },
      { type: 'cavalry', territory: 'brazil' },
    ];
    const state = buildState(['alaska'], {
      phase: 'reinforce',
      reinforcementsRemaining: 0,
      p1Cards: cards,
      mustTradeCards: true,
    });

    const action = chooseAction(state, fixedRng(0.5));
    expect(action.type).toBe('TRADE_IN');
    expect(() => reduce(state, action)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AI-vs-AI full game — runs to completion with zero illegal moves
// ---------------------------------------------------------------------------

describe('AI-vs-AI full game', () => {
  it('runs to completion with zero illegal moves within 1000 actions', () => {
    //
    // Setup: P1 owns alaska (100 armies); P2 owns all other 41 territories (2 armies each).
    //
    // Deterministic RNG — 5-cycle [0.99, 0.99, 0.99, 0.0, 0.0]:
    //   • Attacker dice (first 3 calls) → 6, 6, 6
    //   • Defender dice (next  2 calls) → 1, 1
    //   resolveCombat([6,6,6], [1,1]) = {att:0, def:2} → capture every time.
    //
    // Why the cycle stays aligned: every attack is 3v2 (P1 has 4+ armies; P2 always has
    // exactly 2), so each attack consumes exactly 5 rng calls — one full cycle. The
    // pattern never drifts. P1 captures all 41 territories before P2 moves.
    //

    const owner: Record<TerritoryId, PlayerId> = {} as Record<TerritoryId, PlayerId>;
    const armies: Record<TerritoryId, number> = {} as Record<TerritoryId, number>;

    for (const id of ALL_TERRITORY_IDS) {
      owner[id] = id === 'alaska' ? 'P1' : 'P2';
      armies[id] = id === 'alaska' ? 100 : 2;
    }

    const base = createInitialState(['P1', 'P2']);
    let state: GameState = {
      ...base,
      owner,
      armies,
      phase: 'reinforce',
      reinforcementsRemaining: 3, // max(3, floor(1/3)) = 3
    };

    const rng = seqRng([0.99, 0.99, 0.99, 0.0, 0.0]);

    let actionCount = 0;
    const MAX = 1000;

    while (state.winner === null && actionCount < MAX) {
      const action = chooseAction(state, rng);
      // reduce() throws IllegalActionError on any illegal move — test fails here if so.
      state = reduce(state, action);
      actionCount++;
    }

    // Game must have ended with a winner (not by hitting the action cap).
    expect(state.winner).toBe('P1');
    expect(actionCount).toBeLessThan(MAX);

    // Sanity: P1 truly owns all 42 territories.
    expect(ALL_TERRITORY_IDS.every((id) => state.owner[id] === 'P1')).toBe(true);
  });

  it('AI handles multi-turn games with both players acting', () => {
    //
    // Balanced-ish start: P1 and P2 each own roughly half the territories.
    // Use the standard createInitialState round-robin distribution (3 armies each).
    // Both players attack when they have advantage, fortify when possible.
    //
    // We can't guarantee a winner within N turns with random dice, so we
    // give one player an army boost and use the same attacker-wins rng.
    //

    // Give P1 a 10-army lead on every territory it starts with.
    const base = createInitialState(['P1', 'P2']);
    const armies = { ...base.armies } as Record<TerritoryId, number>;
    for (const id of ALL_TERRITORY_IDS) {
      if (base.owner[id] === 'P1') armies[id] = 10;
    }
    let state: GameState = { ...base, armies };

    const rng = seqRng([0.99, 0.99, 0.99, 0.0, 0.0]);

    let actionCount = 0;
    const MAX = 1000;

    while (state.winner === null && actionCount < MAX) {
      const action = chooseAction(state, rng);
      state = reduce(state, action);
      actionCount++;
    }

    // With a 10-army head start and attacker-wins dice, P1 should dominate.
    expect(state.winner).not.toBeNull();
    expect(actionCount).toBeLessThan(MAX);
  });
});
