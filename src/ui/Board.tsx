import { TERRITORIES, type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { darken, lighten } from './colors';
import {
  BRIDGES,
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
        {/* Ocean background gradient */}
        <radialGradient id="ocean-grad" cx="50%" cy="44%" r="78%">
          <stop offset="0%"   stopColor="#1b3a58" />
          <stop offset="100%" stopColor="#091524" />
        </radialGradient>

        {/* Subtle graticule dot-grid pattern for ocean texture */}
        <pattern id="graticule" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="16" cy="16" r="0.9" fill="#ffffff" opacity="0.06" />
        </pattern>

        {/* Glow filter for selected territory */}
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

      {/* Wrap stubs (Alaska ↔ Kamchatka dateline) */}
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

      {/* Territory fills */}
      {ids.map((id) => {
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;

        const isSelected    = id === selected;
        const isTarget      = validTargets.has(id);
        const isHoverTarget = hoverTargets.has(id);
        const isHovered     = id === hovered;

        let fill = ownerColor;
        if (isHovered || isHoverTarget) fill = lighten(fill, 0.18);
        if (isSelected) fill = lighten(fill, 0.22);

        let stroke = darken(ownerColor, 0.35);
        let strokeWidth = 1.2;
        let dash: string | undefined;
        let pulse = false;
        let filter: string | undefined;

        if (isSelected)       { stroke = '#ffd23f'; strokeWidth = 2.8; filter = 'url(#glow-sel)'; }
        else if (isTarget)    { stroke = '#ff8c1a'; strokeWidth = 2.4; dash = '7 4'; pulse = true; filter = 'url(#glow-target)'; }
        else if (isHoverTarget){ stroke = '#ffb060'; strokeWidth = 1.8; dash = '5 4'; }

        const d = smoothClosedPath(TERRITORY_SHAPES[id]);
        return (
          <path
            key={id}
            d={d}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            {...(dash   ? { strokeDasharray: dash }     : {})}
            {...(filter ? { filter }                     : {})}
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

      {/* Army badges — white disc, owner ring, dark bold count */}
      {ids.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? NEUTRAL_COLOR;
        const armies = state.armies[id] ?? 0;
        const r = armies >= 100 ? 14 : armies >= 10 ? 13 : 12;
        return (
          <g key={`badge-${id}`} style={{ pointerEvents: 'none' }}>
            {/* Shadow */}
            <circle cx={x} cy={y + 1.5} r={r + 1} fill="rgba(0,0,0,0.4)" />
            {/* White disc */}
            <circle cx={x} cy={y} r={r + 1} fill="#f5f5f0" />
            {/* Owner ring */}
            <circle cx={x} cy={y} r={r + 1} fill="none" stroke={ownerColor} strokeWidth={3} />
            {/* Army count */}
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
