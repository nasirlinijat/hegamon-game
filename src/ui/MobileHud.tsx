import { memo, useState, useEffect } from 'react';
import type { GameState } from '../engine/state';
import type { TerritoryId } from '../engine/map';
import { isValidSet, tradeInValue, cardSetValue } from '../engine/cards';
import { MISSION_LABEL } from '../engine/modes';
import { usePlayer } from './PlayerContext';
import { useViewport } from './useViewport';
import { BottomSheet } from './BottomSheet';
import { CardFace, ReinforceBreakdown } from './CornerControls';
import { StatDial } from './Roster';

const PHASE_META: Record<string, { label: string; color: string }> = {
  setup:     { label: 'SETUP',     color: '#9b7de8' },
  reinforce: { label: 'REINFORCE', color: '#5ba3e8' },
  attack:    { label: 'ATTACK',    color: '#e05545' },
  fortify:   { label: 'FORTIFY',   color: '#5ab06a' },
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60).toString();
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export interface MobileHudProps {
  state: GameState;
  isHumanTurn: boolean;
  aiRunning: boolean;
  selected: TerritoryId | null;
  onEndPhase: () => void;
  blitzMode: boolean;
  onToggleBlitz: () => void;
  secondsLeft: number | null;
  turnSeconds: number;
  selectedCards: number[];
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
  onRestart: () => void;
  continentsShown: boolean;
  onToggleContinents: () => void;
}

export const MobileHud = memo(function MobileHud(props: MobileHudProps) {
  const {
    state, isHumanTurn, aiRunning, onEndPhase,
    blitzMode, onToggleBlitz, secondsLeft, turnSeconds,
    selectedCards, onToggleCard, onTradeSelected, onRestart,
    continentsShown, onToggleContinents,
  } = props;

  const { isPortrait } = useViewport();
  const { myId, playerColors, playerNames } = usePlayer();
  const [sheet, setSheet] = useState<'cards' | 'stats' | 'roster' | null>(null);
  const [rotateDismissed, setRotateDismissed] = useState(() => {
    try { return localStorage.getItem('hegemon-rotate-dismissed') === '1'; } catch { return false; }
  });

  const current = state.players[state.turnPointer];
  const phase = state.phase;
  const meta = PHASE_META[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  const rem = state.reinforcementsRemaining;
  const mustTrade = state.mustTradeCards;

  const canEnd = isHumanTurn && !mustTrade && (
    (phase === 'reinforce' && rem === 0) ||
    phase === 'attack' ||
    phase === 'fortify'
  );

  const human = state.players.find(p => p.id === myId);
  const cards = human?.cards ?? [];
  const cardCount = cards.length;

  useEffect(() => {
    if (mustTrade && isHumanTurn) setSheet('cards');
  }, [mustTrade, isHumanTurn]);

  const selectedSet = selectedCards.length === 3
    ? [cards[selectedCards[0]!]!, cards[selectedCards[1]!]!, cards[selectedCards[2]!]!] as [typeof cards[0], typeof cards[0], typeof cards[0]]
    : null;
  const validSet = selectedSet !== null && isValidSet(selectedSet);
  const canTrade = validSet && isHumanTurn && (state.phase === 'reinforce' || mustTrade);
  const tradeReward = validSet
    ? cardSetValue(selectedSet, state.config.cardBonus, state.tradeInCount)
    : tradeInValue(state.tradeInCount, state.config.cardBonus);

  const dismissRotate = () => {
    setRotateDismissed(true);
    try { localStorage.setItem('hegemon-rotate-dismissed', '1'); } catch {}
  };

  const currentName = current ? (playerNames[current.id] ?? current.id) : '';
  const showRotateHint = isPortrait && !rotateDismissed && phase !== 'setup';

  return (
    <>
      {/* Rotate hint toast */}
      {showRotateHint && (
        <div style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(6,12,22,0.95)',
          border: '1px solid rgba(196,146,42,0.3)',
          borderRadius: 20, padding: '6px 14px 6px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          zIndex: 6, pointerEvents: 'auto', whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: 14 }}>↻</span>
          <span style={{ fontSize: 11, color: '#C4922A', fontWeight: 600 }}>Rotate for a wider view</span>
          <button onClick={dismissRotate} style={{
            background: 'none', border: 'none', color: '#5a6a7a',
            cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 0 0 4px',
          }}>✕</button>
        </div>
      )}

      {/* Top roster strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'rgba(6,12,22,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        zIndex: 5,
      }}>
        <div style={{
          display: 'flex', gap: 6, padding: '6px 10px',
          overflowX: 'auto',
          // hide scrollbar
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
        } as React.CSSProperties}>
          {state.players.map(player => {
            const id = player.id;
            const name = playerNames[id] ?? id;
            const color = playerColors[id] ?? '#5a6272';
            const isCurrent = id === current?.id;
            const terrs = Object.values(state.owner).filter(o => o === id).length;

            return (
              <button key={id} onClick={() => setSheet('roster')} style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                padding: '4px 9px', borderRadius: 20, minHeight: 36,
                background: isCurrent ? `${color}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isCurrent ? color + '55' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer',
                opacity: player.alive ? 1 : 0.35,
                transition: 'all .12s',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 11, fontWeight: isCurrent ? 800 : 600,
                  color: isCurrent ? color : '#9aa4b2',
                  maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{name}</span>
                <span style={{ fontSize: 10, color: '#5a6a7a', fontWeight: 700 }}>{terrs}</span>
                {isCurrent && player.alive && (
                  <span style={{ fontSize: 7, color: '#C4922A', fontWeight: 800 }}>●</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(6,12,22,0.97)',
        borderTop: `1px solid ${isHumanTurn ? 'rgba(196,146,42,0.2)' : 'rgba(255,255,255,0.07)'}`,
        zIndex: 5,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 10px', minHeight: 54,
          overflowX: 'auto', scrollbarWidth: 'none',
        } as React.CSSProperties}>
          {/* Phase + reinforcement badge */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            gap: 2, flexShrink: 0,
          }}>
            <span style={{
              fontSize: 7, fontWeight: 800, letterSpacing: 1.5,
              color: meta.color, textTransform: 'uppercase' as const, lineHeight: 1,
              borderLeft: `2px solid ${meta.color}`, paddingLeft: 5,
            }}>{meta.label}</span>
            {rem > 0 && phase === 'reinforce' && (
              <span style={{
                background: 'rgba(196,146,42,0.18)', color: '#E8B84B',
                fontSize: 9, fontWeight: 800, borderRadius: 8, padding: '1px 5px', marginLeft: 5,
              }}>{rem}</span>
            )}
          </div>

          {/* Current player name */}
          {current && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: playerColors[current.id] ?? '#5a6272',
              flexShrink: 0, maxWidth: 56,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{currentName}</span>
          )}

          {/* Waiting hint (AI turn) */}
          {!isHumanTurn && (
            <span style={{
              flex: 1, fontSize: 10, color: '#5a6a7a',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {aiRunning ? `${currentName} thinking…` : 'Waiting…'}
            </span>
          )}

          <div style={{ flex: 1, minWidth: 0 }} />

          {/* Blitz toggle */}
          {isHumanTurn && state.winner === null && phase === 'attack' && (
            <button onClick={onToggleBlitz} style={{
              background: blitzMode ? 'rgba(192,57,43,0.22)' : 'rgba(192,57,43,0.06)',
              color: blitzMode ? '#ff8070' : '#a06050',
              border: `1px solid ${blitzMode ? 'rgba(220,70,50,0.5)' : 'rgba(192,57,43,0.18)'}`,
              borderRadius: 8, padding: '6px 10px',
              fontSize: 13, cursor: 'pointer', minHeight: 40, flexShrink: 0,
            }}>⚡</button>
          )}

          {/* Countdown timer */}
          {isHumanTurn && secondsLeft != null && secondsLeft > 0 && (
            <span style={{
              fontSize: secondsLeft <= 10 ? 14 : 12, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: secondsLeft <= 10 ? '#ef4444' : secondsLeft <= 30 ? '#f59e0b' : '#7A92AE',
              minWidth: 34, textAlign: 'center', flexShrink: 0,
            }}>{fmtTime(secondsLeft)}</span>
          )}

          {/* End Phase button */}
          {isHumanTurn && state.winner === null && phase !== 'setup' && (
            <button onClick={onEndPhase} disabled={!canEnd} style={{
              background: canEnd
                ? 'linear-gradient(135deg, #1a4a28 0%, #2e6e3e 100%)'
                : 'transparent',
              color: canEnd ? '#7ed98b' : '#3d5a43',
              border: `1px solid ${canEnd ? 'rgba(74,158,92,0.5)' : 'rgba(74,158,92,0.12)'}`,
              borderRadius: 8, padding: '6px 12px',
              fontSize: 11, fontWeight: 700,
              cursor: canEnd ? 'pointer' : 'default',
              whiteSpace: 'nowrap', flexShrink: 0, minHeight: 40,
            }}>{phase === 'fortify' ? '↺ End' : 'End →'}</button>
          )}

          {/* Divider */}
          <div style={{
            width: 1, height: 28,
            background: 'rgba(255,255,255,0.08)', flexShrink: 0,
          }} />

          {/* Cards */}
          <button onClick={() => setSheet(s => s === 'cards' ? null : 'cards')} style={{
            background: sheet === 'cards' ? 'rgba(196,146,42,0.12)' : (mustTrade && isHumanTurn ? 'rgba(192,57,43,0.1)' : 'rgba(6,12,22,0.94)'),
            border: `1px solid ${mustTrade && isHumanTurn ? 'rgba(255,140,85,0.6)' : sheet === 'cards' ? 'rgba(196,146,42,0.42)' : 'rgba(255,255,255,0.09)'}`,
            color: mustTrade && isHumanTurn ? '#ff8c55' : sheet === 'cards' ? '#E8B84B' : '#9aa4b2',
            borderRadius: 8, padding: '6px 10px',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            minHeight: 40, flexShrink: 0,
          }}>{cardCount > 0 ? `🃏 ${cardCount}` : '🃏'}</button>

          {/* Stats */}
          <button onClick={() => setSheet(s => s === 'stats' ? null : 'stats')} style={{
            background: sheet === 'stats' ? 'rgba(196,146,42,0.12)' : 'rgba(6,12,22,0.94)',
            border: `1px solid ${sheet === 'stats' ? 'rgba(196,146,42,0.42)' : 'rgba(255,255,255,0.09)'}`,
            color: sheet === 'stats' ? '#E8B84B' : '#9aa4b2',
            borderRadius: 8, padding: '6px 10px',
            fontSize: 13, cursor: 'pointer', minHeight: 40, flexShrink: 0,
          }}>📊</button>

          {/* Restart */}
          <button onClick={onRestart} style={{
            background: 'rgba(6,12,22,0.94)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: '#9aa4b2',
            borderRadius: 8, padding: '6px 10px',
            fontSize: 13, cursor: 'pointer', minHeight: 40, flexShrink: 0,
          }}>↺</button>
        </div>
      </div>

      {/* Cards bottom sheet */}
      <BottomSheet open={sheet === 'cards'} onClose={() => setSheet(null)} title={`Cards · ${cardCount}`}>
        {state.config.mode === 'missions' && state.missions?.[myId] && (
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: 'rgba(196,146,42,0.08)',
            borderLeft: '3px solid rgba(255,200,80,0.65)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: '#C4922A', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Your Mission</div>
            <div style={{ fontSize: 11, color: '#f0d080', fontWeight: 600 }}>{MISSION_LABEL[state.missions[myId]!]}</div>
          </div>
        )}
        {state.config.mode === 'assassin' && state.assassinTargets?.[myId] && state.winner === null && (
          <div style={{
            marginBottom: 12, padding: '8px 12px',
            background: 'rgba(220,60,60,0.08)',
            borderLeft: '3px solid rgba(220,60,60,0.65)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: '#c05050', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Your Target</div>
            <div style={{ fontSize: 11, color: '#f08080', fontWeight: 600 }}>{state.assassinTargets[myId]}</div>
          </div>
        )}
        {mustTrade && isHumanTurn && (
          <div style={{
            padding: '6px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(192,57,43,0.12)',
            fontSize: 11, color: '#e07060', fontWeight: 700, textAlign: 'center',
          }}>Must trade before continuing</div>
        )}
        <div style={{ fontSize: 9, color: '#C4922A', fontWeight: 700, marginBottom: 10 }}>
          {validSet ? `Trade set → +${tradeReward} armies` : `Next set = +${tradeReward} armies`}
        </div>
        {cardCount === 0 ? (
          <div style={{ color: '#4A5A6A', fontSize: 12, padding: '8px 0', lineHeight: 1.5 }}>
            No cards yet — capture a territory to earn one.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {cards.map((c, i) => (
                <CardFace
                  key={i} card={c}
                  selected={selectedCards.includes(i)}
                  onClick={() => onToggleCard(i)}
                  territoryName={c.territory ? (state.map.territories[c.territory]?.name ?? c.territory) : 'WILD'}
                />
              ))}
            </div>
            <button
              onClick={() => { onTradeSelected(); setSheet(null); }}
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
                borderRadius: 8, padding: '12px 0',
                fontSize: 12, fontWeight: 700,
                cursor: canTrade ? 'pointer' : 'default', minHeight: 44,
              }}
            >
              {validSet ? `Trade set → +${tradeReward} armies` : `Select a set (${selectedCards.length}/3)`}
            </button>
          </>
        )}
      </BottomSheet>

      {/* Stats bottom sheet */}
      <BottomSheet open={sheet === 'stats'} onClose={() => setSheet(null)} title="Reinforcements">
        <ReinforceBreakdown state={state} />
        <button onClick={onToggleContinents} style={{
          width: '100%', marginTop: 12,
          background: continentsShown ? 'rgba(42,100,160,0.2)' : 'transparent',
          color: continentsShown ? '#7ab4ff' : '#7A92AE',
          border: `1px solid ${continentsShown ? 'rgba(42,100,160,0.45)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 7, padding: '10px 0',
          fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 44,
        }}>
          {continentsShown ? '✓ Bonus view — hide' : 'Show continent bonuses'}
        </button>
      </BottomSheet>

      {/* Roster bottom sheet */}
      <BottomSheet open={sheet === 'roster'} onClose={() => setSheet(null)} title="Players">
        {state.players.map(player => {
          const id = player.id;
          const name = playerNames[id] ?? id;
          const color = playerColors[id] ?? '#5a6272';
          const isCurrent = id === current?.id;
          const terrs = Object.values(state.owner).filter(o => o === id).length;
          const armies = Object.entries(state.armies)
            .filter(([t]) => state.owner[t as keyof typeof state.owner] === id)
            .reduce((s, [, n]) => s + n, 0);
          const conts = Object.values(state.map.continents).filter(
            c => c.territories.every(t => state.owner[t] === id),
          ).length;

          return (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, marginBottom: 6,
              background: isCurrent ? 'rgba(8,14,26,0.97)' : 'rgba(6,12,22,0.6)',
              border: `1px solid ${isCurrent ? color + '55' : 'rgba(255,255,255,0.06)'}`,
              opacity: player.alive ? 1 : 0.35,
            }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontWeight: 800, color, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              {isCurrent && turnSeconds != null && (
                <span style={{ fontSize: 10, color: '#cdd5e0', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  ⏱ {fmtTime(turnSeconds)}
                </span>
              )}
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <StatDial label="TER" value={terrs} color={color} />
                <StatDial label="ARM" value={armies} color={color} prominent />
                {conts > 0 && <StatDial label="CON" value={conts} color="#E8B84B" />}
                {player.cards.length > 0 && <StatDial label="CRD" value={player.cards.length} color="#9b7de8" />}
              </div>
            </div>
          );
        })}
      </BottomSheet>
    </>
  );
});
