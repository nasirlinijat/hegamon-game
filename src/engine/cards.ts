import { ALL_TERRITORY_IDS } from './map';
import type { Rng } from './dice';
import { type Card, type CardType, type GameState, IllegalActionError } from './state';
import { currentPlayerId } from './rules';

// --- Deck data (44 cards: 14 infantry + 14 cavalry + 14 artillery + 2 wilds) ---

const TYPE_CYCLE: readonly CardType[] = ['infantry', 'cavalry', 'artillery'];

export const UNSHUFFLED_DECK: readonly Card[] = [
  ...ALL_TERRITORY_IDS.map((id, i) => ({
    type: TYPE_CYCLE[i % 3]!,
    territory: id,
  })),
  { type: 'wild', territory: null },
  { type: 'wild', territory: null },
];

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function createDeck(rng?: Rng): Card[] {
  return rng ? shuffle(UNSHUFFLED_DECK, rng) : [...UNSHUFFLED_DECK];
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

// --- Trade-in value (global escalation counter) ---

const TRADE_SEQUENCE = [4, 6, 8, 10, 12, 15] as const;

export function tradeInValue(tradeInCount: number): number {
  if (tradeInCount < TRADE_SEQUENCE.length) return TRADE_SEQUENCE[tradeInCount]!;
  return 15 + (tradeInCount - 5) * 5;
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

  const baseArmies = tradeInValue(state.tradeInCount);

  // Remove cards from hand (splice descending to keep indices stable)
  const sortedDesc = [...cardIndices].sort((a, b) => b - a);
  const newCards = [...player.cards];
  for (const idx of sortedDesc) newCards.splice(idx, 1);

  // Territory-match bonus: +2 armies placed directly on each matching territory
  const newArmies = { ...state.armies } as Record<string, number>;
  for (const card of tradedCards) {
    if (card.territory !== null && state.owner[card.territory] === pid) {
      newArmies[card.territory] = (newArmies[card.territory] ?? 0) + 2;
    }
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
