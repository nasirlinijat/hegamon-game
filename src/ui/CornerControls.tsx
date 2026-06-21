import { memo, useEffect, useState } from 'react';
import { isValidSet, tradeInValue, cardSetValue } from '../engine/cards';
import type { Card, CardType, GameState } from '../engine/state';
import { MISSION_LABEL } from '../engine/modes';
import { usePlayer } from './PlayerContext';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  selectedCards: number[];
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
  onRestart: () => void;
  continentsShown: boolean;
  onToggleContinents: () => void;
}

export const CornerControls = memo(function CornerControls({
  state, isHumanTurn, selectedCards, onToggleCard, onTradeSelected, onRestart,
  continentsShown, onToggleContinents,
}: Props) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  const { myId } = usePlayer();
  const human     = state.players.find((p) => p.id === myId);
  const cards     = human?.cards ?? [];
  const cardCount = cards.length;
  const mustTrade = state.mustTradeCards;

  useEffect(() => {
    if (mustTrade && isHumanTurn) setCardsOpen(true);
  }, [mustTrade, isHumanTurn]);

  const tradePhaseOk = isHumanTurn && (state.phase === 'reinforce' || mustTrade);
  const selectedSet: [Card, Card, Card] | null = selectedCards.length === 3
    ? [cards[selectedCards[0]!]!, cards[selectedCards[1]!]!, cards[selectedCards[2]!]!]
    : null;
  const validSet  = selectedSet !== null && isValidSet(selectedSet);
  const canTrade  = validSet && tradePhaseOk;
  const tradeReward = validSet
    ? cardSetValue(selectedSet!, state.config.cardBonus, state.tradeInCount)
    : tradeInValue(state.tradeInCount, state.config.cardBonus);

  return (
    <div style={wrapStyle}>
      {/* Stats popover */}
      {statsOpen && (
        <div style={popoverStyle}>
          <div style={popTitle}>Reinforcement Breakdown</div>
          <ReinforceBreakdown state={state} />
          <button
            onClick={onToggleContinents}
            style={{
              width: '100%', marginTop: 12,
              background: continentsShown ? 'rgba(42,100,160,0.2)' : 'transparent',
              color: continentsShown ? '#7ab4ff' : '#7A92AE',
              border: `1px solid ${continentsShown ? 'rgba(42,100,160,0.45)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 7, padding: '7px 0',
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3, cursor: 'pointer',
              transition: 'all .12s',
            }}
          >
            {continentsShown ? '✓ Bonus view — hide' : 'Show continent bonuses'}
          </button>
        </div>
      )}

      {/* Cards tray */}
      {cardsOpen && (
        <div style={{ ...popoverStyle, width: 272 }}>
          <div style={{ ...popTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span>Cards · {cardCount}</span>
            {mustTrade
              ? <span style={{ color: '#e07060', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>MUST TRADE</span>
              : <span style={{ color: '#E8B84B', fontSize: 9, fontWeight: 700 }}>SET = +{tradeReward}</span>}
          </div>

          {cardCount === 0 ? (
            <div style={{ color: '#4A5A6A', fontSize: 12, padding: '6px 0', lineHeight: 1.5 }}>
              No cards yet — capture a territory to earn one.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {cards.map((c, i) => (
                  <CardFace
                    key={i} card={c}
                    selected={selectedCards.includes(i)}
                    onClick={() => onToggleCard(i)}
                    territoryName={c.territory ? (state.map.territories[c.territory]?.name ?? c.territory) : 'WILD'}
                  />
                ))}
              </div>

              {!tradePhaseOk && (
                <div style={{ fontSize: 10, color: '#4A5A6A', marginBottom: 6, textAlign: 'center' }}>
                  {!isHumanTurn
                    ? 'Not your turn — viewing only.'
                    : 'Trade during the reinforce phase.'}
                </div>
              )}

              <button
                onClick={() => { onTradeSelected(); setCardsOpen(false); }}
                disabled={!canTrade}
                style={{
                  width: '100%',
                  background: !canTrade
                    ? 'transparent'
                    : mustTrade
                      ? 'linear-gradient(135deg, #8a1a1a, #c0392b)'
                      : 'linear-gradient(135deg, #1a3a5a, #2a6ea0)',
                  color: canTrade ? '#fff' : '#3A4A5A',
                  border: `1px solid ${!canTrade ? 'rgba(255,255,255,0.06)' : mustTrade ? 'rgba(192,57,43,0.6)' : 'rgba(42,110,160,0.6)'}`,
                  borderRadius: 8, padding: '9px 0',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                  cursor: canTrade ? 'pointer' : 'default',
                  transition: 'all .12s',
                }}
              >
                {validSet ? `Trade set → +${tradeReward} armies` : `Select a set (${selectedCards.length}/3)`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Secret mission banner */}
      {state.config.mode === 'missions' && state.missions?.[myId] && (
        <div style={{
          background: 'rgba(6,12,22,0.96)',
          border: '1px solid rgba(255,200,80,0.2)',
          borderLeft: '3px solid rgba(255,200,80,0.65)',
          borderRadius: 10, padding: '8px 12px',
          fontSize: 11, color: '#f0d080', fontWeight: 600,
          maxWidth: 240, lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 8, letterSpacing: 2, color: '#C4922A', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
            Your Mission
          </span>
          {MISSION_LABEL[state.missions[myId]!]}
        </div>
      )}

      {/* Assassin target banner */}
      {state.config.mode === 'assassin' && state.assassinTargets?.[myId] && state.winner === null && (
        <div style={{
          background: 'rgba(6,12,22,0.96)',
          border: '1px solid rgba(220,60,60,0.2)',
          borderLeft: '3px solid rgba(220,60,60,0.65)',
          borderRadius: 10, padding: '8px 12px',
          fontSize: 11, color: '#f08080', fontWeight: 600,
          maxWidth: 240, lineHeight: 1.4,
        }}>
          <span style={{ fontSize: 8, letterSpacing: 2, color: '#c05050', fontWeight: 700, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>
            Your Target
          </span>
          {state.assassinTargets[myId]}
        </div>
      )}

      {/* Button row */}
      <div style={{ display: 'flex', gap: 7 }}>
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
});

function CornerBtn({ label, active, highlight, onClick }: {
  label: string; active?: boolean; highlight?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(196,146,42,0.12)' : 'rgba(6,12,22,0.94)',
        border: `1px solid ${highlight ? 'rgba(255,140,85,0.6)' : active ? 'rgba(196,146,42,0.42)' : 'rgba(255,255,255,0.09)'}`,
        color: highlight ? '#ff8c55' : active ? '#E8B84B' : '#9aa4b2',
        borderRadius: 8, padding: '7px 13px',
        fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
        cursor: 'pointer',
        transition: 'all .1s',
      }}
    >{label}</button>
  );
}

function ReinforceBreakdown({ state }: { state: GameState }) {
  const { myId } = usePlayer();
  const terrCount = Object.values(state.owner).filter((o) => o === myId).length;
  const base      = Math.max(3, Math.floor(terrCount / 3));
  const owned     = Object.values(state.map.continents).filter(
    (c) => c.territories.every((t) => state.owner[t] === myId)
  );
  const total = base + owned.reduce((s, c) => s + c.bonus, 0);
  return (
    <div style={{ fontSize: 12, minWidth: 188 }}>
      <BRow label={`Territories (${terrCount} ÷ 3)`} value={`+${base}`} />
      {owned.map((c) => (
        <BRow key={c.id} label={c.name} value={`+${c.bonus}`} color="#7ed98b" />
      ))}
      <div style={{ height: 1, background: 'rgba(196,146,42,0.15)', margin: '7px 0' }} />
      <BRow label="Per turn" value={`+${total}`} bold />
    </div>
  );
}

function BRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ color: '#7A92AE' }}>{label}</span>
      <span style={{ color: color ?? '#C8D4E0', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

const CARD_META: Record<CardType, { name: string; color: string }> = {
  infantry:  { name: 'INFANTRY',  color: '#4a78c8' },
  cavalry:   { name: 'CAVALRY',   color: '#3fa35f' },
  artillery: { name: 'ARTILLERY', color: '#c8694a' },
  wild:      { name: 'WILD',      color: '#a575d0' },
};

function CardFace({ card, selected, onClick, territoryName }: {
  card: Card; selected: boolean; onClick: () => void; territoryName: string;
}) {
  const meta = CARD_META[card.type];
  return (
    <button
      onClick={onClick}
      title={territoryName}
      style={{
        position: 'relative',
        width: 58, height: 80, padding: 0,
        borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
        border: `2px solid ${selected ? '#E8B84B' : 'rgba(255,255,255,0.10)'}`,
        background: `linear-gradient(160deg, ${meta.color}26, rgba(6,12,22,0.92))`,
        boxShadow: selected
          ? '0 0 0 2px rgba(232,184,75,0.3), 0 4px 14px rgba(0,0,0,0.55)'
          : '0 2px 8px rgba(0,0,0,0.45)',
        transform: selected ? 'translateY(-2px)' : 'none',
        transition: 'transform .1s, box-shadow .1s, border-color .1s',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      <div style={{
        width: '100%', background: meta.color, color: '#fff',
        fontSize: 7, fontWeight: 800, letterSpacing: 0.5, padding: '2px 0', textAlign: 'center',
      }}>{meta.name}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <CardGlyph type={card.type} color={meta.color} />
      </div>
      <div style={{
        width: '100%', fontSize: 7.5, fontWeight: 600, color: '#c7d3e2',
        padding: '2px 2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        textAlign: 'center',
      }}>{territoryName}</div>
    </button>
  );
}

function CardGlyph({ type, color }: { type: CardType; color: string }) {
  const c = '#e8f0f8';
  return (
    <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {type === 'infantry' && (
        <>
          <circle cx={12} cy={6} r={3} fill={c} stroke="none" />
          <path d="M6 20c0-4 2.7-6 6-6s6 2 6 6Z" fill={c} stroke="none" />
        </>
      )}
      {type === 'cavalry' && <path d="M7 5v7a5 5 0 0 0 10 0V5" />}
      {type === 'artillery' && (
        <>
          <circle cx={12} cy={12} r={7} />
          <circle cx={12} cy={12} r={2.4} fill={c} stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
      )}
      {type === 'wild' && (
        <path d="M12 2l2.9 6.2 6.6.7-4.9 4.6 1.3 6.5L12 17.6 6.1 20.6l1.3-6.5L2.5 8.9l6.6-.7Z"
          fill={color} stroke={color} />
      )}
    </svg>
  );
}

const wrapStyle: React.CSSProperties = {
  position: 'absolute', bottom: 16, left: 16,
  display: 'flex', flexDirection: 'column', gap: 8,
  zIndex: 4, pointerEvents: 'auto', alignItems: 'flex-start',
};

const popoverStyle: React.CSSProperties = {
  background: 'rgba(6,12,22,0.97)',
  border: '1px solid rgba(196,146,42,0.2)',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 8px 36px rgba(0,0,0,0.6)',
};

const popTitle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
  color: '#C4922A', marginBottom: 10, textTransform: 'uppercase',
  paddingLeft: 8, borderLeft: '2px solid #C4922A', lineHeight: 1,
};
