import { areAdjacent, neighborsWith, type TerritoryId, type ContinentId } from './map';
import { type MissionId, type DiceMode } from './modes';
import {
  type GameState,
  type PlayerId,
  type ValidationResult,
  IllegalActionError,
  territoriesOf,
  NEUTRAL_ID,
  ZOMBIE_ID,
} from './state';
import type { Action } from './actions';
import { type Rng, rollDiceForMode } from './dice';

// --- Exported helper used by actions.ts reducer ---

export function currentPlayerId(state: GameState): PlayerId {
  const p = state.players[state.turnPointer];
  if (!p) throw new Error('Invalid turnPointer');
  return p.id;
}

// --- Reinforcement ---

export function ownsContinent(state: GameState, playerId: PlayerId, continentId: ContinentId): boolean {
  const continent = state.map.continents[continentId];
  if (!continent) return false;
  return continent.territories.every((t) => state.owner[t] === playerId);
}

export function calcReinforcements(state: GameState, playerId: PlayerId): number {
  if (playerId === NEUTRAL_ID || playerId === ZOMBIE_ID) return 0;
  const count = territoriesOf(state, playerId).length;
  const base = Math.max(3, Math.floor(count / 3));
  const bonus = Object.values(state.map.continents).reduce(
    (sum, c) => sum + (ownsContinent(state, playerId, c.id) ? c.bonus : 0),
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

// --- Setup placement ---

/**
 * Place `count` armies on an owned territory during the `setup` phase, decrement the
 * current player's setup pool, and pass to the next player who still has armies to place.
 * When everyone has placed all their armies, transition into the first player's turn.
 */
export function applySetupPlacement(
  state: GameState,
  territory: TerritoryId,
  count: number,
): GameState {
  const pid = currentPlayerId(state);
  if (state.owner[territory] !== pid)
    throw new IllegalActionError(`${territory} is not owned by ${pid}`);
  const remaining = state.setupRemaining[pid] ?? 0;
  if (count < 1) throw new IllegalActionError('count must be at least 1');
  if (count > remaining)
    throw new IllegalActionError(`count ${count} exceeds ${pid}'s setup pool of ${remaining}`);

  const newRemaining = { ...state.setupRemaining, [pid]: remaining - count };
  const newArmies = { ...state.armies, [territory]: (state.armies[territory] ?? 0) + count };
  const totalLeft = Object.values(newRemaining).reduce((a, b) => a + b, 0);

  const placed: GameState = { ...state, armies: newArmies, setupRemaining: newRemaining };

  // Everyone has placed everything → begin the first player's first turn.
  if (totalLeft === 0) {
    return startTurn(placed, placed.players[0]!.id, 0);
  }

  // Batch placement: the current player deploys their entire pool on their own turn before
  // play passes on. Keep the turn here until their pool is empty.
  if (state.config.placement === 'batch' && (newRemaining[pid] ?? 0) > 0) {
    return placed;
  }

  // Otherwise (step placement) pass to the next alive player who still has armies to place.
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const cand = (state.turnPointer + i) % n;
    const cp = state.players[cand]!;
    if (cp.alive && (newRemaining[cp.id] ?? 0) > 0) {
      return { ...placed, turnPointer: cand };
    }
  }
  // Unreachable: totalLeft > 0 guarantees some player still has armies.
  return placed;
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
  // Teams: cannot attack a territory owned by a teammate.
  const defOwner = state.owner[to];
  if (state.teamAssignments && defOwner &&
      state.teamAssignments[pid] !== undefined &&
      state.teamAssignments[pid] === state.teamAssignments[defOwner]) {
    return { ok: false, reason: `${to} is owned by a teammate` };
  }
  if (!areAdjacent(from, to, state.portals, state.map)) return { ok: false, reason: `${from} and ${to} are not adjacent` };
  if ((state.armies[from] ?? 0) < 2)
    return { ok: false, reason: `${from} needs at least 2 armies to attack` };
  if (state.frozenTerritories?.[from]) return { ok: false, reason: `${from} is frozen` };
  if (state.frozenTerritories?.[to])   return { ok: false, reason: `${to} is frozen` };
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
  // Pseudo-players (Neutral, Zombies) are never permanently eliminated or card-holding.
  let newPlayers = state.players;
  const prevOwnerRemaining = state.map.allTerritoryIds.filter((id) => newOwner[id] === prevOwner);
  if (prevOwnerRemaining.length === 0 && prevOwner !== NEUTRAL_ID && prevOwner !== ZOMBIE_ID) {
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

  // Forced trade if attacker now holds ≥ 6 cards (from taking eliminated player's cards).
  const attackerCards = newPlayers.find((p) => p.id === pid)?.cards ?? [];
  const mustTradeCards = attackerCards.length >= 6;

  // Assemble post-capture state then delegate to checkWin — one code path for all modes.
  const postCapture: GameState = {
    ...state,
    owner: newOwner,
    armies: newArmies,
    players: newPlayers,
    capturedThisTurn: true,
    winner: null,
    mustTradeCards,
  };
  let result: GameState = { ...postCapture, winner: checkWin(postCapture) };

  // Assassin: on elimination, check for target-kill win or reassign the chain.
  if (prevOwnerRemaining.length === 0 && state.config.mode === 'assassin' && result.winner === null) {
    result = applyAssassinElimination(result, pid, prevOwner);
  }

  return result;
}

// --- Assassin elimination helper ---

/**
 * Called when `eliminated` is eliminated by `killer` in assassin mode.
 * If killer's target was eliminated → killer wins.
 * Otherwise → any player whose target was the eliminated player inherits their target's target,
 * and the eliminated player is removed from the targets map.
 */
function applyAssassinElimination(
  state: GameState,
  killer: PlayerId,
  eliminated: PlayerId,
): GameState {
  const targets = state.assassinTargets as Record<PlayerId, PlayerId> | undefined;
  if (!targets) return state;

  if (targets[killer] === eliminated) return { ...state, winner: killer };

  // Reassign: any player whose target was `eliminated` now targets `eliminated`'s old target.
  const eliminatedTarget = targets[eliminated];
  const newTargets: Record<PlayerId, PlayerId> = {};
  for (const [pid, tgt] of Object.entries(targets)) {
    if (pid === eliminated) continue;
    if (tgt === eliminated && eliminatedTarget && eliminatedTarget !== pid) {
      newTargets[pid] = eliminatedTarget;
    } else {
      newTargets[pid] = tgt as PlayerId;
    }
  }
  return { ...state, assassinTargets: newTargets as Readonly<Record<PlayerId, PlayerId>> };
}

// --- Zombie spread (called by startTurn at the start of each new round) ---

/**
 * Run the zombie faction's turn: reinforce each zombie territory by +1 army, then spread
 * to every adjacent non-zombie territory (strongest tiles attack first). On capture the
 * conquered territory receives `ceil(originalDefenderArmies / 2)` armies (infect-half).
 * If zombies have no territories they respawn on a random tile. Updates `winner` via checkWin.
 */
export function applyZombieTurn(state: GameState, rng: Rng): GameState {
  let cur = state;
  const diceMode = state.config.dice;
  const allIds = state.map.allTerritoryIds;

  const zombieTerrs = allIds.filter((id) => cur.owner[id] === ZOMBIE_ID);

  // Respawn: if all zombie territories were wiped out, claim a random tile with 3 armies.
  if (zombieTerrs.length === 0) {
    const candidates = allIds.filter((id) => cur.owner[id] !== ZOMBIE_ID);
    if (candidates.length > 0) {
      const idx = Math.floor(rng() * candidates.length);
      const respawn = candidates[idx]!;
      cur = {
        ...cur,
        owner:  { ...cur.owner,  [respawn]: ZOMBIE_ID },
        armies: { ...cur.armies, [respawn]: 3 },
      };
    }
    return { ...cur, winner: checkWin(cur) };
  }

  // Reinforce: each zombie territory gains 1 army.
  const newArm = { ...cur.armies };
  for (const id of zombieTerrs) {
    newArm[id] = (newArm[id] ?? 0) + 1;
  }
  cur = { ...cur, armies: newArm };

  // Spread: sort zombie tiles by army count (highest first) then attack all neighbours.
  const sorted = allIds
    .filter((id) => cur.owner[id] === ZOMBIE_ID)
    .sort((a, b) => (cur.armies[b] ?? 0) - (cur.armies[a] ?? 0));

  for (const from of sorted) {
    if ((cur.armies[from] ?? 0) < 2) continue;

    for (const to of neighborsWith(from, cur.portals, cur.map)) {
      if (cur.owner[to] === ZOMBIE_ID) continue;

      const fromArm = cur.armies[from] ?? 0;
      if (fromArm < 2) break; // attacker exhausted mid-neighbours

      const toArm    = cur.armies[to] ?? 0;
      const attDice  = attackDiceCount(fromArm);
      const defDice  = defenseDiceCount(toArm);
      const aRolls   = rollDiceForMode(attDice, rng, diceMode);
      const dRolls   = rollDiceForMode(defDice, rng, diceMode);
      const { attackerLosses, defenderLosses } = resolveCombat(aRolls, dRolls);

      const newFrom = fromArm - attackerLosses;
      const newTo   = toArm  - defenderLosses;

      if (newTo <= 0) {
        // Capture: infect half the original defender armies (minimum 1).
        const infectArmies = Math.max(1, Math.ceil(toArm / 2));
        const defOwner = cur.owner[to]!;
        const newOwner  = { ...cur.owner,  [to]: ZOMBIE_ID };
        const newArmies = { ...cur.armies, [from]: newFrom, [to]: infectArmies };

        // Eliminate the defender if they just lost their last territory.
        let newPlayers = cur.players;
        if (defOwner !== ZOMBIE_ID && defOwner !== NEUTRAL_ID) {
          const remaining = allIds.filter((id) => newOwner[id] === defOwner).length;
          if (remaining === 0) {
            newPlayers = cur.players.map((p) =>
              p.id === defOwner ? { ...p, alive: false } : p,
            );
          }
        }

        cur = { ...cur, owner: newOwner, armies: newArmies, players: newPlayers };
      } else {
        cur = { ...cur, armies: { ...cur.armies, [from]: newFrom, [to]: newTo } };
      }
    }
  }

  return { ...cur, winner: checkWin(cur) };
}

// --- Blitz (auto-repeat attack) ---

export interface BlitzRound {
  readonly attackerRolls: readonly number[];
  readonly defenderRolls: readonly number[];
  readonly attackerLosses: number;
  readonly defenderLosses: number;
  readonly captured: boolean;
}

export interface BlitzResult {
  readonly state: GameState;
  readonly rounds: readonly BlitzRound[];
  readonly captured: boolean;
  /** The exact ATTACK actions applied, in order — replayable through reduce() (e.g. over a network). */
  readonly actions: readonly Action[];
}

/**
 * Repeatedly attack `from → to` until the territory is captured or the attacker stops.
 * RNG is injected so blitz is deterministic in tests.
 *
 * `keepBehind` is the reserve the player guarantees stays in the source territory: the blitz
 * stops once `from` would drop to it (it never spends the reserve), and on capture the
 * committed survivors (`fromArmies − keepBehind`) advance — still bounded by the rules'
 * minimum (≥ dice rolled) and maximum (≤ fromArmies − 1). The default of 1 reproduces the
 * classic "fight to the last man, advance all but one" behaviour.
 *
 * Returns the final state plus a per-round log for the UI to animate.
 */
export function resolveBlitz(
  state: GameState,
  from: TerritoryId,
  to: TerritoryId,
  rng: Rng,
  keepBehind = 1,
  mode: DiceMode = 'random',
): BlitzResult {
  const v = validateAttack(state, from, to);
  if (!v.ok) throw new IllegalActionError(v.reason);

  const floor = Math.max(1, keepBehind);
  let cur = state;
  const rounds: BlitzRound[] = [];
  const actions: Action[] = [];
  let captured = false;

  // Bounded by the defender's army count and the reserve floor: each round removes ≥0 and the
  // loop ends on capture or when the committed force is spent, so this always terminates.
  while ((cur.armies[from] ?? 0) >= 2 && (cur.armies[from] ?? 0) > floor) {
    const fromArmies = cur.armies[from] ?? 0;
    const toArmies = cur.armies[to] ?? 0;
    const attackerRolls = rollDiceForMode(attackDiceCount(fromArmies), rng, mode);
    const defenderRolls = rollDiceForMode(defenseDiceCount(toArmies), rng, mode);
    const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
    const willCapture = toArmies - defenderLosses <= 0;

    let action: Action;
    if (willCapture) {
      // Advance the committed survivors, clamped to the rules' move bounds.
      const minMove = Math.max(1, attackerRolls.length);
      const want = fromArmies - floor;
      const moveOnCapture = Math.min(fromArmies - 1, Math.max(minMove, want));
      action = { type: 'ATTACK', from, to, attackerRolls, defenderRolls, moveOnCapture };
    } else {
      action = { type: 'ATTACK', from, to, attackerRolls, defenderRolls };
    }
    cur = applyAttack(cur, action);
    rounds.push({ attackerRolls, defenderRolls, attackerLosses, defenderLosses, captured: willCapture });
    actions.push(action);

    if (willCapture) { captured = true; break; }
    if (cur.winner !== null) break;
  }

  return { state: cur, rounds, captured, actions };
}

// --- Fortify ---

export function connectedThroughOwned(
  state: GameState,
  playerId: PlayerId,
  from: TerritoryId,
  to: TerritoryId,
): boolean {
  // BFS over territories owned by playerId; portal edges count, frozen territories are blockades.
  const frozen = state.frozenTerritories;
  const visited = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of neighborsWith(current, state.portals, state.map)) {
      if (frozen?.[neighbor]) continue; // frozen territories block movement
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

function scoreTurnLimit(state: GameState): PlayerId | null {
  const allIds = state.map.allTerritoryIds;
  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 0) return null;
  let best = alive[0]!;
  let bestTerr = allIds.filter((id) => state.owner[id] === best.id).length;
  let bestArmies = allIds.reduce((s, id) => state.owner[id] === best.id ? s + (state.armies[id] ?? 0) : s, 0);
  for (let i = 1; i < alive.length; i++) {
    const p = alive[i]!;
    const terr = allIds.filter((id) => state.owner[id] === p.id).length;
    const armies = allIds.reduce((s, id) => state.owner[id] === p.id ? s + (state.armies[id] ?? 0) : s, 0);
    if (terr > bestTerr || (terr === bestTerr && armies > bestArmies)) {
      best = p; bestTerr = terr; bestArmies = armies;
    }
  }
  return best.id;
}

const MISSION_EVALUATORS: Record<MissionId, (state: GameState, pid: PlayerId) => boolean> = {
  'asia-africa':           (s, pid) => ownsContinent(s, pid, 'AS') && ownsContinent(s, pid, 'AF'),
  'asia-s-america':        (s, pid) => ownsContinent(s, pid, 'AS') && ownsContinent(s, pid, 'SA'),
  'n-america-africa':      (s, pid) => ownsContinent(s, pid, 'NA') && ownsContinent(s, pid, 'AF'),
  'n-america-australia':   (s, pid) => ownsContinent(s, pid, 'NA') && ownsContinent(s, pid, 'AU'),
  'europe-australia-plus': (s, pid) =>
    ownsContinent(s, pid, 'EU') && ownsContinent(s, pid, 'AU') &&
    (['NA', 'SA', 'AF', 'AS'] as ContinentId[]).some((c) => ownsContinent(s, pid, c)),
  'europe-s-america-plus': (s, pid) =>
    ownsContinent(s, pid, 'EU') && ownsContinent(s, pid, 'SA') &&
    (['NA', 'AU', 'AF', 'AS'] as ContinentId[]).some((c) => ownsContinent(s, pid, c)),
  'occupy-24':             (s, pid) =>
    s.map.allTerritoryIds.filter((id) => s.owner[id] === pid).length >= 24,
  'occupy-18-2armies':     (s, pid) =>
    s.map.allTerritoryIds.filter((id) => s.owner[id] === pid && (s.armies[id] ?? 0) >= 2).length >= 18,
};

function checkMissionsWin(state: GameState): PlayerId | null {
  if (!state.missions) return null;
  const pid = currentPlayerId(state);
  const missionId = state.missions[pid];
  if (!missionId) return null;
  return MISSION_EVALUATORS[missionId](state, pid) ? pid : null;
}

function checkCapitalsWin(state: GameState): PlayerId | null {
  if (!state.capitals) return null;
  const pid = currentPlayerId(state);
  return Object.values(state.capitals).every((t) => state.owner[t] === pid) ? pid : null;
}

function checkDominationWin(state: GameState): PlayerId | null {
  const allIds = state.map.allTerritoryIds;
  const threshold = state.config.dominationThreshold ?? 0.70;
  const needed = Math.ceil(threshold * allIds.length);
  const pid = currentPlayerId(state);
  const owned = allIds.filter((id) => state.owner[id] === pid).length;
  return owned >= needed ? pid : null;
}

export function checkWin(state: GameState): PlayerId | null {
  // Teams: last team standing wins (overrides mode-specific logic).
  if (state.teamAssignments) {
    const assignments = state.teamAssignments;
    const aliveTeams = new Set(
      state.players.filter((p) => p.alive).map((p) => assignments[p.id]).filter(Boolean),
    );
    if (aliveTeams.size === 1) return state.players.find((p) => p.alive)?.id ?? null;
    return null;
  }

  switch (state.config.mode) {
    case 'world': {
      const allIds = state.map.allTerritoryIds;
      const first = state.owner[allIds[0]!];
      if (!first) return null;
      return allIds.every((id) => state.owner[id] === first) ? first : null;
    }
    case 'twoplayer': {
      // Win when the opponent (non-Neutral) real player is eliminated.
      const aliveReal = state.players.filter((p) => p.alive && p.id !== NEUTRAL_ID);
      return aliveReal.length === 1 ? aliveReal[0]!.id : null;
    }
    case 'missions':
      return checkMissionsWin(state);
    case 'capitals':
      return checkCapitalsWin(state);
    case 'domination':
      return checkDominationWin(state);
    case 'assassin':
      return null; // wins are detected inside applyAttack at elimination time
    case 'zombies': {
      // Win when only one real (non-zombie) player remains.
      // If all real players are eaten, ZOMBIE_ID is returned so the game loop can terminate.
      const aliveReal = state.players.filter((p) => p.alive && p.id !== ZOMBIE_ID);
      if (aliveReal.length === 1) return aliveReal[0]!.id;
      if (aliveReal.length === 0) return ZOMBIE_ID;
      return null;
    }
    case 'turnlimit': {
      // Early exit: last player standing (all enemies eliminated mid-game).
      const alive = state.players.filter((p) => p.alive);
      return alive.length === 1 ? alive[0]!.id : null;
    }
    default:
      return null; // TODO(mode): implement other win conditions
  }
}

// --- Turn advancement (called by END_PHASE in actions.ts when leaving fortify) ---

/** Returns the index of the next alive, non-pseudo player after state.turnPointer. */
export function nextAlivePointer(state: GameState): number {
  const n = state.players.length;
  for (let i = 1; i < n; i++) {
    const ptr = (state.turnPointer + i) % n;
    const p = state.players[ptr];
    if (p?.alive && p.id !== NEUTRAL_ID && p.id !== ZOMBIE_ID) return ptr;
  }
  // Should never be reached: checkWin fires before the last opponent is eliminated.
  throw new Error('nextAlivePointer: no alive players remaining');
}

export function startTurn(state: GameState, playerId: PlayerId, turnPointer: number, rng?: Rng): GameState {
  const reinforcements = calcReinforcements(state, playerId);
  const nextPlayer = state.players[turnPointer]!;
  // Forced trade required if the incoming player holds 5+ cards at turn start.
  const mustTradeCards = nextPlayer.cards.length >= 5;

  // A new round begins only when transitioning from fortify back to player 0.
  // The initial game-start call (from setup phase) must not increment the counter.
  const isNewRound = turnPointer === 0 && state.phase === 'fortify';
  const rounds = isNewRound ? (state.roundsElapsed ?? 0) + 1 : (state.roundsElapsed ?? 0);

  let current: GameState = {
    ...state,
    turnPointer,
    phase: 'reinforce',
    reinforcementsRemaining: reinforcements,
    capturedThisTurn: false,
    fortifiedThisTurn: false,
    mustTradeCards,
    roundsElapsed: rounds,
  };

  // Zombies: run the zombie spread at the start of each new round (injected RNG for tests).
  if (state.config.mode === 'zombies' && isNewRound) {
    current = applyZombieTurn(current, rng ?? (() => Math.random()));
  }

  // Blizzards: cycle to the next frozen-territory set at the start of each new round.
  if (state.config.mode === 'blizzards' && isNewRound) {
    const schedule = state.blizzardSchedule ?? [];
    const tiles = schedule[rounds % Math.max(1, schedule.length)] ?? [];
    const frozen = Object.fromEntries(
      tiles.map((t) => [t, true as const]),
    ) as Readonly<Record<TerritoryId, true>>;
    current = { ...current, frozenTerritories: frozen };
  }

  // Turn Limit: check win condition after the round counter has been updated.
  if (state.config.mode === 'turnlimit' && rounds >= (state.config.turnLimit ?? 15)) {
    return { ...current, winner: scoreTurnLimit(current) };
  }

  return current;
}
