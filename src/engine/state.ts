import { type TerritoryId, ALL_TERRITORY_IDS, CONTINENTS } from './map';

export type PlayerId = string;
export type Phase = 'reinforce' | 'attack' | 'fortify';

// Card types for Phase 5 — defined here so GameState.cards is final-shaped now.
export type CardType = 'infantry' | 'cavalry' | 'artillery' | 'wild';
export interface Card {
  readonly type: CardType;
  readonly territory: TerritoryId | null; // null for wilds
}

export interface Player {
  readonly id: PlayerId;
  readonly color: string;
  readonly cards: readonly Card[];
  readonly alive: boolean;
}

export interface GameState {
  readonly players: readonly Player[];
  /** Index into players[] for the current turn. */
  readonly turnPointer: number;
  readonly phase: Phase;
  readonly owner: Readonly<Record<TerritoryId, PlayerId>>;
  readonly armies: Readonly<Record<TerritoryId, number>>;
  /** Armies still to be placed this reinforce phase. */
  readonly reinforcementsRemaining: number;
  /** True if the current player captured at least one territory this turn. */
  readonly capturedThisTurn: boolean;
  /** True if the current player has already used their one fortify move. */
  readonly fortifiedThisTurn: boolean;
  /** Escalating trade-in counter (shared/global). */
  readonly tradeInCount: number;
  /** Non-null when the game is over. No further actions are allowed. */
  readonly winner: PlayerId | null;
  /** Cards available to draw (top = index 0). */
  readonly deck: readonly Card[];
  /** Cards returned after a set is traded in. Recycled into deck when draw pile empties. */
  readonly discard: readonly Card[];
  /** True when the current player must trade a set before any other action. */
  readonly mustTradeCards: boolean;
}

// --- Shared validation result type (used by all validate* in rules.ts) ---

export type ValidationResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export class IllegalActionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IllegalActionError';
  }
}

// --- State helpers ---

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.turnPointer];
  if (p === undefined) throw new Error('Invalid turnPointer');
  return p;
}

export function territoriesOf(state: GameState, playerId: PlayerId): TerritoryId[] {
  return ALL_TERRITORY_IDS.filter((id) => state.owner[id] === playerId);
}

// --- Test / setup helper ---

export interface InitOptions {
  /** Starting armies per territory (default: 3). */
  armiesPerTerritory?: number;
  /** Pre-built (optionally shuffled) draw pile. If omitted, deck starts empty. */
  deck?: readonly Card[];
}

/**
 * Creates a GameState for testing. Distributes territories as evenly as possible
 * round-robin across players. Players are given arbitrary colors.
 */
export function createInitialState(playerIds: PlayerId[], opts: InitOptions = {}): GameState {
  if (playerIds.length < 2) throw new Error('Need at least 2 players');
  const armiesPerTerritory = opts.armiesPerTerritory ?? 3;

  const owner = {} as Record<TerritoryId, PlayerId>;
  const armies = {} as Record<TerritoryId, number>;

  ALL_TERRITORY_IDS.forEach((id, i) => {
    const pid = playerIds[i % playerIds.length];
    if (pid === undefined) throw new Error('playerIds cannot be empty');
    owner[id] = pid;
    armies[id] = armiesPerTerritory;
  });

  const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  const players: Player[] = playerIds.map((id, i) => ({
    id,
    color: COLORS[i % COLORS.length] ?? 'gray',
    cards: [],
    alive: true,
  }));

  // Compute reinforcements for the first player.
  const firstId = playerIds[0];
  if (firstId === undefined) throw new Error('playerIds cannot be empty');
  const firstTerritories = ALL_TERRITORY_IDS.filter((id) => owner[id] === firstId);
  const base = Math.max(3, Math.floor(firstTerritories.length / 3));
  const continentBonus = Object.values(CONTINENTS).reduce((sum, c) => {
    const owns = c.territories.every((t) => owner[t] === firstId);
    return sum + (owns ? c.bonus : 0);
  }, 0);

  return {
    players,
    turnPointer: 0,
    phase: 'reinforce',
    owner,
    armies,
    reinforcementsRemaining: base + continentBonus,
    capturedThisTurn: false,
    fortifiedThisTurn: false,
    tradeInCount: 0,
    winner: null,
    deck: opts.deck ?? [],
    discard: [],
    mustTradeCards: false,
  };
}
