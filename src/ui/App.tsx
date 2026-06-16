import { useEffect, useRef, useState } from 'react';
import { createDeck } from '../engine/cards';
import { rollDice } from '../engine/dice';
import { ALL_TERRITORY_IDS, type TerritoryId } from '../engine/map';
import {
  attackDiceCount,
  connectedThroughOwned,
  defenseDiceCount,
  resolveCombat,
  validateAttack,
  validateFortify,
} from '../engine/rules';
import { createInitialState, type GameState, type PlayerId } from '../engine/state';
import { type Action, reduce } from '../engine/actions';
import { chooseAction } from '../engine/ai';
import { Board } from './Board';
import { Sidebar } from './Sidebar';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HUMAN_ID: PlayerId = 'You';
export const CPU_ID: PlayerId = 'CPU';

export const PLAYER_COLORS: Record<PlayerId, string> = {
  [HUMAN_ID]: '#4a90d9',
  [CPU_ID]: '#e05555',
};

export interface CombatResult {
  from: TerritoryId;
  to: TerritoryId;
  attackerRolls: readonly number[];
  defenderRolls: readonly number[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

// ---------------------------------------------------------------------------
// Game initialisation
// ---------------------------------------------------------------------------

function buildInitialState(): GameState {
  const rng = () => Math.random();
  const deck = createDeck(rng);
  return createInitialState([HUMAN_ID, CPU_ID], { deck });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const [state, setState] = useState<GameState>(buildInitialState);

  // interaction state
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [lastCombat, setLastCombat] = useState<CombatResult | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = (action: Action) => {
    setState((s) => reduce(s, action));
    setSelected(null);
  };

  // Stable reference so the AI effect doesn't re-run on every state change
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // ---- AI automation -------------------------------------------------------

  const isHumanTurn = state.players[state.turnPointer]?.id === HUMAN_ID;

  useEffect(() => {
    if (isHumanTurn || state.winner !== null || aiRunning) return;

    setAiRunning(true);
    const rng = () => Math.random();

    function step() {
      const s = stateRef.current;
      if (s.winner !== null || s.players[s.turnPointer]?.id === HUMAN_ID) {
        setAiRunning(false);
        return;
      }

      const action = chooseAction(s, rng);

      // Capture combat results for display before dispatching
      if (action.type === 'ATTACK') {
        const { attackerLosses, defenderLosses } = resolveCombat(
          action.attackerRolls,
          action.defenderRolls,
        );
        const defArmies = s.armies[action.to] ?? 0;
        setLastCombat({
          from: action.from,
          to: action.to,
          attackerRolls: action.attackerRolls,
          defenderRolls: action.defenderRolls,
          attackerLosses,
          defenderLosses,
          captured: defenderLosses >= defArmies,
        });
      }

      dispatchRef.current(action);

      const delay = action.type === 'ATTACK' ? 700 : 300;
      setTimeout(step, delay);
    }

    const timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, [isHumanTurn, state.winner, aiRunning, state.turnPointer]);

  // Reset aiRunning flag when turn switches to human
  useEffect(() => {
    if (isHumanTurn) setAiRunning(false);
  }, [isHumanTurn]);

  // ---- Human interaction ---------------------------------------------------

  const currentPhase = state.phase;

  function onTerritoryClick(id: TerritoryId) {
    if (!isHumanTurn || state.winner !== null || state.mustTradeCards) return;

    if (currentPhase === 'reinforce') {
      if (state.owner[id] !== HUMAN_ID) return;
      if (state.reinforcementsRemaining <= 0) return;
      dispatch({ type: 'REINFORCE', territory: id, count: 1 });
      return;
    }

    if (currentPhase === 'attack') {
      if (selected === null) {
        // Selecting attack source
        if (state.owner[id] !== HUMAN_ID) return;
        if ((state.armies[id] ?? 0) < 2) return;
        setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] !== HUMAN_ID) {
        // Attack target
        const result = validateAttack(state, selected, id);
        if (!result.ok) return;

        const fromArmies = state.armies[selected] ?? 0;
        const toArmies = state.armies[id] ?? 0;
        const attDice = attackDiceCount(fromArmies);
        const defDice = defenseDiceCount(toArmies);
        const attackerRolls = rollDice(attDice, Math.random);
        const defenderRolls = rollDice(defDice, Math.random);
        const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
        const fromAfter = fromArmies - attackerLosses;
        const toAfter = toArmies - defenderLosses;
        const captured = toAfter <= 0;

        setLastCombat({
          from: selected,
          to: id,
          attackerRolls,
          defenderRolls,
          attackerLosses,
          defenderLosses,
          captured,
        });
        setSelected(null);
        dispatch({
          type: 'ATTACK',
          from: selected,
          to: id,
          attackerRolls,
          defenderRolls,
          ...(captured ? { moveOnCapture: fromAfter - 1 } : {}),
        });
      } else {
        // Clicking a different owned territory re-selects source
        if ((state.armies[id] ?? 0) >= 2) setSelected(id);
      }
      return;
    }

    if (currentPhase === 'fortify') {
      if (state.fortifiedThisTurn) return;

      if (selected === null) {
        if (state.owner[id] !== HUMAN_ID) return;
        if ((state.armies[id] ?? 0) < 2) return;
        setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] === HUMAN_ID && id !== selected) {
        const result = validateFortify(state, selected, id, 1);
        if (!result.ok) return;
        const count = (state.armies[selected] ?? 0) - 1;
        if (count < 1) return;
        dispatch({ type: 'FORTIFY', from: selected, to: id, count });
      }
      return;
    }
  }

  function onEndPhase() {
    if (!isHumanTurn || state.winner !== null) return;
    try {
      dispatch({ type: 'END_PHASE' });
    } catch {
      // reducer may reject (e.g. reinforcements still remaining) — ignore
    }
  }

  function onTradeIn(indices: [number, number, number]) {
    dispatch({ type: 'TRADE_IN', cardIndices: indices });
  }

  function onRestart() {
    setState(buildInitialState());
    setSelected(null);
    setLastCombat(null);
    setAiRunning(false);
  }

  // ---- Derived display hints -----------------------------------------------

  // Territories the human can validly target given the current selection
  const validTargets = new Set<TerritoryId>();
  if (isHumanTurn && selected !== null) {
    if (currentPhase === 'attack') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] !== HUMAN_ID && validateAttack(state, selected, id).ok) {
          validTargets.add(id);
        }
      }
    } else if (currentPhase === 'fortify') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] === HUMAN_ID && id !== selected) {
          if (connectedThroughOwned(state, HUMAN_ID, selected, id)) validTargets.add(id);
        }
      }
    }
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <Board
          state={state}
          selected={selected}
          validTargets={validTargets}
          onTerritoryClick={onTerritoryClick}
        />
        {state.winner !== null && (
          <WinnerBanner winner={state.winner} onRestart={onRestart} />
        )}
      </div>
      <Sidebar
        state={state}
        isHumanTurn={isHumanTurn}
        aiRunning={aiRunning}
        lastCombat={lastCombat}
        selected={selected}
        onEndPhase={onEndPhase}
        onTradeIn={onTradeIn}
        onRestart={onRestart}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Winner banner overlay
// ---------------------------------------------------------------------------

function WinnerBanner({ winner, onRestart }: { winner: PlayerId; onRestart: () => void }) {
  const color = PLAYER_COLORS[winner] ?? '#fff';
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)',
    }}>
      <div style={{
        background: '#16213e', border: `3px solid ${color}`,
        borderRadius: 16, padding: '40px 60px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
        <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>
          {winner} wins!
        </div>
        <div style={{ color: '#aaa', marginBottom: 24 }}>World domination achieved.</div>
        <button onClick={onRestart} style={btnStyle('#4a90d9')}>Play again</button>
      </div>
    </div>
  );
}

export function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: 8,
    padding: '10px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  };
}
