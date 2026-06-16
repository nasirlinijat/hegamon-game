import { ADJACENCY, TERRITORIES, type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { PLAYER_COLORS } from './App';
import { TERRITORY_COORDS } from './territory-coords';

const W = 1000;
const H = 480;
const R = 18; // territory circle radius

interface Props {
  state: GameState;
  selected: TerritoryId | null;
  validTargets: Set<TerritoryId>;
  onTerritoryClick: (id: TerritoryId) => void;
}

// Build undirected edge list once
const EDGES: [TerritoryId, TerritoryId][] = (() => {
  const seen = new Set<string>();
  const result: [TerritoryId, TerritoryId][] = [];
  for (const [a, neighbours] of Object.entries(ADJACENCY) as [TerritoryId, readonly TerritoryId[]][]) {
    for (const b of neighbours) {
      const key = [a, b].sort().join('|');
      if (!seen.has(key)) { seen.add(key); result.push([a, b]); }
    }
  }
  return result;
})();

// Alaska↔Kamchatka spans the dateline — skip the line, note it with a dashed edge instead
const SKIP_DRAW = new Set(['alaska|kamchatka']);

export function Board({ state, selected, validTargets, onTerritoryClick }: Props) {
  const ids = Object.keys(TERRITORY_COORDS) as TerritoryId[];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <rect width={W} height={H} fill="#0d2137" />

      {/* Adjacency edges */}
      {EDGES.map(([a, b]) => {
        const key = [a, b].sort().join('|');
        if (SKIP_DRAW.has(key)) return null;
        const pa = TERRITORY_COORDS[a];
        const pb = TERRITORY_COORDS[b];
        return <line key={key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#1e3a5f" strokeWidth={1.5} />;
      })}

      {/* Territory circles + labels */}
      {ids.map((id) => {
        const { x, y } = TERRITORY_COORDS[id];
        const owner = state.owner[id];
        const armies = state.armies[id] ?? 0;
        const fill = owner ? (PLAYER_COLORS[owner] ?? '#888') : '#888';
        const isSelected = id === selected;
        const isTarget = validTargets.has(id);
        const stroke = isSelected ? '#ffe066' : isTarget ? '#ff9944' : '#000d1a';
        const strokeW = isSelected || isTarget ? 3 : 1.5;

        return (
          <g key={id} onClick={() => onTerritoryClick(id)} style={{ cursor: 'pointer' }}>
            <title>{TERRITORIES[id].name}</title>
            {isTarget && (
              <circle cx={x} cy={y} r={R + 6} fill="none" stroke="#ff9944" strokeWidth={1} opacity={0.5} />
            )}
            <circle cx={x} cy={y} r={R} fill={fill} stroke={stroke} strokeWidth={strokeW} opacity={0.92} />
            <text
              x={x} y={y + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={armies >= 10 ? 10 : 12} fontWeight="700" fill="#fff"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {armies}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
