import { CONTINENTS } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';

interface Props {
  state: GameState;
}

export function Roster({ state }: Props) {
  const currentId = state.players[state.turnPointer]?.id;

  return (
    <div style={rosterWrap}>
      {state.players.map((player) => {
        const id = player.id;
        const color = PLAYER_COLORS[id] ?? '#5a6272';
        const terrs = Object.values(state.owner).filter((o) => o === id).length;
        const armies = Object.entries(state.armies)
          .filter(([t]) => state.owner[t as keyof typeof state.owner] === id)
          .reduce((s, [, n]) => s + n, 0);
        const conts = Object.values(CONTINENTS).filter(
          (c) => c.territories.every((t) => state.owner[t] === id),
        ).length;
        const isCurrent = id === currentId;

        return (
          <div
            key={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px 8px 10px',
              borderRadius: 12,
              background: isCurrent
                ? `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(0,0,0,0.25))`
                : 'rgba(6,12,24,0.60)',
              border: `1px solid ${isCurrent ? color + '55' : 'rgba(255,255,255,0.06)'}`,
              boxShadow: isCurrent ? `0 0 16px ${color}40, inset 0 0 0 1px ${color}30` : 'none',
              backdropFilter: 'blur(10px)',
              opacity: player.alive ? 1 : 0.38,
              transition: 'all .2s',
              minWidth: 178,
            }}
          >
            {/* Avatar with glow ring when it's this player's turn */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {isCurrent && (
                <div style={{
                  position: 'absolute',
                  inset: -4,
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                  boxShadow: `0 0 10px ${color}99`,
                  animation: 'rosterPulse 2s ease-in-out infinite',
                }} />
              )}
              <PlayerAvatar color={color} id={id} alive={player.alive} />
            </div>

            {/* Stats */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontWeight: 800, color, fontSize: 12,
                  letterSpacing: 0.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{id}</span>
                {!player.alive && (
                  <span style={{ color: '#555', fontSize: 10, fontWeight: 600 }}>ELIM</span>
                )}
                {isCurrent && player.alive && (
                  <span style={{
                    marginLeft: 'auto', color, fontSize: 9, fontWeight: 700,
                    letterSpacing: 1, opacity: 0.9,
                  }}>▶ TURN</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8a9ab0' }}>
                <StatBadge value={terrs}   label="ter" color={color} />
                <StatBadge value={armies}  label="arm" color={color} />
                {conts > 0 && <StatBadge value={conts} label="con" color="#ffd23f" />}
                {player.cards.length > 0 && (
                  <StatBadge value={player.cards.length} label="crd" color="#b080ff" />
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes rosterPulse { 0%,100%{opacity:.7} 50%{opacity:1} }`}</style>
    </div>
  );
}

function StatBadge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
      <span style={{ fontWeight: 700, color, fontSize: 11 }}>{value}</span>
      <span style={{ color: '#6a7a8a', fontSize: 9 }}>{label}</span>
    </span>
  );
}

function PlayerAvatar({ color, id, alive }: { color: string; id: string; alive: boolean }) {
  const size = 36;
  const r = size / 2;
  const initial = id.charAt(0).toUpperCase();
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, opacity: alive ? 1 : 0.4 }}>
      {/* Coin-like gradient */}
      <defs>
        <radialGradient id={`av-${id.replace(/\s/g, '')}`} cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor={lightenColor(color, 0.4)} />
          <stop offset="55%"  stopColor={color} />
          <stop offset="100%" stopColor={darkenColor(color, 0.3)} />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r + 1.5} r={r - 1} fill="rgba(0,0,0,0.4)" />
      <circle cx={r} cy={r} r={r - 1} fill={`url(#av-${id.replace(/\s/g, '')})`} />
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke={darkenColor(color, 0.35)} strokeWidth={1.5} />
      <ellipse cx={r - 3} cy={r - 4} rx={4.5} ry={2.8} fill="rgba(255,255,255,0.25)" />
      <text x={r} y={r + 0.5}
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.4} fontWeight={800}
        fill="#fff"
        fontFamily="system-ui, sans-serif"
        style={{ userSelect: 'none' }}
      >{initial}</text>
    </svg>
  );
}

function lightenColor(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + Math.round(amt * 255));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round(amt * 255));
  const b = Math.min(255, (n & 0xff) + Math.round(amt * 255));
  return `rgb(${r},${g},${b})`;
}
function darkenColor(hex: string, amt: number): string {
  return lightenColor(hex, -amt);
}

const rosterWrap: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 4,
  pointerEvents: 'none',
};
