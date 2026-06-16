import type { ContinentId, TerritoryId } from '../engine/map';

// Original low-poly territory outlines on a ~equirectangular 980×500 canvas.
// These are hand-authored geographic-style polygons (public-domain world geometry),
// NOT the copyrighted Risk board artwork. Each entry is a list of [x, y] vertices.

export type Poly = readonly (readonly [number, number])[];

export const TERRITORY_SHAPES: Record<TerritoryId, Poly> = {
  // --- North America ---
  alaska:               [[55, 72], [120, 60], [140, 98], [112, 122], [68, 116], [50, 92]],
  'northwest-territory':[[145, 78], [228, 72], [232, 112], [150, 122], [143, 98]],
  greenland:            [[258, 42], [330, 48], [338, 96], [272, 104], [252, 72]],
  alberta:              [[120, 126], [172, 124], [176, 168], [124, 168]],
  ontario:              [[178, 124], [238, 122], [242, 168], [180, 168]],
  quebec:               [[244, 124], [296, 122], [290, 168], [246, 168]],
  'western-us':         [[118, 172], [178, 172], [182, 220], [122, 220]],
  'eastern-us':         [[184, 172], [246, 172], [250, 222], [188, 222]],
  'central-america':    [[150, 224], [208, 224], [218, 268], [182, 280], [150, 252]],

  // --- South America ---
  venezuela:            [[212, 282], [268, 282], [274, 324], [224, 330], [206, 304]],
  peru:                 [[206, 332], [248, 334], [252, 392], [214, 396], [200, 360]],
  brazil:               [[252, 326], [312, 334], [318, 400], [258, 404], [250, 366]],
  argentina:            [[222, 398], [274, 398], [262, 468], [230, 462]],

  // --- Europe ---
  iceland:              [[388, 92], [424, 88], [428, 120], [392, 124]],
  'great-britain':      [[400, 138], [438, 136], [442, 180], [404, 182]],
  scandinavia:          [[474, 56], [528, 56], [532, 112], [478, 118], [468, 82]],
  'northern-europe':    [[474, 124], [528, 122], [532, 168], [478, 170]],
  'western-europe':     [[424, 186], [468, 184], [472, 228], [428, 230], [418, 208]],
  'southern-europe':    [[478, 174], [544, 174], [552, 218], [482, 220]],
  ukraine:              [[538, 98], [610, 98], [616, 174], [544, 172], [534, 124]],

  // --- Africa ---
  'north-africa':       [[438, 258], [524, 254], [534, 312], [464, 322], [438, 292]],
  egypt:                [[528, 254], [578, 256], [584, 304], [532, 308]],
  'east-africa':        [[552, 312], [608, 314], [614, 374], [562, 378], [548, 344]],
  congo:                [[502, 326], [550, 326], [554, 382], [506, 384]],
  'south-africa':       [[512, 386], [562, 386], [556, 438], [520, 438]],
  madagascar:           [[612, 378], [638, 380], [632, 424], [610, 418]],

  // --- Asia ---
  ural:                 [[618, 102], [672, 102], [678, 168], [622, 168]],
  siberia:              [[682, 78], [752, 78], [758, 152], [688, 152]],
  yakutsk:              [[762, 62], [838, 64], [844, 122], [768, 122]],
  kamchatka:            [[852, 82], [914, 84], [918, 164], [862, 168], [850, 122]],
  irkutsk:              [[758, 128], [818, 128], [822, 172], [760, 172]],
  mongolia:             [[762, 178], [832, 178], [838, 224], [766, 224]],
  japan:                [[878, 172], [914, 174], [908, 218], [874, 214]],
  afghanistan:          [[652, 176], [718, 174], [722, 228], [656, 228]],
  china:                [[728, 178], [802, 180], [808, 252], [732, 252], [724, 212]],
  'middle-east':        [[602, 232], [662, 230], [668, 292], [612, 298], [596, 262]],
  india:                [[668, 236], [732, 256], [722, 304], [672, 300]],
  siam:                 [[762, 256], [814, 258], [818, 308], [766, 306]],

  // --- Australia ---
  indonesia:            [[792, 322], [852, 326], [858, 372], [796, 374]],
  'new-guinea':         [[868, 324], [918, 326], [922, 366], [870, 366]],
  'western-australia':  [[822, 388], [878, 388], [884, 448], [826, 450]],
  'eastern-australia':  [[888, 382], [944, 384], [948, 448], [892, 450]],
};

// Continent background tints — subtle, shared by every territory in the continent
// regardless of who owns it. Owner identity is conveyed by border + army badge.
export const CONTINENT_TINT: Record<ContinentId, string> = {
  NA: '#c9a24b', // warm yellow
  SA: '#c5604f', // red
  EU: '#5e83b3', // blue
  AF: '#cf8a45', // orange
  AS: '#5fa063', // green
  AU: '#9469b8', // purple
};

export interface Point { x: number; y: number }

// Centroid of each polygon — where the army badge sits.
export const TERRITORY_CENTROID: Record<TerritoryId, Point> = (() => {
  const out = {} as Record<TerritoryId, Point>;
  for (const id of Object.keys(TERRITORY_SHAPES) as TerritoryId[]) {
    const pts = TERRITORY_SHAPES[id];
    let sx = 0;
    let sy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; }
    out[id] = { x: sx / pts.length, y: sy / pts.length };
  }
  return out;
})();

// Sea bridges drawn as dashed connectors between centroids (non-obvious adjacencies).
export const BRIDGES: readonly (readonly [TerritoryId, TerritoryId])[] = [
  ['greenland', 'iceland'],
  ['central-america', 'venezuela'],
  ['brazil', 'north-africa'],
  ['western-europe', 'north-africa'],
  ['southern-europe', 'egypt'],
  ['east-africa', 'middle-east'],
  ['siam', 'indonesia'],
];

// Alaska↔Kamchatka wraps around the dateline — drawn as edge stubs instead of a
// line straight across the whole map.
export const WRAP_STUBS: readonly { from: TerritoryId; toEdge: number; label: string }[] = [
  { from: 'alaska', toEdge: 2, label: '↜' },
  { from: 'kamchatka', toEdge: 978, label: '↝' },
];

export const MAP_W = 980;
export const MAP_H = 500;
