import { TERRITORIES, type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { darken, lighten } from './colors';
import { MAP_W, MAP_H, TERRITORY_PATH, TERRITORY_CENTROID, LAND_PATH } from './map-geometry';
import { BRIDGES } from './territory-shapes';

interface Props {
  state: GameState;
  selected: TerritoryId | null;
  validTargets: Set<TerritoryId>;
  hoverTargets: Set<TerritoryId>;
  hovered: TerritoryId | null;
  onTerritoryClick: (id: TerritoryId) => void;
  onHover: (id: TerritoryId | null) => void;
}

const NEUTRAL_COLOR = '#4a5568';

// Gradient ID for each player's coin token (created once in <defs>).
const COIN_GRAD_ID = (owner: string) => `coin-${owner.replace(/\s/g, '-')}`;

const ALL_IDS = Object.keys(TERRITORY_PATH) as TerritoryId[];

// Alaska ↔ Kamchatka dateline stubs (right edge and left edge of the new MAP_W).
const WRAP_STUBS = [
  { from: 'alaska'    as TerritoryId, toEdge: 4,          label: '↜' },
  { from: 'kamchatka' as TerritoryId, toEdge: MAP_W - 4,  label: '↝' },
];

export function Board({
  state, selected, validTargets, hoverTargets, hovered, onTerritoryClick, onHover,
}: Props) {
  const playerIds = Object.keys(PLAYER_COLORS);

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        {/* Ocean gradient */}
        <radialGradient id="ocean-grad" cx="50%" cy="44%" r="72%">
          <stop offset="0%"   stopColor="#14304d" />
          <stop offset="100%" stopColor="#060e1c" />
        </radialGradient>

        {/* Subtle graticule dot grid */}
        <pattern id="graticule" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="0.7" fill="#ffffff" opacity="0.05" />
        </pattern>

        {/* Cyan coastline glow filter */}
        <filter id="coast-glow" x="-4%" y="-4%" width="108%" height="108%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feColorMatrix in="blur" type="saturate" values="4" result="vivid" />
          <feMerge>
            <feMergeNode in="vivid" />
            <feMergeNode in="vivid" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Territory selection / target glow filters */}
        <filter id="glow-sel" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0.8 0 0 0.3  0.8 0.6 0 0 0.1  0 0 0 0 0  0 0 0 1 0" result="gold" />
          <feMerge><feMergeNode in="gold" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-target" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* Per-player radial gradient for coin tokens */}
        {playerIds.map((pid) => {
          const base = PLAYER_COLORS[pid] ?? NEUTRAL_COLOR;
          return (
            <radialGradient key={pid} id={COIN_GRAD_ID(pid)} cx="35%" cy="30%" r="65%">
              <stop offset="0%"   stopColor={lighten(base, 0.45)} stopOpacity="1" />
              <stop offset="60%"  stopColor={base}                stopOpacity="1" />
              <stop offset="100%" stopColor={darken(base, 0.30)}  stopOpacity="1" />
            </radialGradient>
          );
        })}
        {/* Neutral coin gradient */}
        <radialGradient id="coin-neutral" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stopColor={lighten(NEUTRAL_COLOR, 0.45)} />
          <stop offset="60%"  stopColor={NEUTRAL_COLOR} />
          <stop offset="100%" stopColor={darken(NEUTRAL_COLOR, 0.30)} />
        </radialGradient>
      </defs>

      <style>{`
        @keyframes dashMove { to { stroke-dashoffset: -14; } }
        .target-dash { animation: dashMove 0.65s linear infinite; }
      `}</style>

      {/* ── Ocean ─────────────────────────────────────────────────────────── */}
      <rect width={MAP_W} height={MAP_H} fill="url(#ocean-grad)" />
      <rect width={MAP_W} height={MAP_H} fill="url(#graticule)" />

      {/* ── Coastline glow (underneath territory fills) ──────────────────── */}
      <path
        d={LAND_PATH}
        fill="none"
        stroke="#00e5ff"
        strokeWidth={2.5}
        opacity={0.55}
        filter="url(#coast-glow)"
        style={{ pointerEvents: 'none' }}
      />

      {/* ── Territory fills — owner-colored ───────────────────────────────── */}
      {ALL_IDS.map((id) => {
        const owner = state.owner[id];
        const base = PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;

        const isSelected    = id === selected;
        const isTarget      = validTargets.has(id);
        const isHoverTarget = hoverTargets.has(id);
        const isHovered     = id === hovered;

        let fill = owner ? base : NEUTRAL_COLOR;
        if (isHovered || isHoverTarget) fill = lighten(fill, 0.15);
        if (isSelected)                  fill = lighten(fill, 0.22);

        let stroke = 'rgba(0,0,0,0.5)';
        let strokeWidth = 0.8;
        let dash: string | undefined;
        let pulse = false;
        let filter: string | undefined;

        if (isSelected)        { stroke = '#ffd23f'; strokeWidth = 2.5; filter = 'url(#glow-sel)'; }
        else if (isTarget)     { stroke = '#ff7b1a'; strokeWidth = 2.2; dash = '6 4'; pulse = true; filter = 'url(#glow-target)'; }
        else if (isHoverTarget){ stroke = '#ffb060'; strokeWidth = 1.8; dash = '4 4'; }

        return (
          <path
            key={id}
            d={TERRITORY_PATH[id]}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            fillOpacity={0.86}
            {...(dash   ? { strokeDasharray: dash } : {})}
            {...(filter ? { filter }                : {})}
            className={pulse ? 'target-dash' : undefined}
            style={{ cursor: 'pointer', transition: 'fill .12s' }}
            onClick={() => onTerritoryClick(id)}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{TERRITORIES[id].name}</title>
          </path>
        );
      })}

      {/* ── Sea routes (BRIDGES + dateline stubs) ────────────────────────── */}
      {BRIDGES.map(([a, b]) => {
        const pa = TERRITORY_CENTROID[a];
        const pb = TERRITORY_CENTROID[b];
        if (!pa || !pb) return null;
        return (
          <g key={`br-${a}-${b}`}>
            <line
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke="#4a90c8" strokeWidth={1.2} strokeDasharray="5 5" opacity={0.6}
            />
            <circle cx={pa.x} cy={pa.y} r={3} fill="#c8e0f0" opacity={0.75} />
            <circle cx={pb.x} cy={pb.y} r={3} fill="#c8e0f0" opacity={0.75} />
          </g>
        );
      })}

      {/* Dateline wrap stubs (Alaska ↔ Kamchatka) */}
      {WRAP_STUBS.map((s) => {
        const p = TERRITORY_CENTROID[s.from];
        if (!p) return null;
        return (
          <g key={s.from}>
            <line
              x1={p.x} y1={p.y} x2={s.toEdge} y2={p.y}
              stroke="#4a90c8" strokeWidth={1.2} strokeDasharray="5 5" opacity={0.6}
            />
            <circle cx={p.x} cy={p.y} r={3} fill="#c8e0f0" opacity={0.75} />
            <text
              x={s.toEdge < MAP_W / 2 ? s.toEdge + 5 : s.toEdge - 5}
              y={p.y + 4}
              fill="#6ab0e0" fontSize={13}
              textAnchor={s.toEdge < MAP_W / 2 ? 'start' : 'end'}
              style={{ pointerEvents: 'none' }}
            >{s.label}</text>
          </g>
        );
      })}

      {/* ── Territory name labels ─────────────────────────────────────────── */}
      {ALL_IDS.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        const name = TERRITORIES[id].name;
        const short = name.length > 13 ? name.slice(0, 12) + '…' : name;
        return (
          <text
            key={`label-${id}`}
            x={x} y={y - 16}
            textAnchor="middle" dominantBaseline="central"
            fontSize={7.5} fontWeight={700}
            fill="#e8f0f8"
            fontFamily="system-ui, sans-serif"
            style={{
              pointerEvents: 'none',
              paintOrder: 'stroke',
              stroke: 'rgba(6,12,24,0.9)',
              strokeWidth: 2.2,
              strokeLinejoin: 'round',
              letterSpacing: 0.3,
            }}
          >{short}</text>
        );
      })}

      {/* ── Coin-style army tokens ────────────────────────────────────────── */}
      {ALL_IDS.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        const owner = state.owner[id];
        const armies = state.armies[id] ?? 0;
        const r = armies >= 100 ? 14 : armies >= 10 ? 12 : 11;
        const gradId = owner ? COIN_GRAD_ID(owner) : 'coin-neutral';
        const ring = owner ? (PLAYER_COLORS[owner] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR;

        return (
          <g key={`coin-${id}`} style={{ pointerEvents: 'none' }}>
            {/* Drop shadow */}
            <circle cx={x + 1} cy={y + 2} r={r + 1} fill="rgba(0,0,0,0.45)" />
            {/* Main coin body */}
            <circle cx={x} cy={y} r={r + 1} fill={`url(#${gradId})`} />
            {/* Darker ring border */}
            <circle cx={x} cy={y} r={r + 1} fill="none" stroke={darken(ring, 0.40)} strokeWidth={1.8} />
            {/* Specular highlight */}
            <ellipse cx={x - r * 0.25} cy={y - r * 0.3} rx={r * 0.45} ry={r * 0.25}
              fill="rgba(255,255,255,0.28)" />
            {/* Army count */}
            <text
              x={x} y={y + 0.5}
              textAnchor="middle" dominantBaseline="central"
              fontSize={armies >= 100 ? 8 : armies >= 10 ? 9.5 : 10.5}
              fontWeight={800}
              fill="#ffffff"
              fontFamily="system-ui, sans-serif"
              style={{
                paintOrder: 'stroke',
                stroke: 'rgba(0,0,0,0.4)',
                strokeWidth: 1,
              }}
            >{armies}</text>
          </g>
        );
      })}
    </svg>
  );
}
