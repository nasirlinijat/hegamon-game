import { TERRITORIES, type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { darken, lighten } from './colors';
import {
  BRIDGES,
  CONTINENT_TINT,
  MAP_H,
  MAP_W,
  TERRITORY_CENTROID,
  TERRITORY_SHAPES,
  WRAP_STUBS,
  smoothClosedPath,
} from './territory-shapes';

interface Props {
  state: GameState;
  selected: TerritoryId | null;
  validTargets: Set<TerritoryId>;
  hoverTargets: Set<TerritoryId>;
  hovered: TerritoryId | null;
  onTerritoryClick: (id: TerritoryId) => void;
  onHover: (id: TerritoryId | null) => void;
}

const NEUTRAL_COLOR = '#5a6272';

function abbrevName(name: string): string {
  // Drop a trailing "United States"/"Australia" qualifier-ish length; keep it short.
  return name.length > 13 ? name.slice(0, 12) + '…' : name;
}

export function Board({
  state, selected, validTargets, hoverTargets, hovered, onTerritoryClick, onHover,
}: Props) {
  const ids = Object.keys(TERRITORY_SHAPES) as TerritoryId[];

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <radialGradient id="ocean-grad" cx="50%" cy="44%" r="78%">
          <stop offset="0%"   stopColor="#1b3a58" />
          <stop offset="100%" stopColor="#091524" />
        </radialGradient>

        <pattern id="graticule" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="16" cy="16" r="0.9" fill="#ffffff" opacity="0.06" />
        </pattern>

        <filter id="glow-sel" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow-target" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <style>{`
        @keyframes dashMove { to { stroke-dashoffset: -16; } }
        .target-dash { animation: dashMove 0.7s linear infinite; }
      `}</style>

      {/* Ocean */}
      <rect width={MAP_W} height={MAP_H} fill="url(#ocean-grad)" />
      <rect width={MAP_W} height={MAP_H} fill="url(#graticule)" />

      {/* Sea bridges */}
      {BRIDGES.map(([a, b]) => {
        const pa = TERRITORY_CENTROID[a];
        const pb = TERRITORY_CENTROID[b];
        return (
          <line
            key={`br-${a}-${b}`}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="#4a7ca8" strokeWidth={1} strokeDasharray="4 5" opacity={0.55}
          />
        );
      })}

      {/* Dateline wrap stubs (Alaska ↔ Kamchatka) */}
      {WRAP_STUBS.map((s) => {
        const p = TERRITORY_CENTROID[s.from];
        return (
          <g key={s.from}>
            <line
              x1={p.x} y1={p.y} x2={s.toEdge} y2={p.y}
              stroke="#4a7ca8" strokeWidth={1} strokeDasharray="4 5" opacity={0.55}
            />
            <text
              x={s.toEdge < MAP_W / 2 ? s.toEdge + 6 : s.toEdge - 6}
              y={p.y + 4}
              fill="#5a8ab8" fontSize={12} textAnchor={s.toEdge < MAP_W / 2 ? 'start' : 'end'}
            >{s.label}</text>
          </g>
        );
      })}

      {/* Territory fills — continent-colored, owner shown via border + badge */}
      {ids.map((id) => {
        const continent = TERRITORIES[id].continent;
        const tint = CONTINENT_TINT[continent];
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;

        const isSelected    = id === selected;
        const isTarget      = validTargets.has(id);
        const isHoverTarget = hoverTargets.has(id);
        const isHovered     = id === hovered;

        let fill = tint;
        if (isHovered || isHoverTarget) fill = lighten(fill, 0.14);
        if (isSelected) fill = lighten(fill, 0.20);

        // Border conveys ownership; selection/target override with brighter strokes.
        let stroke = darken(ownerColor, 0.10);
        let strokeWidth = 2.4;
        let dash: string | undefined;
        let pulse = false;
        let filter: string | undefined;

        if (isSelected)        { stroke = '#ffd23f'; strokeWidth = 3.4; filter = 'url(#glow-sel)'; }
        else if (isTarget)     { stroke = '#ff8c1a'; strokeWidth = 3;   dash = '7 4'; pulse = true; filter = 'url(#glow-target)'; }
        else if (isHoverTarget){ stroke = '#ffb060'; strokeWidth = 2.6; dash = '5 4'; }

        const d = smoothClosedPath(TERRITORY_SHAPES[id]);
        return (
          <path
            key={id}
            d={d}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            {...(dash   ? { strokeDasharray: dash } : {})}
            {...(filter ? { filter }                : {})}
            className={pulse ? 'target-dash' : undefined}
            style={{ cursor: 'pointer', transition: 'fill .1s' }}
            onClick={() => onTerritoryClick(id)}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{TERRITORIES[id].name}</title>
          </path>
        );
      })}

      {/* Territory name labels */}
      {ids.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        return (
          <text
            key={`label-${id}`}
            x={x} y={y - 13}
            textAnchor="middle" dominantBaseline="central"
            fontSize={8} fontWeight={600}
            fill="#f3f6fb"
            fontFamily="system-ui, sans-serif"
            style={{
              pointerEvents: 'none',
              paintOrder: 'stroke',
              stroke: 'rgba(8,16,28,0.85)',
              strokeWidth: 2.4,
              strokeLinejoin: 'round',
              letterSpacing: 0.2,
            }}
          >{abbrevName(TERRITORIES[id].name)}</text>
        );
      })}

      {/* Army badges — white disc, owner ring, dark count */}
      {ids.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;
        const armies = state.armies[id] ?? 0;
        const r = armies >= 100 ? 13 : armies >= 10 ? 12 : 11;
        return (
          <g key={`badge-${id}`} style={{ pointerEvents: 'none' }}>
            <circle cx={x} cy={y + 1.5} r={r + 1} fill="rgba(0,0,0,0.4)" />
            <circle cx={x} cy={y} r={r + 1} fill="#f5f5f0" />
            <circle cx={x} cy={y} r={r + 1} fill="none" stroke={ownerColor} strokeWidth={3} />
            <text
              x={x} y={y + 0.5}
              textAnchor="middle" dominantBaseline="central"
              fontSize={armies >= 100 ? 9 : armies >= 10 ? 10 : 11}
              fontWeight={800}
              fill="#14202e"
              fontFamily="system-ui, sans-serif"
            >{armies}</text>
          </g>
        );
      })}
    </svg>
  );
}
