import { type GameState, type PlayerId, type Card, currentPlayer, territoriesOf } from './state';
import { type TerritoryId, neighbors, neighborsWith } from './map';
import { type Action } from './actions';
import { type Rng, rollDiceForMode } from './dice';
import {
  currentPlayerId,
  attackDiceCount,
  defenseDiceCount,
  resolveCombat,
  connectedThroughOwned,
} from './rules';
import { isValidSet } from './cards';

/**
 * Choose the next legal action for the current player.
 * The returned action is guaranteed legal: passing it to reduce() will not throw.
 */
export function chooseAction(state: GameState, rng: Rng): Action {
  if (state.mustTradeCards) return chooseTrade(state);

  // Hard: trade proactively during the reinforce phase when a set is available.
  if (state.config.aiDifficulty === 'hard' && state.phase === 'reinforce') {
    const set = findValidSet(currentPlayer(state).cards);
    if (set !== null) return { type: 'TRADE_IN', cardIndices: set };
  }

  switch (state.phase) {
    case 'setup':
      return chooseSetupPlacement(state);
    case 'reinforce':
      return chooseReinforce(state);
    case 'attack':
      return chooseAttack(state, rng);
    case 'fortify':
      return chooseFortify(state);
  }
}

// --- Setup ---
// Place one army on the owned border territory with the most enemy neighbours.

function chooseSetupPlacement(state: GameState): Action {
  const pid = currentPlayerId(state);
  const myTerrs = territoriesOf(state, pid);

  let best: TerritoryId = myTerrs[0]!;
  let bestScore = -1;
  for (const t of myTerrs) {
    const score = neighbors(t, state.map).filter((n) => state.owner[n] !== pid).length;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // Batch placement: drop the whole remaining pool at once (step mode places one at a time).
  const count = state.config.placement === 'batch' ? (state.setupRemaining[pid] ?? 1) : 1;
  return { type: 'REINFORCE', territory: best, count };
}

// --- Reinforce ---
// Normal: stack all armies on the border territory with the most enemy neighbours.
// Easy:   spread troops — place 1 at a time on the border territory with the fewest enemies.
// Hard:   stack on a territory adjacent to completing a continent; fall back to Normal.

function chooseReinforce(state: GameState): Action {
  if (state.reinforcementsRemaining === 0) return { type: 'END_PHASE' };

  const pid = currentPlayerId(state);
  const myTerrs = territoriesOf(state, pid);
  const diff = state.config.aiDifficulty;

  if (diff === 'easy') {
    // Spread: place 1 army at a time on the border territory with the fewest enemy neighbours.
    let best: TerritoryId = myTerrs[0]!;
    let bestScore = Infinity;
    for (const t of myTerrs) {
      const score = neighbors(t, state.map).filter((n) => state.owner[n] !== pid).length;
      if (score > 0 && score < bestScore) { bestScore = score; best = t; }
    }
    return { type: 'REINFORCE', territory: best, count: 1 };
  }

  if (diff === 'hard') {
    // Stack on an owned territory adjacent to the continent we're closest to completing.
    const target = findContinentCompletionTarget(state, pid);
    if (target !== null) {
      return { type: 'REINFORCE', territory: target, count: state.reinforcementsRemaining };
    }
  }

  // Normal (and Hard fallback): stack on the border with the most enemies.
  let best: TerritoryId = myTerrs[0]!;
  let bestScore = -1;
  for (const t of myTerrs) {
    const score = neighbors(t, state.map).filter((n) => state.owner[n] !== pid).length;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return { type: 'REINFORCE', territory: best, count: state.reinforcementsRemaining };
}

// --- Attack ---
// Attack the adjacent enemy territory where (fromArmies - toArmies) is greatest.
// Easy:   only attack with advantage ≥ 3 (large lead required).
// Normal: attack with any strictly positive advantage.
// Hard:   attack with advantage ≥ 0 (equal armies accepted).

function chooseAttack(state: GameState, rng: Rng): Action {
  // If mid-attack armies need placing (e.g., after a forced trade-in), place first.
  if (state.reinforcementsRemaining > 0) return chooseReinforce(state);

  const pid = currentPlayerId(state);
  const diff = state.config.aiDifficulty;
  // bestAdvantage starts one below the minimum so the first valid target wins.
  const minAdvantage = diff === 'easy' ? 3 : diff === 'hard' ? 0 : 1;

  let bestFrom: TerritoryId | null = null;
  let bestTo: TerritoryId | null = null;
  let bestAdvantage = minAdvantage - 1;

  for (const from of territoriesOf(state, pid)) {
    const fromArmies = state.armies[from] ?? 0;
    if (fromArmies < 2) continue;

    for (const to of neighborsWith(from, state.portals, state.map)) {
      if (state.owner[to] === pid) continue;
      // Teams: skip teammate territories.
      const toOwner = state.owner[to];
      if (state.teamAssignments && toOwner &&
          state.teamAssignments[pid] === state.teamAssignments[toOwner]) continue;
      const advantage = fromArmies - (state.armies[to] ?? 0);
      if (advantage > bestAdvantage) {
        bestAdvantage = advantage;
        bestFrom = from;
        bestTo = to;
      }
    }
  }

  if (bestFrom === null || bestTo === null) return { type: 'END_PHASE' };

  const fromArmies = state.armies[bestFrom]!;
  const toArmies = state.armies[bestTo]!;
  const attDice = attackDiceCount(fromArmies);
  const defDice = defenseDiceCount(toArmies);

  const attackerRolls = rollDiceForMode(attDice, rng, state.config.dice);
  const defenderRolls = rollDiceForMode(defDice, rng, state.config.dice);

  // Pre-compute outcome so we can supply a valid moveOnCapture when a capture occurs.
  // Proof that moveOnCapture = fromArmiesAfter - 1 is always in-range on a capture:
  // capture requires attackerLosses = 0 (attacker wins every compared pair), so
  // fromArmiesAfter = fromArmies and fromArmies - 1 >= diceRolled = minMove. ✓
  const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
  const fromArmiesAfter = fromArmies - attackerLosses;
  const toArmiesAfter = toArmies - defenderLosses;

  return {
    type: 'ATTACK',
    from: bestFrom,
    to: bestTo,
    attackerRolls,
    defenderRolls,
    ...(toArmiesAfter <= 0 ? { moveOnCapture: fromArmiesAfter - 1 } : {}),
  };
}

// --- Fortify ---
// Normal/Hard: move excess armies from interior to border when possible.
// Easy: always skip fortify.

function chooseFortify(state: GameState): Action {
  if (state.fortifiedThisTurn || state.config.aiDifficulty === 'easy') return { type: 'END_PHASE' };

  const pid = currentPlayerId(state);
  const myTerrs = territoriesOf(state, pid);

  for (const from of myTerrs) {
    const fromArmies = state.armies[from] ?? 0;
    if (fromArmies < 2) continue;

    // Source must be interior (no enemy neighbours) so it can afford to give armies away.
    const isInterior = neighbors(from, state.map).every((n) => state.owner[n] === pid);
    if (!isInterior) continue;

    for (const to of myTerrs) {
      if (to === from) continue;

      // Destination must be a border territory.
      const isBorder = neighbors(to, state.map).some((n) => state.owner[n] !== pid);
      if (!isBorder) continue;

      if (!connectedThroughOwned(state, pid, from, to)) continue;

      return { type: 'FORTIFY', from, to, count: fromArmies - 1 };
    }
  }

  return { type: 'END_PHASE' };
}

// --- Trade ---

/** Find the first valid 3-card set; returns indices [i,j,k] or null. */
function findValidSet(cards: readonly Card[]): [number, number, number] | null {
  for (let i = 0; i < cards.length - 2; i++) {
    for (let j = i + 1; j < cards.length - 1; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        if (isValidSet([cards[i]!, cards[j]!, cards[k]!])) return [i, j, k];
      }
    }
  }
  return null;
}

function chooseTrade(state: GameState): Action {
  const set = findValidSet(currentPlayer(state).cards);
  if (set !== null) return { type: 'TRADE_IN', cardIndices: set };
  throw new Error('AI: mustTradeCards is true but no valid set found in hand');
}

// --- Hard AI helpers ---

/**
 * Find an owned territory adjacent to the continent the player is closest to completing.
 * Returns null if no useful target exists (all continents complete or none partially owned).
 */
function findContinentCompletionTarget(state: GameState, pid: PlayerId): TerritoryId | null {
  let bestTarget: TerritoryId | null = null;
  let bestProgress = -1;

  for (const continent of Object.values(state.map.continents)) {
    const total = continent.territories.length;
    const ownedCount = continent.territories.filter((t) => state.owner[t] === pid).length;
    if (ownedCount === 0 || ownedCount === total) continue; // no foothold or already complete

    const progress = ownedCount / total;
    if (progress > bestProgress) {
      // Find the first owned territory in this continent adjacent to a missing one.
      for (const t of continent.territories) {
        if (state.owner[t] !== pid) continue;
        const adjToMissing = neighbors(t, state.map).some(
          (n) => continent.territories.includes(n) && state.owner[n] !== pid,
        );
        if (adjToMissing) {
          bestProgress = progress;
          bestTarget = t;
          break;
        }
      }
    }
  }

  return bestTarget;
}
