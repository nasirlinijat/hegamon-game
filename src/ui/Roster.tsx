import { CONTINENTS } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { Avatar } from './Avatar';

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
          (c) => c.territories.every((t) => state.owner[t] === id)
        ).length;
        const isCurrent = id === currentId;

        return (
          <div key={id} style={{
            ...playerCard,
            borderLeft: `3px solid ${isCurrent ? color : 'transparent'}`,
            background: isCurrent ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)',
            opacity: player.alive ? 1 : 0.45,
          }}>
            <Avatar playerId={id} size={34} alive={player.alive} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, color, fontSize: 13 }}>{id}</span>
                {!player.alive && <span style={{ color: '#666', fontSize: 11 }}>(out)</span>}
                {isCurrent && <span style={{ color: '#aaa', fontSize: 10, marginLeft: 'auto' }}>▶</span>}
              </div>
              <div style={{ fontSize: 11, color: '#8a9ab0', marginTop: 2 }}>
                {terrs} ter · {armies} armies · {conts} cont
              </div>
              <div style={{ fontSize: 11, color: '#8a9ab0' }}>
                {player.cards.length} card{player.cards.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
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

const playerCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  backdropFilter: 'blur(8px)',
  minWidth: 170,
  transition: 'background .15s',
};
