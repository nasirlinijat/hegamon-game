// Registry of playable boards. The engine resolves a `GameMap` from a `config.mapId` here, so
// game logic never hard-codes a particular board. Add a new board by importing its `GameMap`
// and registering it in `MAPS`.

import { type GameMap, CLASSIC_MAP } from './map';
import { type MapId } from './modes';
import { IMPERIAL_MAP } from './imperial-map';
import { VERDANTIA_MAP } from './verdantia-map';
import { ISLES_MAP } from './isles-map';
import { LONGMARCH_MAP } from './longmarch-map';
import { TWINCROWNS_MAP } from './twincrowns-map';

export const MAPS: Record<MapId, GameMap> = {
  classic: CLASSIC_MAP,
  imperial: IMPERIAL_MAP,
  verdantia: VERDANTIA_MAP,
  isles: ISLES_MAP,
  longmarch: LONGMARCH_MAP,
  twincrowns: TWINCROWNS_MAP,
};

/** Resolve a board by id, defaulting to the classic 42-territory world. */
export function getMap(mapId?: MapId): GameMap {
  return (mapId && MAPS[mapId]) || CLASSIC_MAP;
}

/** Ordered list of selectable boards. Territory/continent counts are derived at render time. */
export const MAP_OPTIONS: { id: MapId; name: string; blurb: string }[] = [
  {
    id: 'classic',
    name: 'Classic World',
    blurb: 'The original board. Familiar routes, proven strategy.',
  },
  {
    id: 'imperial',
    name: 'Imperial World',
    blurb: 'Expanded board with richer continent bonuses and more fronts.',
  },
  {
    id: 'verdantia',
    name: 'Verdantia',
    blurb: 'A green supercontinent — a central heartland ringed by four wild realms.',
  },
  {
    id: 'isles',
    name: 'The Sundered Isles',
    blurb: 'A scattered archipelago — six island realms linked by perilous sea lanes.',
  },
  {
    id: 'longmarch',
    name: 'The Long March',
    blurb: 'Five rugged lands strung coast to coast — march the chain or hold the passes.',
  },
  {
    id: 'twincrowns',
    name: 'Twin Crowns',
    blurb: 'Two mighty realms joined only at the northern and southern bridges.',
  },
];
