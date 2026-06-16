import { useEffect, useState } from 'react';
import { CONTINENTS, TERRITORIES } from '../engine/map';
import { isValidSet } from '../engine/cards';
import type { GameState } from '../engine/state';
import { HUMAN_ID } from './App';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  selectedCards: number[];
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
  onRestart: () => void;
}

export function CornerControls({
  state, isHumanTurn, selectedCards, onToggleCard, onTradeSelected, onRestart,
}: Props) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  const human = state.players.find((p) => p.id === HUMAN_ID);
  const cards = human?.cards ?? [];
  const cardCount = cards.length;
  const mustTrade = state.mustTradeCards;

  // Auto-open cards panel when a forced trade is required.
  useEffect(() => {
    if (mustTrade && isHumanTurn) setCardsOpen(true);
  }, [mustTrade, isHumanTurn]);

  const canTrade = selectedCards.length === 3 &&
    isValidSet([cards[selectedCards[0]!]!, cards[selectedCards[1]!]!, cards[selectedCards[2]!]!]);

  return (
    <div style={wrapStyle}>
      {/* Stats popover */}
      {statsOpen && (
        <div style={popoverStyle}>
          <div style={popTitle}>Reinforcement Breakdown</div>
          <ReinforceBreakdown state={state} />
        </div>
      )}

      {/* Cards tray */}
      {cardsOpen && isHumanTurn && (
        <div style={{ ...popoverStyle, minWidth: 200 }}>
          <div style={popTitle}>
            Cards
            {mustTrade && <span style={{ color: '#ff8c55', fontSize: 11, marginLeft: 8 }}>must trade ≥5</span>}
          </div>
          {cardCount === 0 ? (
            <div style={{ color: '#6a7a8a', fontSize: 12 }}>No cards yet.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {cards.map((c, i) => {
                  const sel = selectedCards.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => onToggleCard(i)}
                      title={c.territory ? TERRITORIES[c.territory].name : 'Wild'}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        width: 46, padding: '5px 2px',
                        border: `1.5px solid ${sel ? '#ffd23f' : '#2a3650'}`,
                        borderRadius: 6, cursor: 'pointer',
                        background: sel ? 'rgba(255,210,63,0.18)' : '#1b2230',
                        color: '#e0e0e0',
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{CARD_ICON[c.type]}</span>
                      <span style={{ fontSize: 9, color: '#8a93a3' }}>
                        {c.territory ? abbrev(TERRITORIES[c.territory].name) : 'WILD'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => { onTradeSelected(); setCardsOpen(false); }}
                disabled={!canTrade}
                style={{
                  width: '100%', background: mustTrade ? '#c0392b' : '#3f6fa3',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '7px 0', fontSize: 12, fontWeight: 700,
                  cursor: canTrade ? 'pointer' : 'default',
                  opacity: canTrade ? 1 : 0.4,
                }}
              >
                {selectedCards.length}/3 — Trade for armies
              </button>
            </>
          )}
        </div>
      )}

      {/* Button row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <CornerBtn
          label="Stats"
          active={statsOpen}
          onClick={() => { setStatsOpen((v) => !v); setCardsOpen(false); }}
        />
        <CornerBtn
          label={`Cards${cardCount > 0 ? ` (${cardCount})` : ''}`}
          active={cardsOpen}
          highlight={mustTrade && isHumanTurn}
          onClick={() => { setCardsOpen((v) => !v); setStatsOpen(false); }}
        />
        <CornerBtn label="Restart" onClick={onRestart} />
      </div>
    </div>
  );
}

function CornerBtn({
  label, active, highlight, onClick,
}: { label: string; active?: boolean; highlight?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(12,20,36,0.85)',
        border: `1px solid ${highlight ? '#ff8c55' : 'rgba(255,255,255,0.1)'}`,
        color: highlight ? '#ff8c55' : '#c8d0da',
        borderRadius: 8, padding: '7px 12px',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'background .1s',
      }}
    >{label}</button>
  );
}

function ReinforceBreakdown({ state }: { state: GameState }) {
  const terrCount = Object.values(state.owner).filter((o) => o === HUMAN_ID).length;
  const base = Math.max(3, Math.floor(terrCount / 3));
  const owned = Object.values(CONTINENTS).filter(
    (c) => c.territories.every((t) => state.owner[t] === HUMAN_ID)
  );
  const total = base + owned.reduce((s, c) => s + c.bonus, 0);
  return (
    <div style={{ fontSize: 12, minWidth: 180 }}>
      <BRow label={`Territories (${terrCount} ÷ 3)`} value={`+${base}`} />
      {owned.map((c) => (
        <BRow key={c.id} label={c.name} value={`+${c.bonus}`} color="#7ed98b" />
      ))}
      <div style={{ height: 1, background: '#2a3650', margin: '5px 0' }} />
      <BRow label="Per turn" value={`+${total}`} bold />
    </div>
  );
}

function BRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: '#9aa4b2' }}>{label}</span>
      <span style={{ color: color ?? '#e0e0e0', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const CARD_ICON: Record<string, string> = {
  infantry: '🟦', cavalry: '🐎', artillery: '🎯', wild: '⭐',
};

function abbrev(name: string) { return name.length > 9 ? name.slice(0, 8) + '…' : name; }

const wrapStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 4,
  pointerEvents: 'auto',
  alignItems: 'flex-start',
};

const popoverStyle: React.CSSProperties = {
  background: 'rgba(12,20,36,0.96)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '12px 14px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(10px)',
};

const popTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1,
  color: '#6f7a8a', marginBottom: 8, textTransform: 'uppercase',
};
