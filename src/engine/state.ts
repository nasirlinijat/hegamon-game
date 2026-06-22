import { type TerritoryId, type GameMap, areAdjacent } from './map';
import { getMap } from './map-registry';
import { type GameConfig, DEFAULT_CONFIG, type MissionId, ALL_MISSION_IDS } from './modes';
import type { Rng } from './dice';

export type PlayerId = string;
export type Phase = 'setup' | 'reinforce' | 'attack' | 'fortify';

/** Pseudo-player ID used in 2-Player Neutral mode. Never takes a turn; owns neutral territories. */
export const NEUTRAL_ID: PlayerId = 'Neutral';

/** Pseudo-player ID used in Zombies mode. Spreads each round; never takes a real turn. */
export const ZOMBIE_ID: PlayerId = 'Zombies';

/** Starting armies per player count (2-player uses 40 each, no neutral). */
export const STARTING_ARMIES: Record<number, number> = {
  2: 40,
  3: 35,
  4: 30,
  5: 25,
  6: 20,
};

/**
 * Starting armies per player scaled to the map's territory count.
 * Classic board (42 territories) uses the base values above; larger maps scale up
 * so players always have armies left to place after the 1-per-territory initial deal.
 */
export function startingArmiesForMap(numPlayers: number, totalTerritories: number): number {
  const base = STARTING_ARMIES[numPlayers];
  if (base === undefined) throw new Error(`No starting-army count for ${numPlayers} players`);
  if (totalTerritories <= 42) return base;
  return Math.ceil(base * totalTerritories / 42);
}

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
  /** The board being played. Resolved from config.mapId at creation; drives all territory logic. */
  readonly map: GameMap;
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
  /**
   * During the `setup` phase, how many armies each player still has to place.
   * Empty `{}` for games created without the setup phase.
   */
  readonly setupRemaining: Readonly<Record<PlayerId, number>>;
  /** Game mode + settings chosen on the setup screen. */
  readonly config: GameConfig;
  /** Capital territory per player — populated only when config.mode === 'capitals'. */
  readonly capitals?: Readonly<Record<PlayerId, TerritoryId>>;
  /** Full rounds elapsed — incremented each time turnPointer wraps to 0 (turn-limit mode). */
  readonly roundsElapsed?: number;
  /** Secret mission per player — populated only when config.mode === 'missions'. */
  readonly missions?: Readonly<Record<PlayerId, MissionId>>;
  /** Portal pairs — populated only when config.mode === 'portals'. Each pair is an extra
   *  non-geographic adjacency usable for attack and fortify. */
  readonly portals?: ReadonlyArray<readonly [TerritoryId, TerritoryId]>;
  /** Territories that cannot be attacked or traversed this round (Blizzards mode). */
  readonly frozenTerritories?: Readonly<Record<TerritoryId, true>>;
  /** Pre-generated freeze schedule: one entry per round, each listing 1–3 frozen territory IDs. */
  readonly blizzardSchedule?: ReadonlyArray<ReadonlyArray<TerritoryId>>;
  /** Assassin mode: maps each player to the player they must eliminate to win. */
  readonly assassinTargets?: Readonly<Record<PlayerId, PlayerId>>;
  /** Teams setting: maps each player to their team name ('A' or 'B'). */
  readonly teamAssignments?: Readonly<Record<PlayerId, string>>;
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
  return state.map.allTerritoryIds.filter((id) => state.owner[id] === playerId);
}

// --- Test / setup helper ---

export interface InitOptions {
  /** Starting armies per territory (default: 3). Ignored when `setup` is true (always 1). */
  armiesPerTerritory?: number;
  /** Pre-built (optionally shuffled) draw pile. If omitted, deck starts empty. */
  deck?: readonly Card[];
  /**
   * When true, deal 1 army per territory and enter the `setup` phase with each player
   * holding STARTING_ARMIES[N] − (territories dealt) armies to place. When false/omitted,
   * the legacy behavior is used: a flat `armiesPerTerritory` and an immediate reinforce phase.
   */
  setup?: boolean;
  /** Game mode + settings. Defaults to DEFAULT_CONFIG (World Domination, progressive cards). */
  config?: GameConfig;
  /** Injectable RNG used for randomised setup (e.g., mission deal). Defaults to Math.random. */
  rng?: Rng;
}

function shuffleArray<T>(arr: readonly T[], rng: Rng): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Creates a GameState for testing. Distributes territories as evenly as possible
 * round-robin across players. Players are given arbitrary colors.
 */
export function createInitialState(playerIds: PlayerId[], opts: InitOptions = {}): GameState {
  if (playerIds.length < 2) throw new Error('Need at least 2 players');
  const setup = opts.setup === true;
  const armiesPerTerritory = setup ? 1 : (opts.armiesPerTerritory ?? 3);

  const config = opts.config ?? DEFAULT_CONFIG;
  const rng: Rng = opts.rng ?? (() => Math.random());
  const map = getMap(config.mapId);
  const allIds = map.allTerritoryIds;

  // Two-player neutral / zombies: inject a pseudo-player for territory distribution only.
  // Real player army counts still use the unmodified STARTING_ARMIES for playerIds.length.
  const allPlayerIds =
    config.mode === 'twoplayer' ? [...playerIds, NEUTRAL_ID] :
    config.mode === 'zombies'   ? [...playerIds, ZOMBIE_ID]  :
    playerIds;

  const owner = {} as Record<TerritoryId, PlayerId>;
  const armies = {} as Record<TerritoryId, number>;
  const dealtCount: Record<PlayerId, number> = {};

  // Real games (setup) shuffle the deal so each match's map differs and no player is handed a
  // fixed map-spanning checkerboard. The legacy test path keeps the deterministic round-robin
  // so existing fixtures stay stable. Round-robin over the (shuffled) order keeps counts even.
  const dealOrder = setup ? shuffleArray(allIds, rng) : allIds;
  dealOrder.forEach((id, i) => {
    const pid = allPlayerIds[i % allPlayerIds.length];
    if (pid === undefined) throw new Error('playerIds cannot be empty');
    owner[id] = pid;
    armies[id] = armiesPerTerritory;
    dealtCount[pid] = (dealtCount[pid] ?? 0) + 1;
  });

  const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
  const players: Player[] = allPlayerIds.map((id, i) => ({
    id,
    color: id === NEUTRAL_ID ? '#4a5568' :
           id === ZOMBIE_ID  ? '#4a7a40' :
           (COLORS[i % COLORS.length] ?? 'gray'),
    cards: [],
    alive: true,
  }));

  const firstId = playerIds[0];
  if (firstId === undefined) throw new Error('playerIds cannot be empty');

  // Capital Conquest: auto-assign each player's first owned territory as their capital.
  const capitals: Record<PlayerId, TerritoryId> | undefined = config.mode === 'capitals'
    ? Object.fromEntries(
        playerIds.map((pid) => [pid, allIds.find((id) => owner[id] === pid)!]),
      ) as Record<PlayerId, TerritoryId>
    : undefined;

  // Secret Missions: deal one unique mission to each player (shuffled, RNG-injected).
  const missions: Record<PlayerId, MissionId> | undefined = config.mode === 'missions'
    ? Object.fromEntries(
        shuffleArray(ALL_MISSION_IDS, rng)
          .slice(0, playerIds.length)
          .map((mid, i) => [playerIds[i]!, mid]),
      ) as Record<PlayerId, MissionId>
    : undefined;

  // Portals: pick 3 random non-adjacent territory pairs as extra adjacency links.
  const portals: ReadonlyArray<readonly [TerritoryId, TerritoryId]> | undefined =
    config.mode === 'portals'
      ? (() => {
          const nonAdj: Array<readonly [TerritoryId, TerritoryId]> = [];
          for (let i = 0; i < allIds.length; i++) {
            for (let j = i + 1; j < allIds.length; j++) {
              const a = allIds[i]!;
              const b = allIds[j]!;
              if (!areAdjacent(a, b, undefined, map)) nonAdj.push([a, b] as const);
            }
          }
          return shuffleArray(nonAdj, rng).slice(0, 3) as ReadonlyArray<readonly [TerritoryId, TerritoryId]>;
        })()
      : undefined;

  // Blizzards: pre-generate frozen-territory schedules for 30 rounds (1–3 tiles per round).
  const blizzardSchedule: ReadonlyArray<ReadonlyArray<TerritoryId>> | undefined =
    config.mode === 'blizzards'
      ? Array.from({ length: 30 }, () => {
          const n = Math.floor(rng() * 3) + 1;
          return shuffleArray(allIds, rng).slice(0, n) as TerritoryId[];
        })
      : undefined;
  const frozenTerritories: Readonly<Record<TerritoryId, true>> | undefined = blizzardSchedule
    ? (Object.fromEntries(
        (blizzardSchedule[0] ?? []).map((t) => [t, true as const]),
      ) as Readonly<Record<TerritoryId, true>>)
    : undefined;

  // Teams: assign players to alternating teams (even-index → A, odd-index → B).
  const teamAssignments: Readonly<Record<PlayerId, string>> | undefined =
    config.teams !== 'off'
      ? (Object.fromEntries(playerIds.map((pid, i) => [pid, i % 2 === 0 ? 'A' : 'B'])) as Readonly<Record<PlayerId, string>>)
      : undefined;

  // Assassin: assign each real player a secret target in a random circular chain (A→B→C→A).
  const assassinTargets: Readonly<Record<PlayerId, PlayerId>> | undefined =
    config.mode === 'assassin'
      ? (() => {
          const shuffled = shuffleArray(playerIds, rng);
          return Object.fromEntries(
            shuffled.map((pid, i) => [pid, shuffled[(i + 1) % shuffled.length]!]),
          ) as Readonly<Record<PlayerId, PlayerId>>;
        })()
      : undefined;

  const common = {
    players,
    map,
    turnPointer: 0,
    owner,
    armies,
    capturedThisTurn: false,
    fortifiedThisTurn: false,
    tradeInCount: 0,
    winner: null as PlayerId | null,
    deck: opts.deck ?? [],
    discard: [] as readonly Card[],
    mustTradeCards: false,
    config,
    roundsElapsed: 0,
    ...(capitals          ? { capitals }          : {}),
    ...(missions          ? { missions }          : {}),
    ...(portals           ? { portals }           : {}),
    ...(blizzardSchedule  ? { blizzardSchedule }  : {}),
    ...(frozenTerritories ? { frozenTerritories } : {}),
    ...(assassinTargets   ? { assassinTargets }   : {}),
    ...(teamAssignments   ? { teamAssignments }   : {}),
  };

  // Compute the first player's opening reinforcement pool (territories/3 + continent bonuses).
  const firstReinforcements = (): number => {
    const firstTerritories = allIds.filter((id) => owner[id] === firstId);
    const base = Math.max(3, Math.floor(firstTerritories.length / 3));
    const continentBonus = Object.values(map.continents).reduce((sum, c) => {
      const owns = c.territories.every((t) => owner[t] === firstId);
      return sum + (owns ? c.bonus : 0);
    }, 0);
    return base + continentBonus;
  };

  // --- Setup mode: how the starting armies are deployed ---
  if (setup) {
    const starting = startingArmiesForMap(playerIds.length, allIds.length);

    // Auto-deploy: scatter each player's starting pool RANDOMLY across their territories (each holds
    // 1 from the deal). Extra armies land on random territories so some stay thin while others stack
    // up — capped per territory so no single province hoards the whole pool. Then begin normal play.
    if (config.setupMode === 'auto') {
      const MAX_PER_TERRITORY = 8; // ceiling on a single auto-deployed stack (incl. the base army)
      for (const pid of allPlayerIds) {
        if (pid === NEUTRAL_ID || pid === ZOMBIE_ID) continue;
        const owned = allIds.filter((id) => owner[id] === pid);
        if (owned.length === 0) continue;
        let extra = starting - owned.length; // armies still to scatter (1 already on each territory)
        // Random scatter, respecting the per-territory cap.
        let guard = 0;
        while (extra > 0 && guard++ < extra * 200) {
          const t = owned[Math.floor(rng() * owned.length)]!;
          if ((armies[t] ?? 0) >= MAX_PER_TERRITORY) continue;
          armies[t] = (armies[t] ?? 0) + 1;
          extra--;
        }
        // Fallback (cap saturated): dump any remainder round-robin so the full pool is always placed.
        let i = 0;
        while (extra > 0) { const t = owned[i % owned.length]!; armies[t] = (armies[t] ?? 0) + 1; extra--; i++; }
      }
      return {
        ...common,
        phase: 'reinforce',
        reinforcementsRemaining: firstReinforcements(),
        setupRemaining: {},
      };
    }

    // Manual deploy (default): players place their starting pool one territory at a time.
    const setupRemaining: Record<PlayerId, number> = {};
    for (const pid of allPlayerIds) {
      // Pseudo-players (Neutral, Zombies) place no armies; 0 remaining skips them automatically.
      setupRemaining[pid] = (pid === NEUTRAL_ID || pid === ZOMBIE_ID) ? 0 : starting - (dealtCount[pid] ?? 0);
    }
    return {
      ...common,
      phase: 'setup',
      reinforcementsRemaining: 0,
      setupRemaining,
    };
  }

  // --- Legacy mode: jump straight into the first player's reinforce phase ---
  return {
    ...common,
    phase: 'reinforce',
    reinforcementsRemaining: firstReinforcements(),
    setupRemaining: {},
  };
}
