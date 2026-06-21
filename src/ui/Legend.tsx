import { useState } from 'react';
import { tradeInValue } from '../engine/cards';
import type { GameState } from '../engine/state';
import { CONTINENT_TINT } from './territory-shapes';

interface Props {
  state: GameState;
}

const TINT = CONTINENT_TINT as Record<string, string>;

export function Legend({ state }: Props) {
  // Continents come from the active board, so the key reflects whichever map is in play.
  const continents = Object.values(state.map.continents);
  const [open, setOpen] = useState(true);

  // Next 7 trade-in values starting from the current global counter.
  const cardValues = Array.from({ length: 7 }, (_, i) => ({
    value: tradeInValue(state.tradeInCount + i),
    isNext: i === 0,
  }));

  return (
    <div style={wrap}>
      <button onClick={() => setOpen((v) => !v)} style={titleBtn}>
        <span>MAP KEY</span>
        <span style={{ color: '#6f7a8a' }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', marginTop: 6 }}>
            {continents.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                  background: TINT[c.id] ?? '#8893a3', border: '1px solid rgba(0,0,0,0.4)',
                }} />
                <span style={{ fontSize: 11, color: '#c8d0da', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 11, color: '#7ed98b', fontWeight: 700, marginLeft: 'auto' }}>
                  +{c.bonus}
                </span>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0 6px' }} />

          <div style={{ fontSize: 10, color: '#6f7a8a', letterSpacing: 1, marginBottom: 4 }}>
            CARD SET VALUE
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {cardValues.map((c, i) => (
              <span key={i} style={{
                fontSize: 11, fontWeight: c.isNext ? 800 : 500,
                color: c.isNext ? '#ffd23f' : '#8a93a3',
                background: c.isNext ? 'rgba(255,210,63,0.16)' : 'transparent',
                border: c.isNext ? '1px solid rgba(255,210,63,0.5)' : '1px solid transparent',
                borderRadius: 4, padding: '1px 5px',
              }}>{c.value}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: 14,
  background: 'rgba(12,20,36,0.9)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '8px 12px 10px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
  zIndex: 4,
  minWidth: 188,
};

const titleBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: '#9aa4b2', padding: 0,
};
