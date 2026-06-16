import type { GameState, Player } from '../engine/state';
import { isValidSet } from '../engine/cards';
import { TERRITORIES, CONTINENTS } from '../engine/map';
import { calcReinforcements } from '../engine/rules';
import type { CombatResult } from './App';
import { HUMAN_ID, CPU_ID, PLAYER_COLORS, btnStyle } from './App';

interface Props {
  state: GameState;
  isHumanTurn: boolean;
  aiRunning: boolean;
  lastCombat: CombatResult | null;
  selected: string | null;
  onEndPhase: () => void;
  onTradeIn: (indices: [number, number, number]) => void;
  onRestart: () => void;
}

export function Sidebar({
  state, isHumanTurn, aiRunning, lastCombat, selected,
  onEndPhase, onTradeIn, onRestart,
}: Props) {
  const currentPid = state.players[state.turnPointer]?.id ?? '';
  const humanPlayer = state.players.find((p) => p.id === HUMAN_ID);
  const cpuPlayer   = state.players.find((p) => p.id === CPU_ID);

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: '#16213e', borderLeft: '1px solid #1e3a5f',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      <div style={{
        padding: '14px 16px 10px', fontWeight: 800, fontSize: 20,
        letterSpacing: 2, color: '#e0e0e0', borderBottom: '1px solid #1e3a5f', flexShrink: 0,
      }}>
        RISK
      </div>

      {humanPlayer && <ScoreRow player={humanPlayer} state={state} current={currentPid === HUMAN_ID} />}
      {cpuPlayer   && <ScoreRow player={cpuPlayer}   state={state} current={currentPid === CPU_ID} />}

      <Divider />

      {state.winner !== null ? (
        <Section>
          <button onClick={onRestart} style={btnStyle('#4a90d9')}>New game</button>
        </Section>
      ) : isHumanTurn ? (
        <HumanPanel
          state={state}
          selected={selected}
          onEndPhase={onEndPhase}
          onTradeIn={onTradeIn}
        />
      ) : (
        <Section>
          <div style={{ color: '#e05555', fontWeight: 600, marginBottom: 8 }}>CPU is thinking…</div>
          {aiRunning && <Spinner />}
        </Section>
      )}

      {lastCombat && (
        <>
          <Divider />
          <CombatPanel result={lastCombat} />
        </>
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
// Sub-components
// ---------------------------------------------------------------------------

function Divider() {
  return <div style={{ height: 1, background: '#1e3a5f', flexShrink: 0 }} />;
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '12px 16px' }}>{children}</div>;
}

function ScoreRow({ player, state, current }: { player: Player; state: GameState; current: boolean }) {
  const id = player.id;
  const color = PLAYER_COLORS[id] ?? '#888';
  const terrs = Object.values(state.owner).filter((o) => o === id).length;
  const continentCount = Object.values(CONTINENTS).filter((c) =>
    c.territories.every((t) => state.owner[t] === id)
  ).length;

  return (
    <div style={{
      padding: '10px 16px',
      background: current ? 'rgba(255,255,255,0.05)' : 'transparent',
      borderLeft: current ? `3px solid ${color}` : '3px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 700, color }}>{id}</span>
        {!player.alive && <span style={{ color: '#666', fontSize: 12 }}>(elim.)</span>}
        {current && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 'auto' }}>▶</span>}
      </div>
      <div style={{ fontSize: 12, color: '#aaa' }}>
        {terrs} terr · {continentCount} cont · {player.cards.length} cards
      </div>
    </div>
  );
}

function HumanPanel({ state, selected, onEndPhase, onTradeIn }: {
  state: GameState;
  selected: string | null;
  onEndPhase: () => void;
  onTradeIn: (i: [number, number, number]) => void;
}) {
  const phase = state.phase;
  const rem = state.reinforcementsRemaining;
  const humanCards = state.players.find((p) => p.id === HUMAN_ID)?.cards ?? [];
  const reinforcements = calcReinforcements(state, HUMAN_ID);
  const tradeSet = findTradeSet(humanCards);
  const canEndPhase = (phase === 'reinforce' && rem === 0) || phase === 'attack' || phase === 'fortify';

  return (
    <Section>
      <div style={{ marginBottom: 10 }}>
        <PhaseLabel phase={phase} />
      </div>

      {phase === 'reinforce' && (
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>
          {rem > 0 ? (
            <>Place <strong style={{ color: '#ffe066' }}>{rem}</strong> — click your territories.</>
          ) : (
            <span style={{ color: '#88cc88' }}>All placed. End phase.</span>
          )}
          <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
            +{reinforcements} per turn
          </div>
        </div>
      )}

      {phase === 'attack' && (
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>
          {selected
            ? <><strong style={{ color: '#ffe066' }}>{selected.replace(/-/g, ' ')}</strong> selected — click orange to attack.</>
            : <>Click your territory (≥2 armies) to attack.</>}
        </div>
      )}

      {phase === 'fortify' && (
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>
          {state.fortifiedThisTurn
            ? <span style={{ color: '#88cc88' }}>Fortified. End turn.</span>
            : selected
              ? <><strong style={{ color: '#ffe066' }}>{selected.replace(/-/g, ' ')}</strong> — click connected territory.</>
              : <>Move armies between connected territories (optional).</>}
        </div>
      )}

      {state.mustTradeCards && tradeSet && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#ff9944', marginBottom: 6 }}>Must trade (≥5 cards):</div>
          <button onClick={() => onTradeIn(tradeSet)} style={btnStyle('#e05555')}>Trade for armies</button>
        </div>
      )}

      {tradeSet && !state.mustTradeCards && phase === 'reinforce' && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={() => onTradeIn(tradeSet)} style={{ ...btnStyle('#555'), fontSize: 13 }}>
            Trade cards (+armies)
          </button>
        </div>
      )}

      <button
        onClick={onEndPhase}
        disabled={!canEndPhase}
        style={{ ...btnStyle('#2a6a3a'), opacity: canEndPhase ? 1 : 0.4, width: '100%' }}
      >
        {phase === 'fortify' ? 'End Turn' : 'End Phase →'}
      </button>

      {humanCards.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>YOUR CARDS</div>
          {humanCards.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: '#aaa' }}>
              {c.type.charAt(0).toUpperCase() + c.type.slice(1)}
              {c.territory ? ` — ${TERRITORIES[c.territory].name}` : ' (wild)'}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function PhaseLabel({ phase }: { phase: string }) {
  const map: Record<string, { label: string; color: string }> = {
    reinforce: { label: 'REINFORCE', color: '#4a90d9' },
    attack:    { label: 'ATTACK',    color: '#e05555' },
    fortify:   { label: 'FORTIFY',  color: '#5bad5b' },
  };
  const { label, color } = map[phase] ?? { label: phase.toUpperCase(), color: '#aaa' };
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 1,
    }}>
      {label}
    </span>
  );
}

function CombatPanel({ result }: { result: CombatResult }) {
  return (
    <Section>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>LAST COMBAT</div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>
        {TERRITORIES[result.from].name} → {TERRITORIES[result.to].name}
      </div>
      <DiceRow
        label="Att" rolls={result.attackerRolls} losses={result.attackerLosses}
        color={PLAYER_COLORS[HUMAN_ID] ?? '#4a90d9'}
      />
      <DiceRow
        label="Def" rolls={result.defenderRolls} losses={result.defenderLosses}
        color={PLAYER_COLORS[CPU_ID] ?? '#e05555'}
      />
      {result.captured && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#ffe066', fontWeight: 600 }}>
          Territory captured!
        </div>
      )}
    </Section>
  );
}

function DiceRow({ label, rolls, losses, color }: {
  label: string; rolls: readonly number[]; losses: number; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ width: 28, fontSize: 11, color: '#666' }}>{label}</span>
      {rolls.map((d, i) => (
        <span key={i} style={{
          width: 22, height: 22, lineHeight: '22px', textAlign: 'center',
          background: color, color: '#fff', borderRadius: 4, fontSize: 13, fontWeight: 700,
          display: 'inline-block',
        }}>{d}</span>
      ))}
      {losses > 0 && <span style={{ fontSize: 12, color: '#e05555' }}>−{losses}</span>}
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

// ---------------------------------------------------------------------------
// Card set finder — returns indices of the first valid 3-card combination
// ---------------------------------------------------------------------------

function findTradeSet(cards: GameState['players'][number]['cards']): [number, number, number] | null {
  for (let i = 0; i < cards.length - 2; i++) {
    for (let j = i + 1; j < cards.length - 1; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        if (isValidSet([cards[i]!, cards[j]!, cards[k]!])) return [i, j, k];
      }
    }
  }
  return null;
}
