import type { GameState } from '../engine/state';
import { Avatar } from './Avatar';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  aiRunning: boolean;
  selected: string | null;
  onEndPhase: () => void;
}

const PHASE_META: Record<string, { label: string; color: string }> = {
  setup:     { label: 'SETUP',     color: '#8a6bd6' },
  reinforce: { label: 'REINFORCE', color: '#4a90d9' },
  attack:    { label: 'ATTACK',    color: '#d65050' },
  fortify:   { label: 'FORTIFY',   color: '#4a9e5c' },
};

export function PhaseHud({ state, isHumanTurn, aiRunning, selected, onEndPhase }: Props) {
  const current = state.players[state.turnPointer];
  if (!current) return null;

  const phase = state.phase;
  const meta = PHASE_META[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  const rem = state.reinforcementsRemaining;

  const canEnd = isHumanTurn && !state.mustTradeCards && (
    (phase === 'reinforce' && rem === 0) ||
    phase === 'attack' ||
    phase === 'fortify'
  );

  const setupLeft = state.setupRemaining[current.id] ?? 0;

  const hint = isHumanTurn ? (
    phase === 'setup'
      ? `Place ${setupLeft} starting arm${setupLeft === 1 ? 'y' : 'ies'} — click your territories`
      : phase === 'reinforce'
      ? (rem > 0 ? `Place ${rem} arm${rem === 1 ? 'y' : 'ies'} — click your territories` : 'All placed — end phase')
      : phase === 'attack'
        ? (selected ? `${selected.replace(/-/g, ' ')} selected — click an enemy` : 'Click a territory (≥2) to attack')
        : state.fortifiedThisTurn ? 'Fortified — end your turn' : (selected ? 'Click connected territory to move' : 'Move armies between connected territories')
  ) : aiRunning ? 'CPU is moving…' : 'Waiting…';

  return (
    <div style={hudWrap}>
      <Avatar playerId={current.id} size={40} alive={current.alive} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <span style={{
          background: meta.color, color: '#fff', fontSize: 11, fontWeight: 700,
          letterSpacing: 1.2, padding: '2px 8px', borderRadius: 4,
        }}>{meta.label}</span>
        <span style={{ fontSize: 12, color: '#b0bec8', maxWidth: 240 }}>{hint}</span>
      </div>
      {isHumanTurn && state.winner === null && phase !== 'setup' && (
        <button
          onClick={onEndPhase}
          disabled={!canEnd}
          style={{
            marginLeft: 8,
            background: canEnd ? '#2e6e3e' : '#1e2d20',
            color: canEnd ? '#fff' : '#4a6350',
            border: 'none', borderRadius: 8,
            padding: '8px 18px', fontSize: 13, fontWeight: 700,
            cursor: canEnd ? 'pointer' : 'default',
            transition: 'background .15s, color .15s',
            whiteSpace: 'nowrap',
          }}
        >
          {phase === 'fortify' ? 'End Turn ⟳' : 'End Phase →'}
        </button>
      )}
      {!isHumanTurn && aiRunning && <Spinner />}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
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
  background: 'rgba(12,20,36,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '10px 18px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
  zIndex: 4,
  pointerEvents: 'auto',
};
