import { type GameState, currentPlayer, territoriesOf } from './state';
import { type TerritoryId, neighbors } from './map';
import { type Action } from './actions';
import { type Rng, rollDice } from './dice';
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

  switch (state.phase) {
    case 'reinforce':
      return chooseReinforce(state);
    case 'attack':
      return chooseAttack(state, rng);
    case 'fortify':
      return chooseFortify(state);
  }
}

// --- Reinforce ---
// Place all remaining armies on the owned territory with the most enemy neighbours.

function chooseReinforce(state: GameState): Action {
  if (state.reinforcementsRemaining === 0) return { type: 'END_PHASE' };

  const pid = currentPlayerId(state);
  const myTerrs = territoriesOf(state, pid);

  let best: TerritoryId = myTerrs[0]!;
  let bestScore = -1;

  for (const t of myTerrs) {
    const score = neighbors(t).filter((n) => state.owner[n] !== pid).length;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return { type: 'REINFORCE', territory: best, count: state.reinforcementsRemaining };
}

// --- Attack ---
// Attack the adjacent enemy territory where (fromArmies - toArmies) is greatest.
// Skip attack if no strictly favourable target exists.

function chooseAttack(state: GameState, rng: Rng): Action {
  // If mid-attack armies need placing (e.g., after a forced trade-in), place first.
  if (state.reinforcementsRemaining > 0) return chooseReinforce(state);

  const pid = currentPlayerId(state);

  let bestFrom: TerritoryId | null = null;
  let bestTo: TerritoryId | null = null;
  let bestAdvantage = 0; // only attack with strictly positive advantage

  for (const from of territoriesOf(state, pid)) {
    const fromArmies = state.armies[from] ?? 0;
    if (fromArmies < 2) continue;

    for (const to of neighbors(from)) {
      if (state.owner[to] === pid) continue;
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

  const attackerRolls = rollDice(attDice, rng);
  const defenderRolls = rollDice(defDice, rng);

  // Pre-compute outcome so we can supply a valid moveOnCapture when a capture occurs.
  // Proof that moveOnCapture = fromArmiesAfter - 1 is always in-range on a capture:
  // capture requires attackerLosses = 0 (attacker wins every compared pair), so
  // fromArmiesAfter = fromArmies and fromArmies - 1 >= diceRolled = minMove. ✓
  const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
  const fromArmiesAfter = fromArmies - attackerLosses;
  const toArmiesAfter = toArmies - defenderLosses;

  const moveOnCapture = toArmiesAfter <= 0 ? fromArmiesAfter - 1 : undefined;

  return {
    type: 'ATTACK',
    from: bestFrom,
    to: bestTo,
    attackerRolls,
    defenderRolls,
    moveOnCapture,
  };
}

// --- Fortify ---
// Move excess armies from an interior territory (no enemy neighbours) to an adjacent
// border territory (has enemy neighbours), if such a pair exists and is connected.

function chooseFortify(state: GameState): Action {
  if (state.fortifiedThisTurn) return { type: 'END_PHASE' };

  const pid = currentPlayerId(state);
  const myTerrs = territoriesOf(state, pid);

  for (const from of myTerrs) {
    const fromArmies = state.armies[from] ?? 0;
    if (fromArmies < 2) continue;

    // Source must be interior (no enemy neighbours) so it can afford to give armies away.
    const isInterior = neighbors(from).every((n) => state.owner[n] === pid);
    if (!isInterior) continue;

    for (const to of myTerrs) {
      if (to === from) continue;

      // Destination must be a border territory.
      const isBorder = neighbors(to).some((n) => state.owner[n] !== pid);
      if (!isBorder) continue;

      if (!connectedThroughOwned(state, pid, from, to)) continue;

      return { type: 'FORTIFY', from, to, count: fromArmies - 1 };
    }
  }

  return { type: 'END_PHASE' };
}

// --- Trade ---
// Find the first valid 3-card combination and trade it in.

function chooseTrade(state: GameState): Action {
  const cards = currentPlayer(state).cards;

  for (let i = 0; i < cards.length - 2; i++) {
    for (let j = i + 1; j < cards.length - 1; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        if (isValidSet([cards[i]!, cards[j]!, cards[k]!])) {
          return { type: 'TRADE_IN', cardIndices: [i, j, k] };
        }
      }
    }
  }

  throw new Error('AI: mustTradeCards is true but no valid set found in hand');
}
