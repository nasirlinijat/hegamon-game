import { useEffect, useState } from 'react';
import type { CombatResult } from './App';
import { PLAYER_COLORS } from './App';
import { HUMAN_ID, CPU_ID } from './App';

type Outcome = 'win' | 'loss' | 'neutral' | 'rolling';

// Pip positions on a 3×3 grid (col, row), each 0..2.
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Die({ value, outcome }: { value: number; outcome: Outcome }) {
  const SIZE = 40;
  const PAD = 9;
  const cell = (SIZE - 2 * PAD) / 2;
  const bg =
    outcome === 'win' ? '#2f8a3e'
    : outcome === 'loss' ? '#c0392b'
    : outcome === 'rolling' ? '#5b6473'
    : '#3a4252';
  const border =
    outcome === 'win' ? '#7ce08a'
    : outcome === 'loss' ? '#ff8a7a'
    : '#1b2230';
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block' }}>
      <rect
        x={1} y={1} width={SIZE - 2} height={SIZE - 2} rx={8}
        fill={bg} stroke={border} strokeWidth={2}
      />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={PAD + cx * cell} cy={PAD + cy * cell} r={3.4} fill="#fff" />
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
    // Defender wins ties (matches engine resolveCombat).
    if (a[i]! > d[i]!) { aOut[i] = 'win'; dOut[i] = 'loss'; }
    else { aOut[i] = 'loss'; dOut[i] = 'win'; }
  }
  return { a, d, aOut, dOut };
}

const ROLL_MS = 560;

export function DicePanel({ result, seq }: { result: CombatResult | null; seq: number }) {
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<{ att: number[]; def: number[] }>({ att: [], def: [] });

  useEffect(() => {
    if (!result) return;
    setRolling(true);
    const rnd = (n: number) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const iv = setInterval(() => {
      setFaces({ att: rnd(result.attackerRolls.length), def: rnd(result.defenderRolls.length) });
    }, 70);
    const to = setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
    }, ROLL_MS);
    return () => { clearInterval(iv); clearTimeout(to); };
  }, [seq, result]);

  if (!result) return null;

  const { a, d, aOut, dOut } = computeOutcomes(result.attackerRolls, result.defenderRolls);
  const attColor = PLAYER_COLORS[result.attacker] ?? '#4a90d9';
  const defColor = PLAYER_COLORS[result.defender] ?? '#e05555';

  return (
    <div style={panelStyle}>
      <style>{KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 18 }}>
        {/* Attacker */}
        <div style={{ textAlign: 'center' }}>
          <Label color={attColor}>{result.attacker}</Label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', minHeight: 40 }}>
            {a.map((v, i) => (
              <div key={i} style={{ animation: rolling ? 'shake .25s infinite' : 'none' }}>
                <Die value={rolling ? (faces.att[i] ?? v) : v} outcome={rolling ? 'rolling' : aOut[i]!} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ alignSelf: 'center', color: '#7a8699', fontWeight: 700, fontSize: 18 }}>vs</div>

        {/* Defender */}
        <div style={{ textAlign: 'center' }}>
          <Label color={defColor}>{result.defender}</Label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', minHeight: 40 }}>
            {d.map((v, i) => (
              <div key={i} style={{ animation: rolling ? 'shake .25s infinite' : 'none' }}>
                <Die value={rolling ? (faces.def[i] ?? v) : v} outcome={rolling ? 'rolling' : dOut[i]!} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginTop: 10, fontSize: 13, color: '#cdd5e0', textAlign: 'center', minHeight: 18 }}>
        {rolling ? (
          <span style={{ color: '#8a93a3' }}>Rolling…</span>
        ) : (
          <>
            <span style={{ color: '#ff8a7a' }}>−{result.attackerLosses}</span>
            <span style={{ color: '#7a8699' }}> attacker · </span>
            <span style={{ color: '#ff8a7a' }}>−{result.defenderLosses}</span>
            <span style={{ color: '#7a8699' }}> defender</span>
            {result.captured && (
              <span style={{ color: '#ffd23f', fontWeight: 700 }}> · Captured!</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Label({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color, marginBottom: 6 }}>
      {String(children).toUpperCase()}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(15, 22, 38, 0.94)',
  border: '1px solid #2a3650',
  borderRadius: 12,
  padding: '12px 18px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
  animation: 'dropIn .22s ease-out',
  pointerEvents: 'none',
  zIndex: 5,
};

const KEYFRAMES = `
@keyframes shake { 0%{transform:translateY(-1px) rotate(-4deg)} 50%{transform:translateY(1px) rotate(4deg)} 100%{transform:translateY(-1px) rotate(-4deg)} }
@keyframes dropIn { from{opacity:0} to{opacity:1} }
`;

// Re-export ids so callers importing from Dice get consistent constants.
export { HUMAN_ID, CPU_ID };
