import { PLAYER_COLORS } from './App';
import type { PlayerId } from '../engine/state';

interface Props {
  playerId: PlayerId;
  size?: number;
  alive?: boolean;
}

export function Avatar({ playerId, size = 36, alive = true }: Props) {
  const color = PLAYER_COLORS[playerId] ?? '#5a6272';
  const initial = playerId.charAt(0).toUpperCase();
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, opacity: alive ? 1 : 0.4 }}>
      <circle cx={r} cy={r} r={r - 2} fill={color} />
      <circle cx={r} cy={r} r={r - 2} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
      <text
        x={r} y={r + 0.5}
        textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.42} fontWeight={800}
        fill="#fff"
        fontFamily="system-ui, sans-serif"
        style={{ userSelect: 'none' }}
      >{initial}</text>
    </svg>
  );
}
