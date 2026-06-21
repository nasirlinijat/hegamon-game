import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDeck, isValidSet } from '../engine/cards';
import { rollDiceForMode } from '../engine/dice';
import { ALL_TERRITORY_IDS, neighbors, type TerritoryId } from '../engine/map';
import {
  attackDiceCount,
  connectedThroughOwned,
  defenseDiceCount,
  resolveBlitz,
  resolveCombat,
  validateAttack,
  validateFortify,
} from '../engine/rules';
import {
  createInitialState, NEUTRAL_ID, ZOMBIE_ID,
  type GameState, type PlayerId,
} from '../engine/state';
import { getMap } from '../engine/map-registry';
import { DEFAULT_CONFIG, type GameConfig, type GameMode } from '../engine/modes';
import { type Action, reduce } from '../engine/actions';
import { type Card } from '../engine/state';
import { chooseAction } from '../engine/ai';
import { Board } from './Board';
import { DicePanel } from './Dice';
import { PhaseHud } from './PhaseHud';
import { Roster } from './Roster';
import { CornerControls } from './CornerControls';
import { SetupScreen } from './SetupScreen';
import { ArmyMoveDial } from './ArmyMoveDial';
import { MainMenu } from './MainMenu';
import { LobbyScreen } from './LobbyScreen';
import { PlayerContext, DEFAULT_PLAYER_CTX, buildPlayerCtx } from './PlayerContext';
import * as net from './net';

// ---------------------------------------------------------------------------

export const HUMAN_ID: PlayerId = 'You';

/** Canonical player ids (used in single-player mode only). */
export const PLAYER_IDS: PlayerId[] = [HUMAN_ID, 'CPU 1', 'CPU 2', 'CPU 3', 'CPU 4', 'CPU 5'];

const PALETTE = ['#3d7fd6', '#d6453d', '#4a9e5c', '#d99b32', '#9b59b6', '#16a0a0'];

/** Legacy single-player color map (keyed by PLAYER_IDS). */
export const PLAYER_COLORS: Record<PlayerId, string> = {
  ...Object.fromEntries(PLAYER_IDS.map((id, i) => [id, PALETTE[i]!])),
  [NEUTRAL_ID]: '#4a5568',
  [ZOMBIE_ID]:  '#4a7a40',
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

type PendingMove =
  | { kind: 'fortify'; from: TerritoryId; to: TerritoryId; min: number; max: number }
  | { kind: 'blitz'; from: TerritoryId; to: TerritoryId; min: number; max: number }
  | { kind: 'place'; territory: TerritoryId; min: number; max: number }
  | {
      kind: 'capture'; from: TerritoryId; to: TerritoryId; min: number; max: number;
      attackerRolls: number[]; defenderRolls: number[];
    };

// ---------------------------------------------------------------------------

function findValidSetIndices(cards: readonly Card[]): [number, number, number] | null {
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      for (let c = b + 1; c < cards.length; c++) {
        if (isValidSet([cards[a]!, cards[b]!, cards[c]!])) return [a, b, c];
      }
    }
  }
  return null;
}

export function forceEndTurn(state: GameState, humanId: PlayerId): GameState {
  let s = state;
  let guard = 0;
  while (s.mustTradeCards && s.winner === null && guard++ < 20) {
    const player = s.players[s.turnPointer];
    if (!player) break;
    const idx = findValidSetIndices(player.cards);
    if (!idx) break;
    try { s = reduce(s, { type: 'TRADE_IN', cardIndices: idx }); } catch { break; }
  }
  if (s.reinforcementsRemaining > 0 && !s.mustTradeCards) {
    const t = s.map.allTerritoryIds.find((id) => s.owner[id] === humanId);
    if (t) {
      try { s = reduce(s, { type: 'REINFORCE', territory: t, count: s.reinforcementsRemaining }); } catch { /* skip */ }
    }
  }
  const origPointer = s.turnPointer;
  guard = 0;
  while (s.turnPointer === origPointer && s.winner === null && guard++ < 10) {
    try { s = reduce(s, { type: 'END_PHASE' }); } catch { break; }
  }
  return s;
}

function buildInitialState(config: GameConfig): GameState {
  const rng = () => Math.random();
  const deck = createDeck(rng, getMap(config.mapId).allTerritoryIds);
  const ids = PLAYER_IDS.slice(0, config.numOpponents + 1);
  return createInitialState(ids, { deck, setup: true, config, rng });
}

/** Rehydrate a wire-state (map field stripped) into a full GameState. */
function rehydrate(wire: object, config: GameConfig): GameState {
  return { ...(wire as Omit<GameState, 'map'>), map: getMap(config.mapId) };
}

// ---------------------------------------------------------------------------

type Screen = 'menu' | 'setup' | 'lobby' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [isOnline, setIsOnline] = useState(false);
  const [playerCtx, setPlayerCtx] = useState(DEFAULT_PLAYER_CTX);

  const [state, setState]           = useState<GameState>(() => buildInitialState(DEFAULT_CONFIG));
  const [selected, setSelected]     = useState<TerritoryId | null>(null);
  const [hovered, setHovered]       = useState<TerritoryId | null>(null);
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [lastCombat, setLastCombat] = useState<CombatResult | null>(null);
  const [combatSeq, setCombatSeq]   = useState(0);
  const [aiRunning, setAiRunning]   = useState(false);
  const [blitzMode, setBlitzMode]   = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [showContinents, setShowContinents] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Online: stored so we can reconnect (unused in v1 UI but kept for future rejoin logic)
  const [, setOnlineCode]   = useState('');
  const [, setOnlineToken]  = useState('');

  const stateRef = useRef(state);
  stateRef.current = state;

  const playerCtxRef = useRef(playerCtx);
  playerCtxRef.current = playerCtx;

  // ── Action dispatch ────────────────────────────────────────────────────────
  function dispatch(action: Action) {
    if (isOnline) {
      // In online mode, send to server; state arrives via state_update
      net.sendAction(action);
    } else {
      setState((s) => reduce(s, action));
    }
    setSelected(null);
    setSelectedCards([]);
  }
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // ── Combat display ─────────────────────────────────────────────────────────
  function showCombat(s: GameState, action: Extract<Action, { type: 'ATTACK' }>) {
    const { attackerLosses, defenderLosses } = resolveCombat(action.attackerRolls, action.defenderRolls);
    const defArmies = s.armies[action.to] ?? 0;
    setLastCombat({
      from: action.from, to: action.to,
      attacker: s.players[s.turnPointer]?.id ?? playerCtxRef.current.myId,
      defender: s.owner[action.to]!,
      attackerRolls: action.attackerRolls, defenderRolls: action.defenderRolls,
      attackerLosses, defenderLosses,
      captured: defenderLosses >= defArmies,
    });
    setCombatSeq((n) => n + 1);
  }
  const showCombatRef = useRef(showCombat);
  showCombatRef.current = showCombat;

  function runBlitz(from: TerritoryId, to: TerritoryId, keepBehind = 1) {
    const s = stateRef.current;
    const result = resolveBlitz(s, from, to, () => Math.random(), keepBehind, s.config.dice);
    const { rounds, state: finalState } = result;
    if (rounds.length === 0) return;
    const attacker = s.players[s.turnPointer]?.id ?? playerCtxRef.current.myId;
    let i = 0;
    function showNext() {
      const round = rounds[i]!;
      setLastCombat({
        from, to, attacker,
        defender: s.owner[to]!,
        attackerRolls: round.attackerRolls,
        defenderRolls: round.defenderRolls,
        attackerLosses: round.attackerLosses,
        defenderLosses: round.defenderLosses,
        captured: round.captured,
      });
      setCombatSeq((n) => n + 1);
      i++;
      if (i < rounds.length) {
        setTimeout(showNext, 420);
      } else {
        setTimeout(() => {
          setState(finalState);
          setSelected(null);
          setSelectedCards([]);
        }, 620);
      }
    }
    setSelected(null);
    showNext();
  }

  // ── Whose turn? ────────────────────────────────────────────────────────────
  // In single-player: myId = 'You', isMyTurn ≡ isHumanTurn
  // In online: myId = seatId, isMyTurn = current seat === myId
  const myId = playerCtx.myId;
  const isMyTurn = state.players[state.turnPointer]?.id === myId;
  // kept for compat with AI loop (SP only)
  const isHumanTurn = isMyTurn;

  // ── Online: register socket event handlers when entering game ──────────────
  useEffect(() => {
    if (!isOnline || screen !== 'game') return;

    net.offAll();
    net.onStateUpdate(({ state: wire, lastAction }) => {
      const s = rehydrate(wire, stateRef.current.config);
      // Show combat animation for remote ATTACK actions
      if (lastAction?.type === 'ATTACK') {
        showCombatRef.current(stateRef.current, lastAction);
      }
      setState(s);
      setSelected(null);
      setSelectedCards([]);
    });
    net.onNetError(({ message }) => {
      console.warn('Server error:', message);
    });

    return () => { net.offAll(); };
  }, [isOnline, screen]);

  // ── Single-player: CPU automation ─────────────────────────────────────────
  const aiActive = useRef(false);

  useEffect(() => {
    if (isOnline) return; // server drives all non-human turns in online mode
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
      const curId = s.players[s.turnPointer]?.id;
      if (s.winner !== null || curId === myId || curId === NEUTRAL_ID || curId === ZOMBIE_ID) { finish(); return; }
      const action = chooseAction(s, rng);
      if (action.type === 'ATTACK') showCombatRef.current(s, action);
      dispatchRef.current(action);
      timer = setTimeout(step, s.phase === 'setup' ? 180 : CPU_DELAY_MS);
    }

    const firstDelay = state.phase === 'setup' ? 220 : 450;
    timer = setTimeout(step, firstDelay);
    return () => { cancelled = true; clearTimeout(timer); aiActive.current = false; };
  }, [isOnline, screen, isHumanTurn, state.winner, state.turnPointer, state.phase, myId]);

  // ── Per-turn countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    const timerSecs = state.config.turnTimer ?? 0;
    if (screen !== 'game' || !isMyTurn || state.phase === 'setup' || state.winner !== null || timerSecs <= 0) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(timerSecs);
    const intervalId = setInterval(() => {
      setSecondsLeft((prev) => (prev === null || prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [screen, isMyTurn, state.turnPointer, state.phase, state.winner]);

  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (!isMyTurn || screen !== 'game' || state.winner !== null || state.phase === 'setup') return;
    const next = forceEndTurn(stateRef.current, myId);
    if (isOnline) {
      // best-effort: send END_PHASE actions to drain the turn
      net.sendAction({ type: 'END_PHASE' });
    } else {
      setState(next);
    }
    setSelected(null);
    setSelectedCards([]);
    setPendingMove(null);
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Human click handler ────────────────────────────────────────────────────
  const phase = state.phase;

  const onTerritoryClick = useCallback((id: TerritoryId) => {
    if (!isMyTurn || state.winner !== null || state.mustTradeCards) return;
    if (pendingMove) return;

    const batch = state.config.placement === 'batch';

    if (phase === 'setup') {
      const pool = state.setupRemaining[myId] ?? 0;
      if (state.owner[id] !== myId || pool <= 0) return;
      if (batch && pool > 1) {
        setPendingMove({ kind: 'place', territory: id, min: 1, max: pool });
      } else {
        dispatch({ type: 'REINFORCE', territory: id, count: 1 });
      }
      return;
    }

    if (phase === 'reinforce') {
      if (state.owner[id] !== myId || state.reinforcementsRemaining <= 0) return;
      if (batch && state.reinforcementsRemaining > 1) {
        setPendingMove({ kind: 'place', territory: id, min: 1, max: state.reinforcementsRemaining });
      } else {
        dispatch({ type: 'REINFORCE', territory: id, count: 1 });
      }
      return;
    }

    if (phase === 'attack') {
      if (selected === null) {
        if (state.owner[id] === myId && (state.armies[id] ?? 0) >= 2) setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] !== myId) {
        if (!validateAttack(state, selected, id).ok) return;
        if (blitzMode && !isOnline) {
          const committable = (state.armies[selected] ?? 0) - 1;
          if (committable > 2) {
            setPendingMove({ kind: 'blitz', from: selected, to: id, min: 2, max: committable });
          } else {
            runBlitz(selected, id);
          }
          return;
        }
        const fromArmies = state.armies[selected] ?? 0;
        const toArmies   = state.armies[id] ?? 0;
        const attackerRolls = rollDiceForMode(attackDiceCount(fromArmies), Math.random, state.config.dice);
        const defenderRolls = rollDiceForMode(defenseDiceCount(toArmies),  Math.random, state.config.dice);
        const { attackerLosses, defenderLosses } = resolveCombat(attackerRolls, defenderRolls);
        const captured = toArmies - defenderLosses <= 0;

        if (captured) {
          const min = Math.max(1, attackerRolls.length);
          const max = (fromArmies - attackerLosses) - 1;
          showCombat(state, { type: 'ATTACK', from: selected, to: id, attackerRolls, defenderRolls });
          if (max > min) {
            setPendingMove({ kind: 'capture', from: selected, to: id, min, max, attackerRolls, defenderRolls });
          } else {
            dispatch({ type: 'ATTACK', from: selected, to: id, attackerRolls, defenderRolls, moveOnCapture: max });
          }
          return;
        }

        const action: Action = { type: 'ATTACK', from: selected, to: id, attackerRolls, defenderRolls };
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
        if (state.owner[id] === myId && (state.armies[id] ?? 0) >= 2) setSelected(id);
      } else if (selected === id) {
        setSelected(null);
      } else if (state.owner[id] === myId) {
        if (!validateFortify(state, selected, id, 1).ok) return;
        const max = (state.armies[selected] ?? 0) - 1;
        if (max < 1) return;
        if (max === 1) {
          dispatch({ type: 'FORTIFY', from: selected, to: id, count: 1 });
        } else {
          setPendingMove({ kind: 'fortify', from: selected, to: id, min: 1, max });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, state, selected, phase, pendingMove, myId, blitzMode, isOnline]);

  function onConfirmMove(count: number) {
    const pm = pendingMove;
    if (!pm) return;
    setPendingMove(null);
    if (pm.kind === 'place') {
      dispatch({ type: 'REINFORCE', territory: pm.territory, count });
    } else if (pm.kind === 'fortify') {
      dispatch({ type: 'FORTIFY', from: pm.from, to: pm.to, count });
    } else if (pm.kind === 'blitz') {
      const keepBehind = (stateRef.current.armies[pm.from] ?? 0) - count;
      runBlitz(pm.from, pm.to, Math.max(1, keepBehind));
    } else {
      dispatch({
        type: 'ATTACK', from: pm.from, to: pm.to,
        attackerRolls: pm.attackerRolls, defenderRolls: pm.defenderRolls,
        moveOnCapture: count,
      });
    }
  }

  function onCancelMove() {
    setPendingMove(null);
    setSelected(null);
  }

  function onEndPhase() {
    if (!isMyTurn || state.winner !== null) return;
    try { dispatch({ type: 'END_PHASE' }); } catch { /* reducer rejected */ }
  }

  function onToggleCard(i: number) {
    setSelectedCards((sel) =>
      sel.includes(i) ? sel.filter((x) => x !== i) : sel.length < 3 ? [...sel, i] : sel,
    );
  }

  function onTradeSelected() {
    if (selectedCards.length !== 3) return;
    if (!isMyTurn) return;
    if (state.phase !== 'reinforce' && !state.mustTradeCards) return;
    const [a, b, c] = [...selectedCards].sort((x, y) => x - y);
    dispatch({ type: 'TRADE_IN', cardIndices: [a!, b!, c!] });
  }

  function resetCommon() {
    setSelected(null); setHovered(null);
    setSelectedCards([]); setLastCombat(null);
    setPendingMove(null);
    setAiRunning(false);
    aiActive.current = false;
  }

  function onStart(config: GameConfig) {
    setState(buildInitialState(config));
    setPlayerCtx(DEFAULT_PLAYER_CTX);
    setIsOnline(false);
    resetCommon();
    setScreen('game');
  }

  function onRestart() {
    resetCommon();
    net.offAll();
    setIsOnline(false);
    setPlayerCtx(DEFAULT_PLAYER_CTX);
    setScreen('menu');
  }

  // ── Highlight sets ─────────────────────────────────────────────────────────

  const validTargets = useMemo(() => {
    const s = new Set<TerritoryId>();
    if (!isMyTurn || selected === null) return s;
    if (phase === 'attack') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] !== myId && validateAttack(state, selected, id).ok)
          s.add(id);
      }
    } else if (phase === 'fortify') {
      for (const id of ALL_TERRITORY_IDS) {
        if (state.owner[id] === myId && id !== selected &&
            connectedThroughOwned(state, myId, selected, id))
          s.add(id);
      }
    }
    return s;
  }, [isMyTurn, selected, phase, state, myId]);

  const hoverTargets = useMemo(() => {
    const s = new Set<TerritoryId>();
    if (!isMyTurn || selected !== null || !hovered || phase !== 'attack') return s;
    if (state.owner[hovered] === myId && (state.armies[hovered] ?? 0) >= 2) {
      for (const n of neighbors(hovered)) {
        if (state.owner[n] !== myId && validateAttack(state, hovered, n).ok)
          s.add(n);
      }
    }
    return s;
  }, [isMyTurn, selected, hovered, phase, state, myId]);

  // ── Screen routing ─────────────────────────────────────────────────────────

  if (screen === 'menu') {
    return (
      <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#07101d' }}>
        <MainMenu
          onSinglePlayer={() => setScreen('setup')}
          onMultiplayer={() => setScreen('lobby')}
        />
      </div>
    );
  }

  if (screen === 'setup') {
    return (
      <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#07101d' }}>
        <SetupScreen onStart={onStart} />
      </div>
    );
  }

  if (screen === 'lobby') {
    return (
      <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#07101d' }}>
        <LobbyScreen
          onGameReady={({ config, mySeat, seatToken, code, playerColors, playerNames, wireState }) => {
            const ctx = buildPlayerCtx(mySeat, playerColors, playerNames);
            setPlayerCtx(ctx);
            setIsOnline(true);
            setOnlineCode(code);
            setOnlineToken(seatToken);
            setState(rehydrate(wireState, config));
            resetCommon();
            setScreen('game');
          }}
          onBack={() => setScreen('menu')}
        />
      </div>
    );
  }

  // ── Game screen ────────────────────────────────────────────────────────────

  return (
    <PlayerContext.Provider value={playerCtx}>
      <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', position: 'relative', background: '#091524' }}>
        <Board
          state={state}
          selected={selected}
          validTargets={validTargets}
          hoverTargets={hoverTargets}
          hovered={hovered}
          onTerritoryClick={onTerritoryClick}
          onHover={setHovered}
          showBonusContinents={showContinents}
        />

        <DicePanel result={lastCombat} seq={combatSeq} />
        <Roster state={state} />
        <PhaseHud
          state={state}
          isHumanTurn={isMyTurn}
          aiRunning={aiRunning}
          selected={selected}
          onEndPhase={onEndPhase}
          blitzMode={blitzMode}
          {...(!isOnline ? { onToggleBlitz: () => setBlitzMode((b) => !b) } : {})}
          secondsLeft={secondsLeft}
        />
        <CornerControls
          state={state}
          isHumanTurn={isMyTurn}
          selectedCards={selectedCards}
          onToggleCard={onToggleCard}
          onTradeSelected={onTradeSelected}
          onRestart={onRestart}
          continentsShown={showContinents}
          onToggleContinents={() => setShowContinents((v) => !v)}
        />

        {pendingMove && (
          <ArmyMoveDial
            kind={pendingMove.kind}
            from={pendingMove.kind === 'place' ? pendingMove.territory : pendingMove.from}
            to={pendingMove.kind === 'place' ? pendingMove.territory : pendingMove.to}
            min={pendingMove.min}
            max={pendingMove.max}
            color={playerCtx.playerColors[myId] ?? '#3d7fd6'}
            map={state.map}
            onConfirm={onConfirmMove}
            {...(pendingMove.kind !== 'capture' ? { onCancel: onCancelMove } : {})}
          />
        )}

        {state.winner !== null && (
          <WinnerBanner
            winner={state.winner}
            mode={state.config.mode}
            playerColors={playerCtx.playerColors}
            {...(state.teamAssignments ? { teamAssignments: state.teamAssignments } : {})}
            onRestart={onRestart}
          />
        )}
      </div>
    </PlayerContext.Provider>
  );
}

// ---------------------------------------------------------------------------

const WIN_FLAVOR: Record<GameMode, { icon: string; text: string }> = {
  world:      { icon: '🌍', text: 'World domination achieved.' },
  domination: { icon: '🌍', text: 'Domination threshold reached.' },
  turnlimit:  { icon: '⏱️', text: 'Most territories when time ran out.' },
  capitals:   { icon: '🏛️', text: 'All capitals captured.' },
  missions:   { icon: '🎯', text: 'Secret mission completed.' },
  twoplayer:  { icon: '🌍', text: 'Last commander standing.' },
  zombies:    { icon: '🧟', text: 'The horde is held at bay — world secured.' },
  assassin:   { icon: '🗡️', text: 'Target eliminated.' },
  blizzards:  { icon: '❄️', text: 'World domination achieved.' },
  portals:    { icon: '🌀', text: 'World domination achieved.' },
};

function WinnerBanner({
  winner, mode, teamAssignments, playerColors, onRestart,
}: {
  winner: PlayerId;
  mode: GameMode;
  teamAssignments?: Readonly<Record<PlayerId, string>>;
  playerColors: Record<string, string>;
  onRestart: () => void;
}) {
  const color = playerColors[winner] ?? '#fff';
  const flavor = WIN_FLAVOR[mode] ?? WIN_FLAVOR.world;
  const teamName = teamAssignments?.[winner];
  const label = teamName ? `Team ${teamName} wins!` : `${winner} wins!`;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,6,14,0.88)', zIndex: 10,
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0C1528 0%, #091320 100%)',
        border: `1px solid rgba(196,146,42,0.22)`,
        borderRadius: 20,
        padding: '52px 76px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 0 90px ${color}28, 0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.8)`,
      }}>
        <svg aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.055, pointerEvents: 'none' }} width={220} height={220} viewBox="-110 -110 220 220">
          <circle r={96} fill="none" stroke="#C4922A" strokeWidth={0.6}/>
          <circle r={64} fill="none" stroke="#C4922A" strokeWidth={0.6}/>
          <circle r={32} fill="none" stroke="#C4922A" strokeWidth={0.5}/>
          {([0,90] as number[]).map(deg=>{ const r=deg*Math.PI/180,cx=Math.cos(r),cy=Math.sin(r); return <line key={deg} x1={-cx*106} y1={-cy*106} x2={cx*106} y2={cy*106} stroke="#C4922A" strokeWidth={0.55}/>; })}
          {([45,135] as number[]).map(deg=>{ const r=deg*Math.PI/180,cx=Math.cos(r),cy=Math.sin(r); return <line key={deg} x1={-cx*76} y1={-cy*76} x2={cx*76} y2={cy*76} stroke="#C4922A" strokeWidth={0.35}/>; })}
        </svg>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>{flavor.icon}</div>
          <div style={{ fontSize: 9, letterSpacing: 5, color: '#C4922A', fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>{flavor.text}</div>
          <div style={{
            fontSize: 30, fontWeight: 900, color, marginBottom: 8,
            fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: 1,
          }}>{label}</div>
          <div style={{ color: '#7a8a9e', marginBottom: 30, fontSize: 12 }}>The battle for the world is over.</div>
          <button onClick={onRestart} style={{
            background: 'linear-gradient(135deg, #8B6214 0%, #C4922A 40%, #E8B84B 70%, #C4922A 100%)',
            color: '#FFF8EC', border: 'none', borderRadius: 12,
            padding: '13px 36px', fontSize: 14, fontWeight: 800,
            letterSpacing: 2.5, cursor: 'pointer', textTransform: 'uppercase',
            boxShadow: '0 4px 24px rgba(196,146,42,0.32)',
          }}>Play Again →</button>
        </div>
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
