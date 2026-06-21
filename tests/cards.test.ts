import { describe, it, expect } from 'vitest';
import { createInitialState, type GameState, type Card, type PlayerId } from '../src/engine/state';
import { ALL_TERRITORY_IDS, type TerritoryId } from '../src/engine/map';
import { DEFAULT_CONFIG } from '../src/engine/modes';
import { reduce } from '../src/engine/actions';
import {
  isValidSet,
  tradeInValue,
  fixedSetValue,
  cardSetValue,
  createDeck,
  applyTradeIn,
  drawCardForCurrentPlayer,
  UNSHUFFLED_DECK,
} from '../src/engine/cards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INF: Card = { type: 'infantry', territory: 'alaska' };
const CAV: Card = { type: 'cavalry', territory: 'greenland' };
const ART: Card = { type: 'artillery', territory: 'brazil' };
const WILD: Card = { type: 'wild', territory: null };

function baseState(
  phase: GameState['phase'] = 'reinforce',
  p1Cards: Card[] = [],
  overrides: Partial<GameState> = {},
): GameState {
  const s = createInitialState(['P1', 'P2']);
  const owner = { ...s.owner } as Record<TerritoryId, PlayerId>;
  // Give P1 a known set of territories for territory-match bonus tests
  for (const id of ALL_TERRITORY_IDS) owner[id] = 'P1';
  owner['kamchatka'] = 'P2'; // P2 owns one territory so P1 isn't declared winner
  return {
    ...s,
    phase,
    owner,
    reinforcementsRemaining: 0,
    players: s.players.map((p) => (p.id === 'P1' ? { ...p, cards: p1Cards } : p)),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isValidSet
// ---------------------------------------------------------------------------

describe('isValidSet', () => {
  it('three of the same type (infantry) → valid', () => {
    expect(isValidSet([INF, INF, INF])).toBe(true);
  });

  it('three of the same type (cavalry) → valid', () => {
    expect(isValidSet([CAV, CAV, CAV])).toBe(true);
  });

  it('three of the same type (artillery) → valid', () => {
    expect(isValidSet([ART, ART, ART])).toBe(true);
  });

  it('one of each type → valid', () => {
    expect(isValidSet([INF, CAV, ART])).toBe(true);
  });

  it('two same + one wild → valid', () => {
    expect(isValidSet([INF, INF, WILD])).toBe(true);
  });

  it('two different + one wild → valid', () => {
    expect(isValidSet([INF, CAV, WILD])).toBe(true);
  });

  it('artillery + cavalry + wild → valid', () => {
    expect(isValidSet([ART, CAV, WILD])).toBe(true);
  });

  it('two same, one different, no wild → invalid (2 unique types)', () => {
    expect(isValidSet([INF, INF, CAV])).toBe(false);
  });

  it('two wilds → invalid', () => {
    const extra: Card = { type: 'infantry', territory: 'ontario' };
    expect(isValidSet([WILD, WILD, extra])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tradeInValue — escalation sequence
// ---------------------------------------------------------------------------

describe('tradeInValue', () => {
  it.each([
    [0, 4],
    [1, 6],
    [2, 8],
    [3, 10],
    [4, 12],
    [5, 15],
    [6, 20],
    [7, 25],
    [8, 30],
  ])('trade #%i → %i armies', (count, expected) => {
    expect(tradeInValue(count)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// tradeInValue — card bonus modes
// ---------------------------------------------------------------------------

describe('tradeInValue — card bonus modes', () => {
  it('none: always 0 regardless of tradeInCount', () => {
    expect(tradeInValue(0, 'none')).toBe(0);
    expect(tradeInValue(7, 'none')).toBe(0);
  });

  it('fixed: composition-based, never escalates (all-inf 4, all-cav 6, all-art 8, one-each 10)', () => {
    const inf2: Card = { type: 'infantry', territory: 'ontario' };
    const inf3: Card = { type: 'infantry', territory: 'quebec' };
    const cav2: Card = { type: 'cavalry', territory: 'peru' };
    expect(fixedSetValue([INF, inf2, inf3])).toBe(4);                 // three infantry
    expect(fixedSetValue([CAV, cav2, { type: 'cavalry', territory: 'iceland' }])).toBe(6); // three cavalry
    expect(fixedSetValue([ART, { type: 'artillery', territory: 'congo' }, { type: 'artillery', territory: 'india' }])).toBe(8); // three artillery
    expect(fixedSetValue([INF, CAV, ART])).toBe(10);                  // one of each
    expect(fixedSetValue([INF, inf2, WILD])).toBe(4);                 // two infantry + wild → three infantry
    expect(fixedSetValue([INF, CAV, WILD])).toBe(10);                 // two different + wild → one of each
    // Independent of the global trade count.
    expect(cardSetValue([INF, CAV, ART], 'fixed', 0)).toBe(10);
    expect(cardSetValue([INF, CAV, ART], 'fixed', 9)).toBe(10);
  });

  it('nuclear: follows escalating sequence', () => {
    expect(tradeInValue(0, 'nuclear')).toBe(8);
    expect(tradeInValue(1, 'nuclear')).toBe(10);
    expect(tradeInValue(2, 'nuclear')).toBe(12);
    expect(tradeInValue(3, 'nuclear')).toBe(15);
    expect(tradeInValue(4, 'nuclear')).toBe(20);
    expect(tradeInValue(5, 'nuclear')).toBe(25);
    expect(tradeInValue(6, 'nuclear')).toBe(30);
    expect(tradeInValue(7, 'nuclear')).toBe(35);
  });

  it('progressive (explicit) matches the default behavior', () => {
    expect(tradeInValue(0, 'progressive')).toBe(4);
    expect(tradeInValue(5, 'progressive')).toBe(15);
    expect(tradeInValue(6, 'progressive')).toBe(20);
  });

  it('progressive (omitted) is the default', () => {
    expect(tradeInValue(0)).toBe(4);
  });

  it('applyTradeIn uses config.cardBonus=none → 0 reinforcements from trade', () => {
    const s = baseState('reinforce', [INF, CAV, ART]);
    const withNone: GameState = { ...s, config: { ...DEFAULT_CONFIG, cardBonus: 'none' }, reinforcementsRemaining: 0 };
    const next = applyTradeIn(withNone, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(0);
  });

  it('applyTradeIn uses config.cardBonus=fixed → one-of-each set yields 10 reinforcements', () => {
    const s = baseState('reinforce', [INF, CAV, ART]); // one of each
    const withFixed: GameState = { ...s, config: { ...DEFAULT_CONFIG, cardBonus: 'fixed' }, reinforcementsRemaining: 0 };
    const next = applyTradeIn(withFixed, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(10);
  });

  it('applyTradeIn fixed: three-of-a-kind uses the type value (3 infantry → 4)', () => {
    const inf2: Card = { type: 'infantry', territory: 'ontario' };
    const inf3: Card = { type: 'infantry', territory: 'quebec' };
    const s = baseState('reinforce', [INF, inf2, inf3]);
    const withFixed: GameState = { ...s, config: { ...DEFAULT_CONFIG, cardBonus: 'fixed' }, reinforcementsRemaining: 0 };
    // INF is alaska (owned by P1 in baseState) → +2 territory bonus is placed on alaska, not added
    // to reinforcements. Trade value for three infantry is 4.
    const next = applyTradeIn(withFixed, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(4);
  });

  it('applyTradeIn uses config.cardBonus=nuclear → 8 on first trade', () => {
    const s = baseState('reinforce', [INF, CAV, ART]);
    const withNuclear: GameState = { ...s, config: { ...DEFAULT_CONFIG, cardBonus: 'nuclear' }, reinforcementsRemaining: 0 };
    const next = applyTradeIn(withNuclear, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// createDeck
// ---------------------------------------------------------------------------

describe('createDeck', () => {
  it('produces 44 cards', () => {
    expect(createDeck()).toHaveLength(44);
  });

  it('has exactly 2 wilds', () => {
    expect(createDeck().filter((c) => c.type === 'wild')).toHaveLength(2);
  });

  it('has 14 of each non-wild type', () => {
    const deck = createDeck();
    expect(deck.filter((c) => c.type === 'infantry')).toHaveLength(14);
    expect(deck.filter((c) => c.type === 'cavalry')).toHaveLength(14);
    expect(deck.filter((c) => c.type === 'artillery')).toHaveLength(14);
  });

  it('each territory appears exactly once', () => {
    const territories = createDeck()
      .filter((c) => c.territory !== null)
      .map((c) => c.territory!);
    expect(territories).toHaveLength(42);
    expect(new Set(territories).size).toBe(42);
  });

  it('shuffle with rng produces a different order', () => {
    let call = 0;
    const seqRng = () => (call++ % 2 === 0 ? 0.9 : 0.1);
    const shuffled = createDeck(seqRng);
    const unshuffled = [...UNSHUFFLED_DECK];
    // At least one card must be in a different position
    expect(shuffled.some((c, i) => c !== unshuffled[i])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyTradeIn
// ---------------------------------------------------------------------------

describe('applyTradeIn', () => {
  it('adds tradeInValue armies to reinforcementsRemaining', () => {
    const state = baseState('reinforce', [INF, CAV, ART]); // one-of-each → valid
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(tradeInValue(0)); // 4 on first trade
  });

  it('increments tradeInCount', () => {
    const state = baseState('reinforce', [INF, CAV, ART]);
    expect(applyTradeIn(state, [0, 1, 2]).tradeInCount).toBe(1);
  });

  it('removes the three cards from the player hand', () => {
    const extra: Card = { type: 'infantry', territory: 'ontario' };
    const state = baseState('reinforce', [INF, CAV, ART, extra]);
    const next = applyTradeIn(state, [0, 1, 2]);
    const p1 = next.players.find((p) => p.id === 'P1')!;
    expect(p1.cards).toHaveLength(1);
    expect(p1.cards[0]).toEqual(extra);
  });

  it('moves traded cards to the discard pile', () => {
    const state = baseState('reinforce', [INF, CAV, ART]);
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.discard).toHaveLength(3);
  });

  it('territory-match bonus: +2 armies once, on the first matching owned territory', () => {
    // P1 owns alaska/greenland/brazil but the bonus is capped at +2 total per trade —
    // placed on the first matching card's territory (alaska), not on every match.
    const state = baseState('reinforce', [INF, CAV, ART]);
    const before = state.armies['alaska'] ?? 0;
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.armies['alaska']).toBe(before + 2);
    expect(next.armies['greenland']).toBe(state.armies['greenland'] ?? 0); // no extra bonus
    expect(next.armies['brazil']).toBe(state.armies['brazil'] ?? 0);       // no extra bonus
  });

  it('no territory-match bonus when territory is enemy-owned', () => {
    // P1 does NOT own kamchatka (P2 does in baseState)
    const kamCard: Card = { type: 'cavalry', territory: 'kamchatka' };
    const state = baseState('reinforce', [INF, kamCard, ART]);
    const before = state.armies['kamchatka'] ?? 0;
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.armies['kamchatka']).toBe(before); // no bonus
  });

  it('wilds have no territory and give no bonus', () => {
    const state = baseState('reinforce', [INF, CAV, WILD]);
    // WILD has territory: null, so no bonus armies placed anywhere from it
    const next = applyTradeIn(state, [0, 1, 2]);
    // Verify reinforcementsRemaining increased (base armies added)
    expect(next.reinforcementsRemaining).toBeGreaterThan(0);
  });

  it('rejects duplicate indices', () => {
    const state = baseState('reinforce', [INF, CAV, ART]);
    expect(() => applyTradeIn(state, [0, 0, 1])).toThrow();
  });

  it('rejects out-of-range indices', () => {
    const state = baseState('reinforce', [INF, CAV, ART]);
    expect(() => applyTradeIn(state, [0, 1, 5])).toThrow();
  });

  it('rejects an invalid card set', () => {
    const state = baseState('reinforce', [INF, INF, CAV]); // 2 unique types, no wild → invalid
    expect(() => applyTradeIn(state, [0, 1, 2])).toThrow();
  });

  it('escalation: each trade uses the next value in the sequence', () => {
    let state = baseState('reinforce', [INF, CAV, ART, INF, CAV, ART]);
    // First trade: value 4
    state = { ...applyTradeIn(state, [0, 1, 2]), reinforcementsRemaining: 0 };
    expect(state.tradeInCount).toBe(1);
    // Second trade: value 6
    // After first trade, 3 cards remain. Give them back as fresh ones:
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'P1' ? { ...p, cards: [INF, CAV, ART] } : p,
      ),
    };
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.reinforcementsRemaining).toBe(6);
    expect(next.tradeInCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// drawCardForCurrentPlayer
// ---------------------------------------------------------------------------

describe('drawCardForCurrentPlayer', () => {
  it('draws the top card into the current player hand', () => {
    const topCard: Card = { type: 'infantry', territory: 'alaska' };
    const state = baseState('attack', [], { deck: [topCard] });
    const next = drawCardForCurrentPlayer(state);
    expect(next.players.find((p) => p.id === 'P1')!.cards).toHaveLength(1);
    expect(next.players.find((p) => p.id === 'P1')!.cards[0]).toEqual(topCard);
    expect(next.deck).toHaveLength(0);
  });

  it('recycles discard when deck is empty', () => {
    const discardCard: Card = { type: 'cavalry', territory: 'greenland' };
    const state = baseState('attack', [], { deck: [], discard: [discardCard] });
    const next = drawCardForCurrentPlayer(state);
    expect(next.players.find((p) => p.id === 'P1')!.cards).toHaveLength(1);
    expect(next.discard).toHaveLength(0);
  });

  it('is a no-op when both deck and discard are empty', () => {
    const state = baseState('attack', [], { deck: [], discard: [] });
    const next = drawCardForCurrentPlayer(state);
    expect(next).toBe(state); // same reference — nothing changed
  });
});

// ---------------------------------------------------------------------------
// Force trade at turn start (≥ 5 cards)
// ---------------------------------------------------------------------------

describe('force trade at turn start', () => {
  it('mustTradeCards is false when player has 4 cards', () => {
    const fiveCards = [INF, CAV, ART, INF];
    const state = baseState('fortify', [], {
      // Give P2 the 4 cards so they arrive at their next turn start with 4
      players: createInitialState(['P1', 'P2']).players.map((p) =>
        p.id === 'P2' ? { ...p, cards: fiveCards.slice(0, 4) } : p,
      ),
    });
    const next = reduce(state, { type: 'END_PHASE' });
    expect(next.mustTradeCards).toBe(false);
  });

  it('mustTradeCards is true when player has 5 cards at turn start', () => {
    const fiveCards = [INF, CAV, ART, INF, CAV];
    const state: GameState = {
      ...baseState('fortify'),
      players: createInitialState(['P1', 'P2']).players.map((p) =>
        p.id === 'P2' ? { ...p, cards: fiveCards } : p,
      ),
    };
    const next = reduce(state, { type: 'END_PHASE' });
    expect(next.mustTradeCards).toBe(true);
  });

  it('non-TRADE_IN action blocked while mustTradeCards is true', () => {
    const state: GameState = { ...baseState('reinforce'), mustTradeCards: true };
    expect(() => reduce(state, { type: 'END_PHASE' })).toThrow();
  });

  it('TRADE_IN clears mustTradeCards when hand drops below 5', () => {
    const fiveCards = [INF, CAV, ART, INF, CAV];
    const state: GameState = {
      ...baseState('reinforce', fiveCards),
      mustTradeCards: true,
    };
    // Trade [0,1,2] → 2 cards left → mustTradeCards = false
    const next = applyTradeIn(state, [0, 1, 2]);
    expect(next.mustTradeCards).toBe(false);
  });

  it('TRADE_IN keeps mustTradeCards when hand stays ≥ 5 (had 8 cards)', () => {
    const eightCards = [INF, CAV, ART, INF, CAV, ART, INF, CAV];
    const state: GameState = {
      ...baseState('reinforce', eightCards),
      mustTradeCards: true,
    };
    const next = applyTradeIn(state, [0, 1, 2]); // 5 remain → still forced
    expect(next.mustTradeCards).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Force trade after elimination (≥ 6 cards mid-attack)
// ---------------------------------------------------------------------------

describe('force trade after elimination', () => {
  it('mustTradeCards set when attacker reaches 6+ cards after elimination', () => {
    // P1 (attacker) has 3 cards; P2 has 3 cards → after elimination P1 has 6
    const p1Cards = [INF, CAV, ART];
    const p2Cards = [INF, CAV, ART];
    const p1Terrs = ALL_TERRITORY_IDS.filter((id) => id !== 'alaska') as TerritoryId[];
    const s0 = createInitialState(['P1', 'P2']);
    const owner = { ...s0.owner } as Record<TerritoryId, PlayerId>;
    const armies = { ...s0.armies } as Record<TerritoryId, number>;
    for (const id of p1Terrs) { owner[id] = 'P1'; armies[id] = 3; }
    owner['alaska'] = 'P2'; armies['alaska'] = 1; armies['kamchatka'] = 5;
    const state: GameState = {
      ...s0,
      phase: 'attack',
      owner,
      armies,
      players: s0.players.map((p) =>
        p.id === 'P1' ? { ...p, cards: p1Cards } : { ...p, cards: p2Cards },
      ),
    };
    const next = reduce(state, {
      type: 'ATTACK',
      from: 'kamchatka',
      to: 'alaska',
      attackerRolls: [6, 5, 4],
      defenderRolls: [1],
    });
    expect(next.mustTradeCards).toBe(true);
    expect(next.players.find((p) => p.id === 'P1')!.cards).toHaveLength(6);
  });

  it('TRADE_IN during attack phase clears mustTradeCards when hand drops below 6', () => {
    const sixCards = [INF, CAV, ART, INF, CAV, ART];
    const state: GameState = { ...baseState('attack', sixCards), mustTradeCards: true };
    const next = applyTradeIn(state, [0, 1, 2]); // 3 remain → mustTradeCards = false
    expect(next.mustTradeCards).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Card draw on capture (via END_PHASE from fortify)
// ---------------------------------------------------------------------------

describe('card draw on capture', () => {
  const deckCard: Card = { type: 'infantry', territory: 'alaska' };

  it('player draws 1 card when capturedThisTurn is true', () => {
    const state: GameState = {
      ...baseState('fortify'),
      capturedThisTurn: true,
      deck: [deckCard],
    };
    const next = reduce(state, { type: 'END_PHASE' });
    // After END_PHASE, it's P2's turn. The card was given to P1 (who was current).
    const p1 = next.players.find((p) => p.id === 'P1')!;
    expect(p1.cards).toHaveLength(1);
    expect(p1.cards[0]).toEqual(deckCard);
  });

  it('player draws no card when capturedThisTurn is false', () => {
    const state: GameState = {
      ...baseState('fortify'),
      capturedThisTurn: false,
      deck: [deckCard],
    };
    const next = reduce(state, { type: 'END_PHASE' });
    const p1 = next.players.find((p) => p.id === 'P1')!;
    expect(p1.cards).toHaveLength(0);
    expect(next.deck).toHaveLength(1); // card untouched
  });
});
