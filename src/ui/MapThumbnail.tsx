import { getMap } from '../engine/map-registry';
import { type MapId } from '../engine/modes';
import { getMapRender } from './map-render';
import { CONTINENT_TINT } from './territory-shapes';

interface Props {
  mapId: MapId;
  width?: number;
}

const TINT = CONTINENT_TINT as Record<string, string>;
const FALLBACK_FILL = '#2a4a60';

export function MapThumbnail({ mapId, width = 150 }: Props) {
  const height = Math.round(width * (720 / 1280));
  const render = getMapRender(mapId);
  const map = getMap(mapId);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${render.MAP_W} ${render.MAP_H}`}
      style={{ display: 'block', borderRadius: 6, flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`thumb-ocean-${mapId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1f36" />
          <stop offset="100%" stopColor="#0e2a45" />
        </linearGradient>
      </defs>
      <rect width={render.MAP_W} height={render.MAP_H} fill={`url(#thumb-ocean-${mapId})`} />
      <path d={render.LAND_PATH} fill="#1e3d56" />
      {render.ALL_IDS.map((id) => {
        const continent = map.territories[id]?.continent ?? '';
        const fill = TINT[continent] ?? FALLBACK_FILL;
        const d = render.TERRITORY_PATH[id];
        if (!d) return null;
        return (
          <path
            key={id}
            d={d}
            fill={fill}
            fillOpacity={0.65}
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}
