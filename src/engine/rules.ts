import { ALL_TERRITORY_IDS, ADJACENCY, CONTINENTS, areAdjacent, type TerritoryId, type ContinentId } from './map';
import {
  type GameState,
  type PlayerId,
  type ValidationResult,
  IllegalActionError,
  territoriesOf,
} from './state';
import type { Action } from './actions';

// --- Exported helper used by actions.ts reducer ---

export function currentPlayerId(state: GameState): PlayerId {
  const p = state.players[state.turnPointer];
  if (!p) throw new Error('Invalid turnPointer');
  return p.id;
}

// --- Reinforcement ---

export function ownsContinent(state: GameState, playerId: PlayerId, continentId: ContinentId): boolean {
  return CONTINENTS[continentId].territories.every((t) => state.owner[t] === playerId);
}

export function calcReinforcements(state: GameState, playerId: PlayerId): number {
  const count = territoriesOf(state, playerId).length;
  const base = Math.max(3, Math.floor(count / 3));
  const bonus = (Object.keys(CONTINENTS) as ContinentId[]).reduce(
    (sum, cid) => sum + (ownsContinent(state, playerId, cid) ? CONTINENTS[cid].bonus : 0),
    0,
  );
  return base + bonus;
}

export function validateReinforce(
  state: GameState,
  playerId: PlayerId,
  territory: TerritoryId,
  count: number,
): ValidationResult {
  if (count < 1) return { ok: false, reason: 'count must be at least 1' };
  if (state.owner[territory] !== playerId)
    return { ok: false, reason: `${territory} is not owned by ${playerId}` };
  if (count > state.reinforcementsRemaining)
    return { ok: false, reason: `count ${count} exceeds reinforcementsRemaining ${state.reinforcementsRemaining}` };
  return { ok: true };
}

// --- Dice helpers ---

export function attackDiceCount(attackingArmies: number): number {
  return Math.min(3, attackingArmies - 1);
}

export function defenseDiceCount(defendingArmies: number): number {
  return Math.min(2, defendingArmies);
}

// --- Combat ---

export interface CombatResult {
  readonly attackerLosses: number;
  readonly defenderLosses: number;
}

/**
 * Pure combat resolution. Sorts both arrays descending internally.
 * Defender wins ties.
 */
export function resolveCombat(
  attackerRolls: readonly number[],
  defenderRolls: readonly number[],
): CombatResult {
  const att = [...attackerRolls].sort((a, b) => b - a);
  const def = [...defenderRolls].sort((a, b) => b - a);
  const pairs = Math.min(att.length, def.length);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < pairs; i++) {
    // Defender wins ties.
    if ((att[i] ?? 0) > (def[i] ?? 0)) {
      defenderLosses++;
    } else {
      attackerLosses++;
    }
  }
  return { attackerLosses, defenderLosses };
}

// --- Attack ---

export function validateAttack(state: GameState, from: TerritoryId, to: TerritoryId): ValidationResult {
  const pid = currentPlayerId(state);
  if (state.owner[from] !== pid) return { ok: false, reason: `${from} is not owned by the current player` };
  if (state.owner[to] === pid) return { ok: false, reason: `${to} is friendly-owned` };
  if (!areAdjacent(from, to)) return { ok: false, reason: `${from} and ${to} are not adjacent` };
  if ((state.armies[from] ?? 0) < 2)
    return { ok: false, reason: `${from} needs at least 2 armies to attack` };
  return { ok: true };
}

export function applyAttack(
  state: GameState,
  action: Extract<Action, { type: 'ATTACK' }>,
): GameState {
  const v = validateAttack(state, action.from, action.to);
  if (!v.ok) throw new IllegalActionError(v.reason);

  const { attackerLosses, defenderLosses } = resolveCombat(action.attackerRolls, action.defenderRolls);

  const fromArmies = (state.armies[action.from] ?? 0) - attackerLosses;
  const toArmies = (state.armies[action.to] ?? 0) - defenderLosses;

  // Non-capturing exchange: defender survives.
  if (toArmies > 0) {
    return {
      ...state,
      armies: {
        ...state.armies,
        [action.from]: fromArmies,
        [action.to]: toArmies,
      },
    };
  }

  // Capture: defender reduced to 0.
  const diceRolled = action.attackerRolls.length;
  const minMove = Math.max(1, diceRolled);
  const effectiveMove = action.moveOnCapture ?? minMove;

  if (effectiveMove < minMove) {
    throw new IllegalActionError(
      `moveOnCapture ${effectiveMove} is below minimum ${minMove} (must move at least as many armies as attack dice rolled)`,
    );
  }
  if (effectiveMove > fromArmies - 1) {
    throw new IllegalActionError(
      `moveOnCapture ${effectiveMove} would leave fewer than 1 army behind (fromArmies after losses: ${fromArmies})`,
    );
  }

  const pid = currentPlayerId(state);
  const prevOwner = state.owner[action.to]!;
  const newOwner = { ...state.owner, [action.to]: pid };
  const newArmies = {
    ...state.armies,
    [action.from]: fromArmies - effectiveMove,
    [action.to]: effectiveMove,
  };

  // Elimination: if prev owner now has 0 territories, mark them dead + transfer cards.
  let newPlayers = state.players;
  const prevOwnerRemaining = ALL_TERRITORY_IDS.filter((id) => newOwner[id] === prevOwner);
  if (prevOwnerRemaining.length === 0) {
    const eliminatedIdx = state.players.findIndex((p) => p.id === prevOwner);
    const attackerIdx = state.players.findIndex((p) => p.id === pid);
    if (eliminatedIdx >= 0 && attackerIdx >= 0) {
      const loserCards = state.players[eliminatedIdx]!.cards;
      newPlayers = state.players.map((p, i) => {
        if (i === eliminatedIdx) return { ...p, alive: false, cards: [] as readonly (typeof p.cards)[number][] };
        if (i === attackerIdx) return { ...p, cards: [...p.cards, ...loserCards] };
        return p;
      });
    }
  }

  const winner = ALL_TERRITORY_IDS.every((id) => newOwner[id] === pid) ? pid : null;

  return {
    ...state,
    owner: newOwner,
    armies: newArmies,
    players: newPlayers,
    capturedThisTurn: true,
    winner,
  };
}

// --- Fortify ---

export function connectedThroughOwned(
  state: GameState,
  playerId: PlayerId,
  from: TerritoryId,
  to: TerritoryId,
): boolean {
  // BFS over territories owned by playerId.
  const visited = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of ADJACENCY[current]) {
      if (neighbor === to) return true;
      if (!visited.has(neighbor) && state.owner[neighbor] === playerId) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

export function validateFortify(
  state: GameState,
  from: TerritoryId,
  to: TerritoryId,
  count: number,
): ValidationResult {
  const pid = currentPlayerId(state);
  if (state.owner[from] !== pid) return { ok: false, reason: `${from} is not owned by ${pid}` };
  if (state.owner[to] !== pid) return { ok: false, reason: `${to} is not owned by ${pid}` };
  if (count < 1) return { ok: false, reason: 'count must be at least 1' };
  if (count > (state.armies[from] ?? 0) - 1)
    return { ok: false, reason: `cannot move ${count} armies from ${from} — must leave at least 1 behind` };
  if (!connectedThroughOwned(state, pid, from, to))
    return { ok: false, reason: `${from} and ${to} are not connected through owned territories` };
  return { ok: true };
}

// --- Win check ---

export function checkWin(state: GameState): PlayerId | null {
  const first = state.owner[ALL_TERRITORY_IDS[0]!];
  if (!first) return null;
  return ALL_TERRITORY_IDS.every((id) => state.owner[id] === first) ? first : null;
}

// --- Turn advancement (called by END_PHASE in actions.ts when leaving fortify) ---

/** Returns the index of the next alive player after state.turnPointer (wraps around). */
export function nextAlivePointer(state: GameState): number {
  const n = state.players.length;
  for (let i = 1; i < n; i++) {
    const ptr = (state.turnPointer + i) % n;
    if (state.players[ptr]?.alive) return ptr;
  }
  // Should never be reached: checkWin fires before the last opponent is eliminated.
  throw new Error('nextAlivePointer: no alive players remaining');
}

export function startTurn(state: GameState, playerId: PlayerId, turnPointer: number): GameState {
  const reinforcements = calcReinforcements(state, playerId);
  return {
    ...state,
    turnPointer,
    phase: 'reinforce',
    reinforcementsRemaining: reinforcements,
    capturedThisTurn: false,
    fortifiedThisTurn: false,
  };
}
