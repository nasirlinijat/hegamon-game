import type { GameState, Player } from '../engine/state';
import { isValidSet } from '../engine/cards';
import { TERRITORIES, CONTINENTS } from '../engine/map';
import { HUMAN_ID, CPU_ID, PLAYER_COLORS, btnStyle } from './App';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  aiRunning: boolean;
  selected: string | null;
  selectedCards: number[];
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
  onEndPhase: () => void;
  onRestart: () => void;
}

export function Sidebar({
  state, isHumanTurn, aiRunning, selected,
  selectedCards, onToggleCard, onTradeSelected, onEndPhase, onRestart,
}: Props) {
  const currentPid = state.players[state.turnPointer]?.id ?? '';
  const human = state.players.find((p) => p.id === HUMAN_ID);
  const cpu = state.players.find((p) => p.id === CPU_ID);

  return (
    <div style={wrap}>
      <div style={header}>RISK</div>

      {human && <ScoreRow player={human} state={state} current={currentPid === HUMAN_ID} />}
      {cpu && <ScoreRow player={cpu} state={state} current={currentPid === CPU_ID} />}

      <Divider />

      {state.winner !== null ? (
        <Section><button onClick={onRestart} style={btnStyle('#4a90d9')}>New game</button></Section>
      ) : isHumanTurn ? (
        <HumanPanel
          state={state}
          selected={selected}
          selectedCards={selectedCards}
          onToggleCard={onToggleCard}
          onTradeSelected={onTradeSelected}
          onEndPhase={onEndPhase}
        />
      ) : (
        <Section>
          <div style={{ color: '#e05555', fontWeight: 600, marginBottom: 8 }}>CPU is moving…</div>
          {aiRunning && <Spinner />}
        </Section>
      )}

      <div style={{ flex: 1 }} />
      <Divider />
      <Section>
        <button onClick={onRestart} style={{ ...btnStyle('#333'), fontSize: 13, width: '100%' }}>
          Restart
        </button>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HumanPanel({ state, selected, selectedCards, onToggleCard, onTradeSelected, onEndPhase }: {
  state: GameState;
  selected: string | null;
  selectedCards: number[];
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
  onEndPhase: () => void;
}) {
  const phase = state.phase;
  const rem = state.reinforcementsRemaining;
  const cards = state.players.find((p) => p.id === HUMAN_ID)?.cards ?? [];
  const canEndPhase = (phase === 'reinforce' && rem === 0) || phase === 'attack' || phase === 'fortify';

  return (
    <Section>
      <PhaseLabel phase={phase} />

      {phase === 'reinforce' && (
        <>
          <ReinforceBreakdown state={state} />
          <div style={{ fontSize: 13, color: '#aaa', margin: '8px 0 10px' }}>
            {rem > 0
              ? <>Place <strong style={{ color: '#ffd23f' }}>{rem}</strong> — click your territories.</>
              : <span style={{ color: '#8bd18b' }}>All armies placed. End phase →</span>}
          </div>
          <CardHand
            cards={cards}
            selectedCards={selectedCards}
            mustTrade={state.mustTradeCards}
            onToggleCard={onToggleCard}
            onTradeSelected={onTradeSelected}
          />
        </>
      )}

      {phase === 'attack' && (
        <div style={{ fontSize: 13, color: '#aaa', margin: '10px 0' }}>
          {selected
            ? <><strong style={{ color: '#ffd23f' }}>{label(selected)}</strong> selected — click an outlined enemy to attack.</>
            : <>Hover your territories to preview targets; click one (≥2 armies) to attack.</>}
        </div>
      )}

      {phase === 'fortify' && (
        <div style={{ fontSize: 13, color: '#aaa', margin: '10px 0' }}>
          {state.fortifiedThisTurn
            ? <span style={{ color: '#8bd18b' }}>Fortified — end your turn.</span>
            : selected
              ? <><strong style={{ color: '#ffd23f' }}>{label(selected)}</strong> — click a connected territory.</>
              : <>Optionally move armies between connected territories.</>}
        </div>
      )}

      <button
        onClick={onEndPhase}
        disabled={!canEndPhase}
        style={{ ...btnStyle('#2a6a3a'), opacity: canEndPhase ? 1 : 0.4, width: '100%', marginTop: 4 }}
      >
        {phase === 'fortify' ? 'End Turn ⟳' : 'End Phase →'}
      </button>
    </Section>
  );
}

function ReinforceBreakdown({ state }: { state: GameState }) {
  const terrCount = Object.values(state.owner).filter((o) => o === HUMAN_ID).length;
  const base = Math.max(3, Math.floor(terrCount / 3));
  const owned = Object.values(CONTINENTS).filter((c) =>
    c.territories.every((t) => state.owner[t] === HUMAN_ID),
  );
  const total = base + owned.reduce((s, c) => s + c.bonus, 0);

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
      <Row label={`Territories (${terrCount} ÷ 3)`} value={`+${base}`} />
      {owned.map((c) => (
        <Row key={c.id} label={c.name} value={`+${c.bonus}`} color="#8bd18b" />
      ))}
      <div style={{ height: 1, background: '#2a3650', margin: '6px 0' }} />
      <Row label="Per turn" value={`+${total}`} bold />
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
      <span style={{ color: '#9aa4b2' }}>{label}</span>
      <span style={{ color: color ?? '#e0e0e0', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function CardHand({ cards, selectedCards, mustTrade, onToggleCard, onTradeSelected }: {
  cards: GameState['players'][number]['cards'];
  selectedCards: number[];
  mustTrade: boolean;
  onToggleCard: (i: number) => void;
  onTradeSelected: () => void;
}) {
  if (cards.length === 0) return null;

  const picked = selectedCards.length === 3
    ? isValidSet([cards[selectedCards[0]!]!, cards[selectedCards[1]!]!, cards[selectedCards[2]!]!])
    : false;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#6f7a8a', margin: '4px 0 6px', letterSpacing: 1 }}>
        CARDS {mustTrade && <span style={{ color: '#ff9a4a' }}>· must trade (≥5)</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {cards.map((c, i) => {
          const sel = selectedCards.includes(i);
          return (
            <button
              key={i}
              onClick={() => onToggleCard(i)}
              title={c.territory ? TERRITORIES[c.territory].name : 'Wild'}
              style={{
                ...cardChip,
                borderColor: sel ? '#ffd23f' : '#2a3650',
                background: sel ? 'rgba(255,210,63,0.16)' : '#1b2230',
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
        onClick={onTradeSelected}
        disabled={!picked}
        style={{
          ...btnStyle(mustTrade ? '#c0392b' : '#3f6fa3'),
          width: '100%', marginTop: 8, fontSize: 13,
          opacity: picked ? 1 : 0.4,
        }}
      >
        {selectedCards.length}/3 — Trade set for armies
      </button>
    </div>
  );
}

const CARD_ICON: Record<string, string> = {
  infantry: '🟦', cavalry: '🐎', artillery: '🎯', wild: '⭐',
};

function PhaseLabel({ phase }: { phase: string }) {
  const map: Record<string, { label: string; color: string }> = {
    reinforce: { label: 'REINFORCE', color: '#4a90d9' },
    attack: { label: 'ATTACK', color: '#e05555' },
    fortify: { label: 'FORTIFY', color: '#5bad5b' },
  };
  const { label: l, color } = map[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 4,
      padding: '2px 9px', fontSize: 12, fontWeight: 700, letterSpacing: 1,
    }}>{l}</span>
  );
}

function ScoreRow({ player, state, current }: { player: Player; state: GameState; current: boolean }) {
  const id = player.id;
  const color = PLAYER_COLORS[id] ?? '#888';
  const terrs = Object.values(state.owner).filter((o) => o === id).length;
  const conts = Object.values(CONTINENTS).filter((c) => c.territories.every((t) => state.owner[t] === id)).length;
  return (
    <div style={{
      padding: '10px 16px',
      background: current ? 'rgba(255,255,255,0.05)' : 'transparent',
      borderLeft: current ? `3px solid ${color}` : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <div style={{ width: 11, height: 11, borderRadius: '50%', background: color, border: '2px solid #141b27' }} />
        <span style={{ fontWeight: 700, color }}>{id}</span>
        {!player.alive && <span style={{ color: '#666', fontSize: 12 }}>(out)</span>}
        {current && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 'auto' }}>▶ turn</span>}
      </div>
      <div style={{ fontSize: 12, color: '#9aa4b2' }}>
        {terrs} territories · {conts} continent{conts !== 1 ? 's' : ''} · {player.cards.length} cards
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%', background: '#e05555',
          animation: `pulse 1s ${i * 0.2}s infinite alternate`,
        }} />
      ))}
      <style>{`@keyframes pulse { from { opacity:.2 } to { opacity:1 } }`}</style>
    </div>
  );
}

function Divider() { return <div style={{ height: 1, background: '#1e3a5f', flexShrink: 0 }} />; }
function Section({ children }: { children: React.ReactNode }) { return <div style={{ padding: '12px 16px' }}>{children}</div>; }

function label(id: string) { return id.replace(/-/g, ' '); }
function abbrev(name: string) { return name.length > 9 ? name.slice(0, 8) + '…' : name; }

const wrap: React.CSSProperties = {
  width: 256, flexShrink: 0, background: '#16213e', borderLeft: '1px solid #1e3a5f',
  display: 'flex', flexDirection: 'column', overflowY: 'auto',
};
const header: React.CSSProperties = {
  padding: '14px 16px 10px', fontWeight: 800, fontSize: 20, letterSpacing: 2,
  color: '#e0e0e0', borderBottom: '1px solid #1e3a5f', flexShrink: 0,
};
const cardChip: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  width: 46, padding: '5px 2px', border: '1.5px solid', borderRadius: 6,
  cursor: 'pointer', color: '#e0e0e0',
};
