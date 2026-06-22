import { ALL_TERRITORY_IDS, type TerritoryId } from './map';
import type { Rng } from './dice';
import type { CardBonusMode } from './modes';
import { type Card, type CardType, type GameState, IllegalActionError } from './state';
import { currentPlayerId } from './rules';

// --- Deck data (one territory card per territory + 2 wilds, cycling infantry/cavalry/artillery) ---

const TYPE_CYCLE: readonly CardType[] = ['infantry', 'cavalry', 'artillery'];

/** Build the unshuffled territory deck for a given territory set (+2 wilds). */
export function buildDeck(territoryIds: readonly TerritoryId[]): Card[] {
  return [
    ...territoryIds.map((id, i) => ({ type: TYPE_CYCLE[i % 3]!, territory: id })),
    { type: 'wild' as const, territory: null },
    { type: 'wild' as const, territory: null },
  ];
}

/** Classic-board deck, kept as a stable export for existing callers and tests. */
export const UNSHUFFLED_DECK: readonly Card[] = buildDeck(ALL_TERRITORY_IDS);

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Create a draw pile for the given territory set (defaults to the classic board). */
export function createDeck(rng?: Rng, territoryIds: readonly TerritoryId[] = ALL_TERRITORY_IDS): Card[] {
  const deck = buildDeck(territoryIds);
  return rng ? shuffle(deck, rng) : deck;
}

// --- Set detection ---

/**
 * Valid sets:
 *   1. Three of the same non-wild type
 *   2. One of each non-wild type (infantry + cavalry + artillery)
 *   3. Any two non-wild cards + exactly one wild
 */
export function isValidSet(cards: readonly [Card, Card, Card]): boolean {
  const wilds = cards.filter((c) => c.type === 'wild').length;
  if (wilds >= 2) return false; // 2+ wilds is not a recognized set
  if (wilds === 1) return true; // any two non-wilds + 1 wild is always valid

  // No wilds: three-of-a-kind (1 unique type) or one-of-each (3 unique types)
  const types = new Set(cards.map((c) => c.type));
  return types.size === 1 || types.size === 3;
}

// --- Trade-in value ---
//
// Two common card bonus modes:
//   • Progressive — escalating per global trade-in: 4,6,8,10,12,15, then +5 each (20,25,30…).
//   • Fixed — value depends on the SET COMPOSITION, never escalates: all-infantry 4, all-cavalry 6,
//     all-artillery 8, one-of-each 10 (max). A wild completes the best set.
// (Plus our extra options: None = 0, Nuclear = a steeper escalation.)

const TRADE_SEQUENCE = [4, 6, 8, 10, 12, 15] as const;
const NUCLEAR_SEQUENCE = [8, 10, 12, 15, 20, 25] as const;

/** Composition-based ("Fixed" mode) value for a set; independent of how many sets were traded. */
const FIXED_TYPE_VALUE: Record<'infantry' | 'cavalry' | 'artillery', number> = {
  infantry: 4,
  cavalry: 6,
  artillery: 8,
};

export function fixedSetValue(cards: readonly [Card, Card, Card]): number {
  const nonWild = cards
    .map((c) => c.type)
    .filter((t): t is 'infantry' | 'cavalry' | 'artillery' => t !== 'wild');
  const distinct = new Set(nonWild);
  // Three of a kind (incl. two-same + wild): value by type. Otherwise it's one-of-each (incl.
  // two-different + wild, where the wild completes the trio): the top value of 10.
  return distinct.size === 1 ? FIXED_TYPE_VALUE[nonWild[0]!] : 10;
}

/** Escalation-based value (Progressive / Nuclear); 0 for None. Fixed returns its max (10) as a
 *  count-agnostic fallback — callers with the actual cards should use cardSetValue instead. */
export function tradeInValue(tradeInCount: number, mode: CardBonusMode = 'progressive'): number {
  switch (mode) {
    case 'none': return 0;
    case 'fixed': return 10;
    case 'nuclear':
      if (tradeInCount < NUCLEAR_SEQUENCE.length) return NUCLEAR_SEQUENCE[tradeInCount]!;
      return 25 + (tradeInCount - 5) * 5;
    default: // 'progressive'
      if (tradeInCount < TRADE_SEQUENCE.length) return TRADE_SEQUENCE[tradeInCount]!;
      return 15 + (tradeInCount - 5) * 5;
  }
}

/** Armies for trading a specific set, honouring the card-bonus mode. Fixed is composition-based
 *  (needs the cards); escalation modes only need the global trade count. */
export function cardSetValue(
  cards: readonly [Card, Card, Card],
  mode: CardBonusMode,
  tradeInCount: number,
): number {
  return mode === 'fixed' ? fixedSetValue(cards) : tradeInValue(tradeInCount, mode);
}

// --- Apply trade-in (pure; called from reducer) ---

export function applyTradeIn(
  state: GameState,
  cardIndices: readonly [number, number, number],
): GameState {
  const pid = currentPlayerId(state);
  const playerIdx = state.players.findIndex((p) => p.id === pid);
  if (playerIdx < 0) throw new Error('current player not found');
  const player = state.players[playerIdx]!;

  const [i0, i1, i2] = cardIndices;

  if (new Set([i0, i1, i2]).size !== 3)
    throw new IllegalActionError('card indices must be distinct');
  if ([i0, i1, i2].some((i) => i < 0 || i >= player.cards.length))
    throw new IllegalActionError('card index out of range');

  const tradedCards: [Card, Card, Card] = [
    player.cards[i0]!,
    player.cards[i1]!,
    player.cards[i2]!,
  ];

  if (!isValidSet(tradedCards))
    throw new IllegalActionError('the three cards do not form a valid set');

  const baseArmies = cardSetValue(tradedCards, state.config.cardBonus, state.tradeInCount);

  // Remove cards from hand (splice descending to keep indices stable)
  const sortedDesc = [...cardIndices].sort((a, b) => b - a);
  const newCards = [...player.cards];
  for (const idx of sortedDesc) newCards.splice(idx, 1);

  // Territory-match bonus: +2 armies, ONCE per trade (capped at 2 even if
  // several traded cards match), placed on the first matching territory the player owns.
  const newArmies = { ...state.armies } as Record<string, number>;
  const matchCard = tradedCards.find(
    (card) => card.territory !== null && state.owner[card.territory] === pid,
  );
  if (matchCard && matchCard.territory !== null) {
    newArmies[matchCard.territory] = (newArmies[matchCard.territory] ?? 0) + 2;
  }

  const newPlayers = state.players.map((p, i) =>
    i === playerIdx ? { ...p, cards: newCards } : p,
  );

  // Re-evaluate forced-trade flag based on which phase triggered it
  const mustTradeCards =
    state.phase === 'reinforce' ? newCards.length >= 5 : newCards.length >= 6;

  return {
    ...state,
    players: newPlayers,
    armies: newArmies as typeof state.armies,
    reinforcementsRemaining: state.reinforcementsRemaining + baseArmies,
    tradeInCount: state.tradeInCount + 1,
    discard: [...state.discard, ...tradedCards],
    mustTradeCards,
  };
}

// --- Draw a card for the current player at end of turn ---

export function drawCardForCurrentPlayer(state: GameState): GameState {
  const pid = currentPlayerId(state);
  const playerIdx = state.players.findIndex((p) => p.id === pid);
  if (playerIdx < 0) throw new Error('current player not found');

  // When the draw pile runs out, recycle the discard (no shuffle — keeps reducer pure)
  let deck = state.deck;
  let discard = state.discard;
  if (deck.length === 0) {
    if (discard.length === 0) return state;
    deck = [...discard];
    discard = [];
  }

  const [drawn, ...remaining] = deck;
  if (drawn === undefined) return state;

  const newPlayers = state.players.map((p, i) =>
    i === playerIdx ? { ...p, cards: [...p.cards, drawn] } : p,
  );

  return { ...state, deck: remaining, discard, players: newPlayers };
}
