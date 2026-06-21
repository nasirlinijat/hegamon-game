import { createContext, useContext } from 'react';
import { type PlayerId } from '../engine/state';
import { NEUTRAL_ID, ZOMBIE_ID } from '../engine/state';

export interface PlayerCtx {
  myId: PlayerId;
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
}

const PALETTE = ['#3d7fd6', '#d6453d', '#4a9e5c', '#d99b32', '#9b59b6', '#16a0a0'];

/** Default single-player context: human is seat 'You', CPU seats keep palette colors. */
export const DEFAULT_PLAYER_CTX: PlayerCtx = {
  myId: 'You',
  playerColors: {
    'You':   PALETTE[0]!,
    'CPU 1': PALETTE[1]!,
    'CPU 2': PALETTE[2]!,
    'CPU 3': PALETTE[3]!,
    'CPU 4': PALETTE[4]!,
    'CPU 5': PALETTE[5]!,
    [NEUTRAL_ID]: '#4a5568',
    [ZOMBIE_ID]:  '#4a7a40',
  },
  playerNames: {
    'You': 'You',
    'CPU 1': 'CPU 1', 'CPU 2': 'CPU 2', 'CPU 3': 'CPU 3',
    'CPU 4': 'CPU 4', 'CPU 5': 'CPU 5',
  },
};

export const PlayerContext = createContext<PlayerCtx>(DEFAULT_PLAYER_CTX);

export function usePlayer() {
  return useContext(PlayerContext);
}

/** Build a PlayerCtx from the server's per-game seat assignments. */
export function buildPlayerCtx(
  myId: PlayerId,
  playerColors: Record<string, string>,
  playerNames: Record<string, string>,
): PlayerCtx {
  return {
    myId,
    playerColors: { ...playerColors, [NEUTRAL_ID]: '#4a5568', [ZOMBIE_ID]: '#4a7a40' },
    playerNames,
  };
}
