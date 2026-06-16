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
import { applyTradeIn, drawCardForCurrentPlayer } from './cards';

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
  | { readonly type: 'END_PHASE' }
  | { readonly type: 'TRADE_IN'; readonly cardIndices: readonly [number, number, number] };

export function reduce(state: GameState, action: Action): GameState {
  if (state.winner !== null) {
    throw new IllegalActionError('the game is already over');
  }

  // When a forced trade is required, only TRADE_IN is allowed.
  if (state.mustTradeCards && action.type !== 'TRADE_IN') {
    throw new IllegalActionError('must trade in a set of cards before continuing');
  }

  switch (action.type) {
    case 'REINFORCE': {
      // Also allowed mid-attack if there are trade-in armies waiting to be placed.
      const inReinforcePhase = state.phase === 'reinforce';
      const midAttackPlacement = state.phase === 'attack' && state.reinforcementsRemaining > 0;
      if (!inReinforcePhase && !midAttackPlacement) {
        throw new IllegalActionError(`REINFORCE is not allowed during the ${state.phase} phase`);
      }
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

    case 'TRADE_IN': {
      // Voluntary trade is only allowed in the reinforce phase.
      // Mid-attack forced trade is only allowed when mustTradeCards is set (guarded above).
      if (state.phase === 'fortify')
        throw new IllegalActionError('TRADE_IN is not allowed during the fortify phase');
      if (state.phase === 'attack' && !state.mustTradeCards)
        throw new IllegalActionError(
          'TRADE_IN during the attack phase is only allowed when holding 6+ cards after elimination',
        );
      return applyTradeIn(state, action.cardIndices);
    }

    case 'END_PHASE': {
      if (state.phase === 'reinforce') {
        if (state.reinforcementsRemaining > 0)
          throw new IllegalActionError(
            `must place all ${state.reinforcementsRemaining} reinforcements before advancing`,
          );
        return { ...state, phase: 'attack' };
      }
      if (state.phase === 'attack') {
        if (state.reinforcementsRemaining > 0)
          throw new IllegalActionError(
            `must place all ${state.reinforcementsRemaining} trade-in armies before advancing`,
          );
        return { ...state, phase: 'fortify' };
      }
      // fortify → draw card if earned, then advance to next alive player
      const stateAfterDraw = state.capturedThisTurn ? drawCardForCurrentPlayer(state) : state;
      const nextPointer = nextAlivePointer(stateAfterDraw);
      const nextId = stateAfterDraw.players[nextPointer]!.id;
      return startTurn(stateAfterDraw, nextId, nextPointer);
    }
  }
}
