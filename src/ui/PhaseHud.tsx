import { memo } from 'react';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  aiRunning: boolean;
  selected: string | null;
  onEndPhase: () => void;
  blitzMode?: boolean;
  onToggleBlitz?: () => void;
  secondsLeft?: number | null;
}

const PHASE_META: Record<string, { label: string; color: string }> = {
  setup:     { label: 'SETUP',     color: '#9b7de8' },
  reinforce: { label: 'REINFORCE', color: '#5ba3e8' },
  attack:    { label: 'ATTACK',    color: '#e05545' },
  fortify:   { label: 'FORTIFY',   color: '#5ab06a' },
};

function fmtSeconds(sec: number): string {
  const m = Math.floor(sec / 60).toString();
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const PhaseHud = memo(function PhaseHud({
  state, isHumanTurn, aiRunning, selected, onEndPhase, blitzMode, onToggleBlitz, secondsLeft,
}: Props) {
  const current = state.players[state.turnPointer];
  if (!current) return null;

  const phase = state.phase;
  const meta  = PHASE_META[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  const rem   = state.reinforcementsRemaining;
  const color = PLAYER_COLORS[current.id] ?? '#5a6272';

  const canEnd = isHumanTurn && !state.mustTradeCards && (
    (phase === 'reinforce' && rem === 0) ||
    phase === 'attack' ||
    phase === 'fortify'
  );

  const setupLeft = state.setupRemaining[current.id] ?? 0;

  const hint = isHumanTurn
    ? phase === 'setup'
        ? `Place ${setupLeft} arm${setupLeft === 1 ? 'y' : 'ies'} — click your territories`
      : phase === 'reinforce'
        ? (rem > 0 ? `Place ${rem} arm${rem === 1 ? 'y' : 'ies'}` : 'All placed — end phase')
      : phase === 'attack'
        ? (selected ? `${selected.replace(/-/g, ' ')} — click an enemy` : 'Select a territory (≥2) to attack')
        : state.fortifiedThisTurn
          ? 'Fortified — end turn'
          : (selected ? 'Click a connected territory' : 'Move armies between territories')
    : aiRunning ? `${current.id} is thinking…` : 'Waiting…';

  return (
    <>
      <style>{`
        .hud-end:not([disabled]):hover { filter: brightness(1.15) !important; }
        .hud-blitz:hover { filter: brightness(1.12) !important; }
      `}</style>
      <div style={{
        ...hudWrap,
        borderColor: isHumanTurn ? 'rgba(196,146,42,0.28)' : 'rgba(255,255,255,0.07)',
        boxShadow: isHumanTurn
          ? '0 8px 44px rgba(0,0,0,0.7), 0 0 0 1px rgba(196,146,42,0.08)'
          : '0 8px 44px rgba(0,0,0,0.7)',
      }}>
        <PlayerDisc color={color} id={current.id} />

        {/* Phase label + player + hint */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              borderLeft: `2.5px solid ${meta.color}`,
              paddingLeft: 8,
              color: meta.color,
              fontSize: 9, fontWeight: 800, letterSpacing: 2.5,
              lineHeight: 1, whiteSpace: 'nowrap',
            }}>{meta.label}</span>

            <span style={{ color, fontWeight: 700, fontSize: 13 }}>{current.id}</span>

            {phase === 'reinforce' && rem > 0 && (
              <span style={{
                background: 'rgba(196,146,42,0.18)', color: '#E8B84B',
                border: '1px solid rgba(196,146,42,0.42)',
                fontSize: 11, fontWeight: 800,
                minWidth: 24, height: 22, borderRadius: 10, padding: '0 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{rem}</span>
            )}
          </div>
          <span style={{
            fontSize: 11, color: '#7A92AE',
            maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{hint}</span>
        </div>

        {/* Blitz toggle */}
        {isHumanTurn && state.winner === null && phase === 'attack' && onToggleBlitz && (
          <button
            className="hud-blitz"
            onClick={onToggleBlitz}
            title="Blitz: auto-repeat attacks until capture or can't continue"
            style={{
              background: blitzMode ? 'rgba(192,57,43,0.22)' : 'rgba(192,57,43,0.06)',
              color: blitzMode ? '#ff8070' : '#a06050',
              border: `1px solid ${blitzMode ? 'rgba(220,70,50,0.5)' : 'rgba(192,57,43,0.18)'}`,
              borderRadius: 8, padding: '6px 14px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', letterSpacing: 0.3, transition: 'all .12s',
            }}
          >
            ⚡ {blitzMode ? 'BLITZ ON' : 'Blitz'}
          </button>
        )}

        {/* Turn timer countdown */}
        {isHumanTurn && secondsLeft != null && secondsLeft > 0 && (
          <span style={{
            fontSize: secondsLeft <= 10 ? 15 : 13, fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: secondsLeft <= 10 ? '#ef4444' : secondsLeft <= 30 ? '#f59e0b' : '#7A92AE',
            minWidth: 36, textAlign: 'center', transition: 'color .3s',
          }}>
            {fmtSeconds(secondsLeft)}
          </span>
        )}

        {/* End Phase / End Turn */}
        {isHumanTurn && state.winner === null && phase !== 'setup' && (
          <button
            className="hud-end"
            onClick={onEndPhase}
            disabled={!canEnd}
            style={{
              background: canEnd
                ? 'linear-gradient(135deg, #1a4a28 0%, #2e6e3e 100%)'
                : 'transparent',
              color: canEnd ? '#7ed98b' : '#3d5a43',
              border: `1px solid ${canEnd ? 'rgba(74,158,92,0.5)' : 'rgba(74,158,92,0.12)'}`,
              borderRadius: 8, padding: '7px 18px',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              cursor: canEnd ? 'pointer' : 'default',
              whiteSpace: 'nowrap', transition: 'all .15s',
            }}
          >
            {phase === 'fortify' ? '↺ End Turn' : 'End Phase →'}
          </button>
        )}

        {!isHumanTurn && aiRunning && <Spinner />}
      </div>
    </>
  );
});

function PlayerDisc({ color, id }: { color: string; id: string }) {
  const size = 40;
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={`hud-av-${id.replace(/\s/g,'')}`} cx="38%" cy="30%" r="68%">
          <stop offset="0%"   stopColor={`color-mix(in srgb, ${color} 50%, white)`} />
          <stop offset="100%" stopColor={`color-mix(in srgb, ${color} 80%, black)`} />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r + 1.5} r={r - 2} fill="rgba(0,0,0,0.35)" />
      <circle cx={r} cy={r}       r={r - 2} fill={color} />
      <circle cx={r} cy={r}       r={r - 2} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
      <ellipse cx={r - 4} cy={r - 5} rx={5} ry={3} fill="rgba(255,255,255,0.22)" />
      <text x={r} y={r + 0.5}
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.4} fontWeight={800}
        fill="#fff" fontFamily="system-ui, sans-serif"
        style={{ userSelect: 'none' }}
      >{id.charAt(0).toUpperCase()}</text>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: '#7A92AE',
          animation: `hudSpinPulse 1.2s ${i * 0.25}s infinite alternate`,
        }} />
      ))}
      <style>{`
        @keyframes hudSpinPulse { from{opacity:.12} to{opacity:.8} }
        @media (prefers-reduced-motion: reduce) { .hud-spinner > div { animation: none !important; opacity: .5; } }
      `}</style>
    </div>
  );
}

const hudWrap: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'rgba(6,12,22,0.97)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  padding: '12px 22px',
  boxShadow: '0 8px 44px rgba(0,0,0,0.7)',
  zIndex: 4,
  pointerEvents: 'auto',
};
