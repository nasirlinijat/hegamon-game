import { type TerritoryId } from './map';
import { type GameState, type PlayerId, IllegalActionError } from './state';
import {
  validateReinforce,
  validateFortify,
  applyAttack,
  startTurn,
  currentPlayerId,
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
  switch (action.type) {
    case 'REINFORCE': {
      const pid = currentPlayerId(state);
      const v = validateReinforce(state, pid, action.territory, action.count);
      if (!v.ok) throw new IllegalActionError(v.reason);
      return {
        ...state,
        armies: { ...state.armies, [action.territory]: state.armies[action.territory]! + action.count },
        reinforcementsRemaining: state.reinforcementsRemaining - action.count,
      };
    }

    case 'ATTACK':
      return applyAttack(state, action);

    case 'FORTIFY': {
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
      if (state.phase === 'reinforce') return { ...state, phase: 'attack' };
      if (state.phase === 'attack') return { ...state, phase: 'fortify' };
      // fortify → advance turn (resets flags and recomputes reinforcements)
      const nextPointer = (state.turnPointer + 1) % state.players.length;
      const nextId = state.players[nextPointer]!.id;
      return startTurn(state, nextId, nextPointer);
    }
  }
}
