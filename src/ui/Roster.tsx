import { memo } from 'react';
import { CONTINENTS } from '../engine/map';
import type { GameState } from '../engine/state';
import { usePlayer } from './PlayerContext';

interface Props { state: GameState; }

export const Roster = memo(function Roster({ state }: Props) {
  const { playerColors } = usePlayer();
  const currentId = state.players[state.turnPointer]?.id;

  return (
    <div style={rosterWrap}>
      {state.players.map((player) => {
        const id      = player.id;
        const color   = playerColors[id] ?? '#5a6272';
        const terrs   = Object.values(state.owner).filter((o) => o === id).length;
        const armies  = Object.entries(state.armies)
          .filter(([t]) => state.owner[t as keyof typeof state.owner] === id)
          .reduce((s, [, n]) => s + n, 0);
        const conts   = Object.values(CONTINENTS).filter(
          (c) => c.territories.every((t) => state.owner[t] === id),
        ).length;
        const isCurrent = id === currentId;

        return (
          <div key={id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px 8px 10px', borderRadius: 12,
            background: isCurrent ? 'rgba(8,14,26,0.97)' : 'rgba(6,12,22,0.94)',
            border: `1px solid ${isCurrent ? color + '55' : 'rgba(255,255,255,0.06)'}`,
            boxShadow: isCurrent
              ? `0 0 18px ${color}35, inset 0 0 0 1px ${color}20`
              : 'none',
            opacity: player.alive ? 1 : 0.35,
            transition: 'all .2s',
            minWidth: 170,
          }}>
            {/* Avatar with glow ring when active */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {isCurrent && (
                <div style={{
                  position: 'absolute', inset: -4, borderRadius: '50%',
                  border: `2px solid ${color}`,
                  boxShadow: `0 0 10px ${color}99`,
                  animation: 'rosterPulse 2s ease-in-out infinite',
                }} />
              )}
              <PlayerAvatar color={color} id={id} alive={player.alive} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Name row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                  fontWeight: 800, color, fontSize: 12, letterSpacing: 0.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{id}</span>

                {state.teamAssignments?.[id] && (() => {
                  const team = state.teamAssignments![id]!;
                  const isA  = team === 'A';
                  return (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                      padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                      background: isA ? 'rgba(61,127,214,0.28)' : 'rgba(192,112,64,0.28)',
                      color:      isA ? '#7ab4ff'               : '#ffaa70',
                      border:     `1px solid ${isA ? 'rgba(61,127,214,0.42)' : 'rgba(192,112,64,0.42)'}`,
                    }}>{team}</span>
                  );
                })()}

                {!player.alive && (
                  <span style={{
                    color: '#3D5068', fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '0 4px',
                  }}>ELIM</span>
                )}

                {isCurrent && player.alive && (
                  <span style={{
                    marginLeft: 'auto', color: '#C4922A',
                    fontSize: 9, fontWeight: 700, letterSpacing: 1.2,
                  }}>● TURN</span>
                )}
              </div>

              {/* Stat dials — labels above, numbers large */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <StatDial label="TER" value={terrs}  color={color} />
                <StatDial label="ARM" value={armies} color={color} prominent />
                {conts > 0 && <StatDial label="CON" value={conts} color="#E8B84B" />}
                {player.cards.length > 0 && (
                  <StatDial label="CRD" value={player.cards.length} color="#9b7de8" />
                )}
              </div>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes rosterPulse { 0%,100%{opacity:.7} 50%{opacity:1} }
        @media (prefers-reduced-motion: reduce) {
          [style*="rosterPulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
});

function StatDial({ label, value, color, prominent }: {
  label: string; value: number; color: string; prominent?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      <span style={{
        fontSize: 7, fontWeight: 700, letterSpacing: 1.2,
        color: '#3D5068', textTransform: 'uppercase' as const, lineHeight: 1,
      }}>{label}</span>
      <span style={{
        fontSize: prominent ? 18 : 15, fontWeight: 800, color,
        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
      }}>{value}</span>
    </div>
  );
}

function PlayerAvatar({ color, id, alive }: { color: string; id: string; alive: boolean }) {
  const size = 34;
  const r    = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, opacity: alive ? 1 : 0.4 }}>
      <defs>
        <radialGradient id={`av-${id.replace(/\s/g, '')}`} cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor={lightenColor(color, 0.4)} />
          <stop offset="55%"  stopColor={color} />
          <stop offset="100%" stopColor={darkenColor(color, 0.3)} />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r + 1.5} r={r - 1} fill="rgba(0,0,0,0.4)" />
      <circle cx={r} cy={r}       r={r - 1} fill={`url(#av-${id.replace(/\s/g, '')})`} />
      <circle cx={r} cy={r}       r={r - 1} fill="none" stroke={darkenColor(color, 0.35)} strokeWidth={1.5} />
      <ellipse cx={r - 3} cy={r - 4} rx={4.5} ry={2.8} fill="rgba(255,255,255,0.25)" />
      <text x={r} y={r + 0.5}
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.4} fontWeight={800} fill="#fff"
        fontFamily="system-ui, sans-serif" style={{ userSelect: 'none' }}
      >{id.charAt(0).toUpperCase()}</text>
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
function darkenColor(hex: string, amt: number): string { return lightenColor(hex, -amt); }

const rosterWrap: React.CSSProperties = {
  position: 'absolute', top: 14, right: 14,
  display: 'flex', flexDirection: 'column', gap: 5,
  zIndex: 4, pointerEvents: 'none',
};
