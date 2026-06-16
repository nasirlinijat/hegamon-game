import { TERRITORIES, type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { blend, darken, lighten } from './colors';
import {
  BRIDGES,
  CONTINENT_TINT,
  MAP_H,
  MAP_W,
  TERRITORY_CENTROID,
  TERRITORY_SHAPES,
  WRAP_STUBS,
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

function pointsAttr(id: TerritoryId): string {
  return TERRITORY_SHAPES[id].map(([x, y]) => `${x},${y}`).join(' ');
}

export function Board({
  state, selected, validTargets, hoverTargets, hovered, onTerritoryClick, onHover,
}: Props) {
  const ids = Object.keys(TERRITORY_SHAPES) as TerritoryId[];

  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <radialGradient id="ocean" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#15314f" />
          <stop offset="100%" stopColor="#0a1a2c" />
        </radialGradient>
      </defs>

      <style>{`
        @keyframes dash { to { stroke-dashoffset: -16; } }
        .target-pulse { animation: dash 0.8s linear infinite; }
      `}</style>

      <rect width={MAP_W} height={MAP_H} fill="url(#ocean)" />

      {/* Sea bridges (dashed connectors) */}
      {BRIDGES.map(([a, b]) => {
        const pa = TERRITORY_CENTROID[a];
        const pb = TERRITORY_CENTROID[b];
        return (
          <line
            key={`${a}-${b}`}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke="#3a5573" strokeWidth={1.4} strokeDasharray="5 5" opacity={0.7}
          />
        );
      })}
      {WRAP_STUBS.map((s) => {
        const p = TERRITORY_CENTROID[s.from];
        return (
          <g key={s.from}>
            <line
              x1={p.x} y1={p.y} x2={s.toEdge} y2={p.y}
              stroke="#3a5573" strokeWidth={1.4} strokeDasharray="5 5" opacity={0.7}
            />
            <text
              x={s.toEdge < MAP_W / 2 ? s.toEdge + 8 : s.toEdge - 8} y={p.y + 4}
              fill="#54708e" fontSize={14} textAnchor={s.toEdge < MAP_W / 2 ? 'start' : 'end'}
            >
              {s.label}
            </text>
          </g>
        );
      })}

      {/* Territories */}
      {ids.map((id) => {
        const continent = TERRITORIES[id].continent;
        const tint = CONTINENT_TINT[continent];
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? '#888';

        const isSelected = id === selected;
        const isTarget = validTargets.has(id);
        const isHoverTarget = hoverTargets.has(id);
        const isHovered = id === hovered;

        // Fill: continent tint with a slight nudge toward the owner color for legibility.
        let fill = blend(tint, ownerColor, 0.16);
        if (isHovered) fill = lighten(fill, 0.12);
        if (isSelected) fill = lighten(fill, 0.18);

        // Border conveys ownership; selection/target override with brighter strokes.
        let stroke = darken(ownerColor, 0.15);
        let strokeWidth = 2.2;
        let dash: string | undefined;
        let pulse = false;
        if (isSelected) { stroke = '#ffd23f'; strokeWidth = 3.6; }
        else if (isTarget) { stroke = '#ff7a1a'; strokeWidth = 3; dash = '6 4'; pulse = true; }
        else if (isHoverTarget) { stroke = '#ff9a4a'; strokeWidth = 2.4; dash = '4 4'; }

        return (
          <polygon
            key={id}
            points={pointsAttr(id)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            {...(dash ? { strokeDasharray: dash } : {})}
            className={pulse ? 'target-pulse' : undefined}
            style={{ cursor: 'pointer', transition: 'fill .12s' }}
            onClick={() => onTerritoryClick(id)}
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{TERRITORIES[id].name}</title>
          </polygon>
        );
      })}

      {/* Army badges (plastic-piece tokens) */}
      {ids.map((id) => {
        const { x, y } = TERRITORY_CENTROID[id];
        const owner = state.owner[id];
        const ownerColor = PLAYER_COLORS[owner] ?? '#888';
        const armies = state.armies[id] ?? 0;
        return (
          <g key={`badge-${id}`} style={{ pointerEvents: 'none' }}>
            <circle cx={x} cy={y + 1} r={12.5} fill="rgba(0,0,0,0.35)" />
            <circle cx={x} cy={y} r={12.5} fill="#141b27" stroke={ownerColor} strokeWidth={3} />
            <text
              x={x} y={y + 0.5}
              textAnchor="middle" dominantBaseline="central"
              fontSize={armies >= 10 ? 10 : 12} fontWeight={800} fill="#fff"
            >
              {armies}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
