import { memo, useEffect, useState } from 'react';
import type { CombatResult } from './App';
import { usePlayer } from './PlayerContext';

type Outcome = 'win' | 'loss' | 'neutral' | 'rolling';

const PIPS: Record<number, readonly [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Die({ value, outcome }: { value: number; outcome: Outcome }) {
  const SIZE = 28;
  const PAD  = 6;
  const cell = (SIZE - 2 * PAD) / 2;
  const bg =
    outcome === 'win'     ? '#2a6e38'
    : outcome === 'loss'  ? '#8a2020'
    : outcome === 'rolling' ? '#2a3040'
    : '#262e3e';
  const border =
    outcome === 'win'  ? '#5ab870'
    : outcome === 'loss' ? '#c06060'
    : '#1a2030';
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
      <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} rx={6} fill={bg} stroke={border} strokeWidth={1.5} />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={PAD + cx * cell} cy={PAD + cy * cell} r={2.3} fill="rgba(255,255,255,0.88)" />
      ))}
    </svg>
  );
}

function computeOutcomes(att: readonly number[], def: readonly number[]) {
  const a = [...att].sort((x, y) => y - x);
  const d = [...def].sort((x, y) => y - x);
  const n = Math.min(a.length, d.length);
  const aOut: Outcome[] = a.map(() => 'neutral');
  const dOut: Outcome[] = d.map(() => 'neutral');
  for (let i = 0; i < n; i++) {
    if (a[i]! > d[i]!) { aOut[i] = 'win'; dOut[i] = 'loss'; }
    else                { aOut[i] = 'loss'; dOut[i] = 'win'; }
  }
  return { a, d, aOut, dOut };
}

const ROLL_MS = 560;

export const DicePanel = memo(function DicePanel({ result, seq }: { result: CombatResult | null; seq: number }) {
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces]     = useState<{ att: number[]; def: number[] }>({ att: [], def: [] });

  useEffect(() => {
    if (!result) return;
    setRolling(true);
    const rnd = (n: number) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const iv  = setInterval(() => {
      setFaces({ att: rnd(result.attackerRolls.length), def: rnd(result.defenderRolls.length) });
    }, 70);
    const to = setTimeout(() => { clearInterval(iv); setRolling(false); }, ROLL_MS);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [seq, result]);

  if (!result) return null;

  const { playerColors, playerNames } = usePlayer();
  const { a, d, aOut, dOut } = computeOutcomes(result.attackerRolls, result.defenderRolls);
  const attColor = playerColors[result.attacker] ?? '#4a90d9';
  const defColor = playerColors[result.defender] ?? '#e05555';
  const attName = playerNames[result.attacker] ?? result.attacker;
  const defName = playerNames[result.defender] ?? result.defender;

  return (
    <div style={{
      ...panelStyle,
      borderColor: !rolling && result.captured
        ? 'rgba(196,146,42,0.4)'
        : 'rgba(255,255,255,0.09)',
    }}>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
        {/* Attacker */}
        <div style={{ textAlign: 'center' }}>
          <DiceLabel color={attColor}>{attName}</DiceLabel>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', minHeight: 28 }}>
            {a.map((v, i) => (
              <div key={i} style={{ animation: rolling ? 'shake .25s infinite' : 'none' }}>
                <Die value={rolling ? (faces.att[i] ?? v) : v} outcome={rolling ? 'rolling' : aOut[i]!} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ alignSelf: 'center', color: '#3D5068', fontWeight: 800, fontSize: 9, letterSpacing: 1 }}>VS</div>

        {/* Defender */}
        <div style={{ textAlign: 'center' }}>
          <DiceLabel color={defColor}>{defName}</DiceLabel>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', minHeight: 28 }}>
            {d.map((v, i) => (
              <div key={i} style={{ animation: rolling ? 'shake .25s infinite' : 'none' }}>
                <Die value={rolling ? (faces.def[i] ?? v) : v} outcome={rolling ? 'rolling' : dOut[i]!} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginTop: 7, fontSize: 10, textAlign: 'center', minHeight: 14 }}>
        {rolling ? (
          <span style={{ color: '#3D5068', letterSpacing: 1.5, fontSize: 8, fontWeight: 700 }}>ROLLING…</span>
        ) : (
          <>
            <span style={{ color: '#d07070' }}>−{result.attackerLosses}</span>
            <span style={{ color: '#3D5068' }}> att · </span>
            <span style={{ color: '#d07070' }}>−{result.defenderLosses}</span>
            <span style={{ color: '#3D5068' }}> def</span>
            {result.captured && (
              <span style={{ color: '#E8B84B', fontWeight: 800, marginLeft: 6, letterSpacing: 0.5 }}>
                CAPTURED
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function DiceLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8, fontWeight: 800, letterSpacing: 1.2,
      color, marginBottom: 5, textTransform: 'uppercase',
      maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {String(children)}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: 14,
  background: 'rgba(6,12,22,0.97)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 11,
  padding: '9px 12px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
  animation: 'dropIn .2s ease-out',
  pointerEvents: 'none',
  zIndex: 5,
  transition: 'border-color .3s',
};

const KEYFRAMES = `
@keyframes shake { 0%{transform:translateY(-1px) rotate(-4deg)} 50%{transform:translateY(1px) rotate(4deg)} 100%{transform:translateY(-1px) rotate(-4deg)} }
@keyframes dropIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
`;
