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
}

const PHASE_META: Record<string, { label: string; color: string }> = {
  setup:     { label: 'SETUP',     color: '#8a6bd6' },
  reinforce: { label: 'REINFORCE', color: '#4a90d9' },
  attack:    { label: 'ATTACK',    color: '#d65050' },
  fortify:   { label: 'FORTIFY',   color: '#4a9e5c' },
};

export function PhaseHud({
  state, isHumanTurn, aiRunning, selected, onEndPhase, blitzMode, onToggleBlitz,
}: Props) {
  const current = state.players[state.turnPointer];
  if (!current) return null;

  const phase = state.phase;
  const meta = PHASE_META[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  const rem  = state.reinforcementsRemaining;
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
        : state.fortifiedThisTurn ? 'Fortified — end turn' : (selected ? 'Click a connected territory' : 'Move armies between territories')
    : aiRunning ? `${current.id} is thinking…` : 'Waiting…';

  return (
    <div style={{ ...hudWrap, borderColor: `${color}30` }}>
      {/* Player avatar disc */}
      <PlayerDisc color={color} id={current.id} />

      {/* Phase label + hint */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: meta.color, color: '#fff',
            fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
            padding: '2px 9px', borderRadius: 4,
          }}>{meta.label}</span>
          <span style={{ color, fontWeight: 700, fontSize: 12 }}>{current.id}</span>
          {phase === 'reinforce' && rem > 0 && (
            <span style={{
              background: '#4a90d9', color: '#fff',
              fontSize: 11, fontWeight: 800,
              width: 22, height: 22, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{rem}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#8a9ab0', maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</span>
      </div>

      {/* Blitz toggle */}
      {isHumanTurn && state.winner === null && phase === 'attack' && onToggleBlitz && (
        <button
          onClick={onToggleBlitz}
          title="Blitz: auto-repeat attacks until capture or can't continue"
          style={{
            background: blitzMode ? '#c0392b' : 'rgba(192,57,43,0.15)',
            color: blitzMode ? '#fff' : '#e07060',
            border: `1.5px solid ${blitzMode ? '#e05545' : 'rgba(192,57,43,0.35)'}`,
            borderRadius: 8, padding: '5px 13px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', transition: 'all .12s',
          }}
        >
          ⚡ {blitzMode ? 'BLITZ ON' : 'Blitz'}
        </button>
      )}

      {/* End Phase / End Turn button */}
      {isHumanTurn && state.winner === null && phase !== 'setup' && (
        <button
          onClick={onEndPhase}
          disabled={!canEnd}
          style={{
            background: canEnd ? '#2e6e3e' : 'rgba(46,110,62,0.15)',
            color: canEnd ? '#fff' : '#3d5a43',
            border: 'none', borderRadius: 9,
            padding: '8px 20px', fontSize: 12, fontWeight: 800,
            cursor: canEnd ? 'pointer' : 'default',
            transition: 'background .15s, color .15s',
            whiteSpace: 'nowrap', letterSpacing: 0.5,
          }}
        >
          {phase === 'fortify' ? '⟳ End Turn' : 'End Phase →'}
        </button>
      )}

      {!isHumanTurn && aiRunning && <Spinner />}
    </div>
  );
}

function PlayerDisc({ color, id }: { color: string; id: string }) {
  const size = 42;
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
      <circle cx={r} cy={r} r={r - 2} fill={color} />
      <circle cx={r} cy={r} r={r - 2} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
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
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#d65050',
          animation: `phaseSpinPulse 1s ${i * 0.2}s infinite alternate`,
        }} />
      ))}
      <style>{`@keyframes phaseSpinPulse { from{opacity:.2} to{opacity:1} }`}</style>
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
  gap: 12,
  background: 'rgba(8,16,32,0.94)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  padding: '10px 20px',
  boxShadow: '0 6px 30px rgba(0,0,0,0.6)',
  backdropFilter: 'blur(12px)',
  zIndex: 4,
  pointerEvents: 'auto',
};
