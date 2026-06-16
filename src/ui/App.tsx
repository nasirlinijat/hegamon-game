import { useEffect, useRef, useState } from 'react';
import { createDeck } from '../engine/cards';
import { rollDice } from '../engine/dice';
import { ALL_TERRITORY_IDS, neighbors, type TerritoryId } from '../engine/map';
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
import { DicePanel } from './Dice';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HUMAN_ID: PlayerId = 'You';
export const CPU_ID: PlayerId = 'CPU';

export const PLAYER_COLORS: Record<PlayerId, string> = {
  [HUMAN_ID]: '#3d7fd6',
  [CPU_ID]: '#d6453d',
};

const CPU_DELAY_MS = 600;

export interface CombatResult {
  from: TerritoryId;
  to: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  attackerRolls: readonly number[];
  defenderRolls: readonly number[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

// ---------------------------------------------------------------------------

function buildInitialState(): GameState {
  const deck = createDeck(() => Math.random());
  return createInitialState([HUMAN_ID, CPU_ID], { deck });
}

export function App() {
  const [state, setState] = useState<GameState>(buildInitialState);
  const [selected, setSelected] = useState<TerritoryId | null>(null);
  const [hovered, setHovered] = useState<TerritoryId | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [lastCombat, setLastCombat] = useState<CombatResult | null>(null);
  const [combatSeq, setCombatSeq] = useState(0);
  const [aiRunning, setAiRunning] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  function dispatch(action: Action) {
    setState((s) => reduce(s, action));
    setSelected(null);
    setSelectedCards([]);
  }
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  function showCombat(s: GameState, action: Extract<Action, { type: 'ATTACK' }>) {
    const { attackerLosses, defenderLosses } = resolveCombat(action.attackerRolls, action.defenderRolls);
    const defArmies = s.armies[action.to] ?? 0;
    setLastCombat({
      from: action.from,
      to: action.to,
      attacker: s.players[s.turnPointer]?.id ?? HUMAN_ID,
      defender: s.owner[action.to],
      attackerRolls: action.attackerRolls,
      defenderRolls: action.defenderRolls,
      attackerLosses,
      defenderLosses,
      captured: defenderLosses >= defArmies,
    });
    setCombatSeq((n) => n + 1);
  }
  const showCombatRef = useRef(showCombat);
  showCombatRef.current = showCombat;

  const isHumanTurn = state.players[state.turnPointer]?.id === HUMAN_ID;

  // ---- CPU automation (600ms between actions) ------------------------------

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
      if (action.type === 'ATTACK') showCombatRef.current(s, action);
      dispatchRef.current(action);
      setTimeout(step, CPU_DELAY_MS);
    }

    const t = setTimeout(step, 450);
    return () => clearTimeout(t);
  }, [isHumanTurn, state.winner, aiRunning, state.turnPointer]);

  useEffect(() => { if (isHumanTurn) setAiRunning(false); }, [isHumanTurn]);

  // ---- Human interaction ---------------------------------------------------

  const phase = state.phase;

  function onTerritoryClick(id: TerritoryId) {
    if (!isHumanTurn || state.winner !== null || state.mustTradeCards) return;

    if (phase === 'reinforce') {
      if (state.owner[id] !== HUMAN_ID || state.reinforcementsRemaining <= 0) return;
      dispatch({ type: 'REINFORCE', territory: id, count: 1 });
      return;
    }

    if (phase === 'attack') {
      if (selected === null) {
        if (state.owner[id] === HUMAN_ID && (state.armies[id] ?? 0) >= 2) setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] !== HUMAN_ID) {
        if (!validateAttack(state, selected, id).ok) return;
        const fromArmies = state.armies[selected] ?? 0;
        const toArmies = state.armies[id] ?? 0;
        const attackerRolls = rollDice(attackDiceCount(fromArmies), Math.random);
        const defenderRolls = rollDice(defenseDiceCount(toArmies), Math.random);
        const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
        const captured = toArmies - defenderLosses <= 0;
        const action: Action = {
          type: 'ATTACK', from: selected, to: id, attackerRolls, defenderRolls,
          ...(captured ? { moveOnCapture: fromArmies - attackerLosses - 1 } : {}),
        };
        showCombat(state, action as Extract<Action, { type: 'ATTACK' }>);
        dispatch(action);
      } else if ((state.armies[id] ?? 0) >= 2) {
        setSelected(id);
      }
      return;
    }

    if (phase === 'fortify') {
      if (state.fortifiedThisTurn) return;
      if (selected === null) {
        if (state.owner[id] === HUMAN_ID && (state.armies[id] ?? 0) >= 2) setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] === HUMAN_ID) {
        if (!validateFortify(state, selected, id, 1).ok) return;
        const count = (state.armies[selected] ?? 0) - 1;
        if (count >= 1) dispatch({ type: 'FORTIFY', from: selected, to: id, count });
      }
    }
  }

  function onEndPhase() {
    if (!isHumanTurn || state.winner !== null) return;
    try { dispatch({ type: 'END_PHASE' }); } catch { /* reducer rejected (armies remain) */ }
  }

  function onToggleCard(i: number) {
    setSelectedCards((sel) =>
      sel.includes(i) ? sel.filter((x) => x !== i) : sel.length < 3 ? [...sel, i] : sel,
    );
  }

  function onTradeSelected() {
    if (selectedCards.length !== 3) return;
    const [a, b, c] = [...selectedCards].sort((x, y) => x - y);
    dispatch({ type: 'TRADE_IN', cardIndices: [a!, b!, c!] });
  }

  function onRestart() {
    setState(buildInitialState());
    setSelected(null);
    setHovered(null);
    setSelectedCards([]);
    setLastCombat(null);
    setAiRunning(false);
  }

  // ---- Highlight sets ------------------------------------------------------

  const validTargets = new Set<TerritoryId>();
  if (isHumanTurn && selected !== null) {
    if (phase === 'attack') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] !== HUMAN_ID && validateAttack(state, selected, id).ok) validTargets.add(id);
      }
    } else if (phase === 'fortify') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] === HUMAN_ID && id !== selected && connectedThroughOwned(state, HUMAN_ID, selected, id)) {
          validTargets.add(id);
        }
      }
    }
  }

  // Hover preview of attack targets when nothing is selected yet
  const hoverTargets = new Set<TerritoryId>();
  if (isHumanTurn && selected === null && hovered && phase === 'attack' &&
      state.owner[hovered] === HUMAN_ID && (state.armies[hovered] ?? 0) >= 2) {
    for (const n of neighbors(hovered)) {
      if (state.owner[n] !== HUMAN_ID && validateAttack(state, hovered, n).ok) hoverTargets.add(n);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', background: '#0a1a2c' }}>
        <Board
          state={state}
          selected={selected}
          validTargets={validTargets}
          hoverTargets={hoverTargets}
          hovered={hovered}
          onTerritoryClick={onTerritoryClick}
          onHover={setHovered}
        />
        <DicePanel result={lastCombat} seq={combatSeq} />
        {state.winner !== null && <WinnerBanner winner={state.winner} onRestart={onRestart} />}
      </div>
      <Sidebar
        state={state}
        isHumanTurn={isHumanTurn}
        aiRunning={aiRunning}
        selected={selected}
        selectedCards={selectedCards}
        onToggleCard={onToggleCard}
        onTradeSelected={onTradeSelected}
        onEndPhase={onEndPhase}
        onRestart={onRestart}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function WinnerBanner({ winner, onRestart }: { winner: PlayerId; onRestart: () => void }) {
  const color = PLAYER_COLORS[winner] ?? '#fff';
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', zIndex: 10,
    }}>
      <div style={{ background: '#16213e', border: `3px solid ${color}`, borderRadius: 16, padding: '40px 60px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
        <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4 }}>{winner} wins!</div>
        <div style={{ color: '#aaa', marginBottom: 24 }}>World domination achieved.</div>
        <button onClick={onRestart} style={btnStyle('#3d7fd6')}>Play again</button>
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
