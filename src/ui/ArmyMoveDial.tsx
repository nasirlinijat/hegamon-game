import { useEffect, useRef, useState } from 'react';
import type { TerritoryId, GameMap } from '../engine/map';

type Kind = 'fortify' | 'capture' | 'blitz' | 'place';

interface Props {
  kind: Kind;
  from: TerritoryId;
  to: TerritoryId;
  min: number;
  max: number;
  color: string;
  /** Active board, used to resolve territory display names. */
  map: GameMap;
  /** Confirm the move with the number currently inside the circle. */
  onConfirm: (count: number) => void;
  /** Fortify / blitz — back out without acting. (Capture's combat is already resolved.) */
  onCancel?: () => void;
}

const LABELS: Record<Kind, { tag: string; verb: string; behind: string }> = {
  fortify: { tag: '⟳ FORTIFY', verb: 'move',   behind: 'behind'    },
  capture: { tag: '⚔ OCCUPY',  verb: 'occupy', behind: 'behind'    },
  blitz:   { tag: '⚡ BLITZ',   verb: 'blitz',  behind: 'in reserve' },
  place:   { tag: '＋ DEPLOY',  verb: 'deploy', behind: 'still to place' },
};

const TRACK_W = 280;   // px
const R = 38;          // circle radius

/**
 * A single coin-style circle holding the number of armies to carry. Drag it left/right
 * along the track to change the number; tap the circle (or press Enter) to use that number.
 */
export function ArmyMoveDial({ kind, from, to, min, max, color, map, onConfirm, onCancel }: Props) {
  const [count, setCount] = useState(max);   // default: carry as many as allowed
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  useEffect(() => { setCount(clamp(max)); /* reset on new move */ }, [from, to, min, max]);

  const frac = max > min ? (count - min) / (max - min) : 0;
  const cx = R + frac * (TRACK_W - 2 * R);            // circle centre x within the track
  // For moves: armies left in the source (max+1−count). For placement: armies still unplaced (max−count).
  const remainder = kind === 'place' ? max - count : max + 1 - count;

  function valueFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return count;
    const x = clientX - rect.left;
    const f = (x - R) / (TRACK_W - 2 * R);
    return clamp(Math.round(min + f * (max - min)));
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    movedRef.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const v = valueFromClientX(e.clientX);
    if (v !== count) movedRef.current = true;
    setCount(v);
  }
  function onPointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (!movedRef.current) onConfirm(clamp(count));   // a tap (no drag) = confirm
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setCount((c) => clamp(c - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setCount((c) => clamp(c + 1)); }
      if (e.key === 'Enter')      { e.preventDefault(); onConfirm(clamp(count)); }
      if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, min, max, onConfirm, onCancel]);

  return (
    <div style={backdrop} onPointerDown={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}>
      <div style={{
        background: 'rgba(7,13,26,0.98)',
        border: '1px solid rgba(196,146,42,0.22)',
        borderRadius: 18,
        padding: '26px 36px 28px',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.75)',
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* Route + leave-behind readout */}
        <div style={{ fontSize: 12, color: '#c7d3e2', textAlign: 'center' }}>
          <span style={{ fontWeight: 800, color: '#C4922A', letterSpacing: 2, fontSize: 9, textTransform: 'uppercase' as const }}>
            {LABELS[kind].tag}
          </span>
          <div style={{ marginTop: 2 }}>
            <b style={{ color: '#e8f0f8' }}>{map.territories[from]?.name ?? from}</b>
            {kind !== 'place' && (
              <>
                <span style={{ color: '#5a6a7a' }}> → </span>
                <b style={{ color: '#e8f0f8' }}>{map.territories[to]?.name ?? to}</b>
              </>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6a7a8a', marginTop: 2 }}>
            {kind === 'place'
              ? <><b style={{ color: '#9aa8b8' }}>{remainder}</b> {LABELS[kind].behind}</>
              : <>leaving <b style={{ color: '#9aa8b8' }}>{remainder}</b> {LABELS[kind].behind}</>}
          </div>
        </div>

        {/* Track with the draggable coin */}
        <div
          ref={trackRef}
          style={{ position: 'relative', width: TRACK_W, height: R * 2 + 8, touchAction: 'none' }}
        >
          {/* Track line */}
          <div style={{
            position: 'absolute', top: '50%', left: R, right: R, height: 6,
            transform: 'translateY(-50%)', borderRadius: 3,
            background: 'rgba(255,255,255,0.10)',
          }} />
          {/* Filled portion up to the coin */}
          <div style={{
            position: 'absolute', top: '50%', left: R, width: Math.max(0, cx - R), height: 6,
            transform: 'translateY(-50%)', borderRadius: 3,
            background: `linear-gradient(90deg, ${color}55, ${color})`,
          }} />
          {/* Min / max ticks */}
          <Tick x={R} label={`${min}`} />
          <Tick x={TRACK_W - R} label={`${max}`} />

          {/* The coin */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              position: 'absolute', top: 4, left: cx - R,
              width: R * 2, height: R * 2, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${lighten(color, 0.45)}, ${color} 60%, ${darken(color, 0.3)})`,
              border: `2px solid ${darken(color, 0.4)}`,
              boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'grab', userSelect: 'none', touchAction: 'none',
            }}
          >
            <span style={{
              fontSize: count >= 100 ? 22 : count >= 10 ? 26 : 30, fontWeight: 800, color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none',
            }}>{count}</span>
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#5a6a7a', letterSpacing: 0.4, textAlign: 'center' }}>
          drag to set · tap circle or Enter to {LABELS[kind].verb}
          {onCancel ? ' · Esc to cancel' : ''}
        </div>
      </div>
      </div>
    </div>
  );
}

function Tick({ x, label }: { x: number; label: string }) {
  return (
    <span style={{
      position: 'absolute', top: '100%', left: x, transform: 'translateX(-50%)',
      fontSize: 9, color: '#6a7a8a', marginTop: 2,
    }}>{label}</span>
  );
}

// Local hex helpers (kept independent of colors.ts so this component is self-contained).
function mix(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const c = (v: number) => Math.round(v + (target - v) * t);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
const lighten = (hex: string, t: number) => mix(hex, 255, t);
const darken = (hex: string, t: number) => mix(hex, 0, t);

const backdrop: React.CSSProperties = {
  position: 'absolute', inset: 0, zIndex: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(2,6,14,0.60)',
};
