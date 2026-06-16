import { type TerritoryId } from './map';
import { type GameState, type PlayerId, IllegalActionError } from './state';
import {
  validateReinforce,
  validateFortify,
  applyAttack,
  startTurn,
  currentPlayerId,
  nextAlivePointer,
} from './rules';

export type Action =
  | { readonly type: 'REINFORCE'; readonly territory: TerritoryId; readonly count: number }
  | {
      readonly type: 'ATTACK';
      readonly from: TerritoryId;
      readonly to: TerritoryId;
      readonly attackerRolls: readonly number[];
      readonly defenderRolls: readonly number[];
      /** Only consulted on capture (defender → 0). Defaults to max(1, attackDiceRolled). */
      readonly moveOnCapture?: number;
    }
  | { readonly type: 'FORTIFY'; readonly from: TerritoryId; readonly to: TerritoryId; readonly count: number }
  | { readonly type: 'END_PHASE' };

export function reduce(state: GameState, action: Action): GameState {
  if (state.winner !== null) {
    throw new IllegalActionError('the game is already over');
  }

  switch (action.type) {
    case 'REINFORCE': {
      if (state.phase !== 'reinforce')
        throw new IllegalActionError(`REINFORCE is not allowed during the ${state.phase} phase`);
      const pid = currentPlayerId(state);
      const v = validateReinforce(state, pid, action.territory, action.count);
      if (!v.ok) throw new IllegalActionError(v.reason);
      return {
        ...state,
        armies: { ...state.armies, [action.territory]: state.armies[action.territory]! + action.count },
        reinforcementsRemaining: state.reinforcementsRemaining - action.count,
      };
    }

    case 'ATTACK': {
      if (state.phase !== 'attack')
        throw new IllegalActionError(`ATTACK is not allowed during the ${state.phase} phase`);
      return applyAttack(state, action);
    }

    case 'FORTIFY': {
      if (state.phase !== 'fortify')
        throw new IllegalActionError(`FORTIFY is not allowed during the ${state.phase} phase`);
      if (state.fortifiedThisTurn)
        throw new IllegalActionError('already used the fortify move this turn');
      const v = validateFortify(state, action.from, action.to, action.count);
      if (!v.ok) throw new IllegalActionError(v.reason);
      return {
        ...state,
        armies: {
          ...state.armies,
          [action.from]: state.armies[action.from]! - action.count,
          [action.to]: state.armies[action.to]! + action.count,
        },
        fortifiedThisTurn: true,
      };
    }

    case 'END_PHASE': {
      if (state.phase === 'reinforce') {
        if (state.reinforcementsRemaining > 0)
          throw new IllegalActionError(
            `must place all ${state.reinforcementsRemaining} reinforcements before advancing`,
          );
        return { ...state, phase: 'attack' };
      }
      if (state.phase === 'attack') return { ...state, phase: 'fortify' };
      // fortify → advance to next alive player, resetting per-turn flags
      const nextPointer = nextAlivePointer(state);
      const nextId = state.players[nextPointer]!.id;
      return startTurn(state, nextId, nextPointer);
    }
  }
}
