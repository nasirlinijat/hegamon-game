import { useState } from 'react';
import { STARTING_ARMIES } from '../engine/state';
import { PLAYER_IDS, PLAYER_COLORS } from './App';
import { Avatar } from './Avatar';

interface Props {
  onStart: (numOpponents: number) => void;
}

const OPPONENT_CHOICES = [1, 2, 3, 4, 5];

export function SetupScreen({ onStart }: Props) {
  const [opponents, setOpponents] = useState(1);
  const total = opponents + 1;
  const startingArmies = STARTING_ARMIES[total]!;
  const roster = PLAYER_IDS.slice(0, total);

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 13, letterSpacing: 4, color: '#7a8699', fontWeight: 700 }}>WORLD CONQUEST</div>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 2, color: '#f3f6fb', marginBottom: 4 }}>RISK</div>
        <div style={{ color: '#8a9ab0', fontSize: 14, marginBottom: 28 }}>
          Choose how many CPU opponents to face.
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#6f7a8a', marginBottom: 8 }}>OPPONENTS</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          {OPPONENT_CHOICES.map((n) => {
            const active = n === opponents;
            return (
              <button
                key={n}
                onClick={() => setOpponents(n)}
                style={{
                  width: 56, height: 56, borderRadius: 12, cursor: 'pointer',
                  fontSize: 22, fontWeight: 800,
                  background: active ? '#3d7fd6' : 'rgba(255,255,255,0.06)',
                  color: active ? '#fff' : '#9aa4b2',
                  border: `2px solid ${active ? '#5b9af0' : 'rgba(255,255,255,0.1)'}`,
                  transition: 'all .12s',
                }}
              >{n}</button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#6f7a8a', marginBottom: 8 }}>
          PLAYERS ({total}) · {startingArmies} STARTING ARMIES EACH
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 30 }}>
          {roster.map((id, i) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Avatar playerId={id} size={28} color={PLAYER_COLORS[id]!} />
              <span style={{ fontSize: 13, color: i === 0 ? '#f3f6fb' : '#aab4c2', fontWeight: i === 0 ? 700 : 500 }}>
                {id}{i === 0 ? ' (you)' : ''}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => onStart(opponents)}
          style={{
            width: '100%', background: '#2e6e3e', color: '#fff', border: 'none',
            borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 800,
            letterSpacing: 1, cursor: 'pointer',
          }}
        >START GAME →</button>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'radial-gradient(ellipse at 50% 40%, #14304d, #07101d)',
};

const card: React.CSSProperties = {
  background: 'rgba(12,20,36,0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  padding: '36px 40px',
  width: 460,
  maxWidth: '90vw',
  boxShadow: '0 20px 70px rgba(0,0,0,0.6)',
};
