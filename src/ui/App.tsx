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
import { DicePanel } from './Dice';
import { PhaseHud } from './PhaseHud';
import { Roster } from './Roster';
import { CornerControls } from './CornerControls';
import { Legend } from './Legend';
import { SetupScreen } from './SetupScreen';

// ---------------------------------------------------------------------------

export const HUMAN_ID: PlayerId = 'You';

/** Canonical player ids: human first, then CPUs. Colors are assigned by index. */
export const PLAYER_IDS: PlayerId[] = [HUMAN_ID, 'CPU 1', 'CPU 2', 'CPU 3', 'CPU 4', 'CPU 5'];

const PALETTE = ['#3d7fd6', '#d6453d', '#4a9e5c', '#d99b32', '#9b59b6', '#16a0a0'];

/** Pre-populated for every canonical id, so any 2–6 player subset just works. */
export const PLAYER_COLORS: Record<PlayerId, string> = Object.fromEntries(
  PLAYER_IDS.map((id, i) => [id, PALETTE[i]!]),
);

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

function buildInitialState(numOpponents: number): GameState {
  const deck = createDeck(() => Math.random());
  const ids = PLAYER_IDS.slice(0, numOpponents + 1);
  return createInitialState(ids, { deck, setup: true });
}

export function App() {
  const [screen, setScreen]         = useState<'setup' | 'game'>('setup');
  const [state, setState]           = useState<GameState>(() => buildInitialState(1));
  const [selected, setSelected]     = useState<TerritoryId | null>(null);
  const [hovered, setHovered]       = useState<TerritoryId | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [lastCombat, setLastCombat] = useState<CombatResult | null>(null);
  const [combatSeq, setCombatSeq]   = useState(0);
  const [aiRunning, setAiRunning]   = useState(false);

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
      from: action.from, to: action.to,
      attacker: s.players[s.turnPointer]?.id ?? HUMAN_ID,
      defender: s.owner[action.to],
      attackerRolls: action.attackerRolls, defenderRolls: action.defenderRolls,
      attackerLosses, defenderLosses,
      captured: defenderLosses >= defArmies,
    });
    setCombatSeq((n) => n + 1);
  }
  const showCombatRef = useRef(showCombat);
  showCombatRef.current = showCombat;

  const isHumanTurn = state.players[state.turnPointer]?.id === HUMAN_ID;

  // ---- CPU automation (ref-guarded; `aiRunning` kept out of deps intentionally) ----
  const aiActive = useRef(false);

  useEffect(() => {
    if (screen !== 'game') return;
    if (isHumanTurn || state.winner !== null) return;
    if (aiActive.current) return;
    aiActive.current = true;
    setAiRunning(true);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const rng = () => Math.random();

    function finish() { aiActive.current = false; setAiRunning(false); }

    function step() {
      if (cancelled) return;
      const s = stateRef.current;
      if (s.winner !== null || s.players[s.turnPointer]?.id === HUMAN_ID) { finish(); return; }
      const action = chooseAction(s, rng);
      if (action.type === 'ATTACK') showCombatRef.current(s, action);
      dispatchRef.current(action);
      timer = setTimeout(step, s.phase === 'setup' ? 180 : CPU_DELAY_MS);
    }

    // Faster pacing during setup placement (many small placements).
    const firstDelay = state.phase === 'setup' ? 220 : 450;
    timer = setTimeout(step, firstDelay);
    return () => { cancelled = true; clearTimeout(timer); aiActive.current = false; };
  }, [screen, isHumanTurn, state.winner, state.turnPointer, state.phase]);

  // ---- Human click handler ---------------------------------------------------

  const phase = state.phase;

  function onTerritoryClick(id: TerritoryId) {
    if (!isHumanTurn || state.winner !== null || state.mustTradeCards) return;

    if (phase === 'setup') {
      if (state.owner[id] !== HUMAN_ID || (state.setupRemaining[HUMAN_ID] ?? 0) <= 0) return;
      dispatch({ type: 'REINFORCE', territory: id, count: 1 });
      return;
    }

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
        const toArmies   = state.armies[id] ?? 0;
        const attackerRolls = rollDice(attackDiceCount(fromArmies), Math.random);
        const defenderRolls = rollDice(defenseDiceCount(toArmies),  Math.random);
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
    try { dispatch({ type: 'END_PHASE' }); } catch { /* reducer rejected */ }
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

  function resetCommon() {
    setSelected(null); setHovered(null);
    setSelectedCards([]); setLastCombat(null);
    setAiRunning(false);
    aiActive.current = false;
  }

  function onStart(numOpponents: number) {
    setState(buildInitialState(numOpponents));
    resetCommon();
    setScreen('game');
  }

  function onRestart() {
    resetCommon();
    setScreen('setup');
  }

  // ---- Highlight sets -------------------------------------------------------

  const validTargets = new Set<TerritoryId>();
  if (isHumanTurn && selected !== null) {
    if (phase === 'attack') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] !== HUMAN_ID && validateAttack(state, selected, id).ok)
          validTargets.add(id);
      }
    } else if (phase === 'fortify') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] === HUMAN_ID && id !== selected &&
            connectedThroughOwned(state, HUMAN_ID, selected, id))
          validTargets.add(id);
      }
    }
  }

  const hoverTargets = new Set<TerritoryId>();
  if (isHumanTurn && selected === null && hovered && phase === 'attack' &&
      state.owner[hovered] === HUMAN_ID && (state.armies[hovered] ?? 0) >= 2) {
    for (const n of neighbors(hovered)) {
      if (state.owner[n] !== HUMAN_ID && validateAttack(state, hovered, n).ok)
        hoverTargets.add(n);
    }
  }

  // ---------------------------------------------------------------------------

  if (screen === 'setup') {
    return (
      <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#07101d' }}>
        <SetupScreen onStart={onStart} />
      </div>
    );
  }

  return (
    <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#091524' }}>
      <Board
        state={state}
        selected={selected}
        validTargets={validTargets}
        hoverTargets={hoverTargets}
        hovered={hovered}
        onTerritoryClick={onTerritoryClick}
        onHover={setHovered}
      />

      {/* Overlays — all positioned absolute relative to the Board */}
      <DicePanel result={lastCombat} seq={combatSeq} />

      <Legend state={state} />

      <Roster state={state} />

      <PhaseHud
        state={state}
        isHumanTurn={isHumanTurn}
        aiRunning={aiRunning}
        selected={selected}
        onEndPhase={onEndPhase}
      />

      <CornerControls
        state={state}
        isHumanTurn={isHumanTurn}
        selectedCards={selectedCards}
        onToggleCard={onToggleCard}
        onTradeSelected={onTradeSelected}
        onRestart={onRestart}
      />

      {state.winner !== null && (
        <WinnerBanner winner={state.winner} onRestart={onRestart} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function WinnerBanner({ winner, onRestart }: { winner: PlayerId; onRestart: () => void }) {
  const color = PLAYER_COLORS[winner] ?? '#fff';
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)', zIndex: 10,
    }}>
      <div style={{
        background: '#14202e', border: `3px solid ${color}`, borderRadius: 18,
        padding: '40px 60px', textAlign: 'center',
        boxShadow: `0 0 60px ${color}44`,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
        <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 6 }}>{winner} wins!</div>
        <div style={{ color: '#8a9ab0', marginBottom: 24 }}>World domination achieved.</div>
        <button onClick={onRestart} style={{
          background: color, color: '#fff', border: 'none', borderRadius: 10,
          padding: '11px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>Play again</button>
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
