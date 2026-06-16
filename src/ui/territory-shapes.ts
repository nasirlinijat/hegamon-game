import type { ContinentId, TerritoryId } from '../engine/map';

// Hand-authored territory polygons on a 1024×560 canvas (original geographic-style art,
// NOT derived from Hasbro artwork). Adjacent territories share or nearly share edge points
// so continents read as contiguous after smoothing.

export type Poly = readonly (readonly [number, number])[];

// Catmull-Rom → cubic Bézier closed path.
export function smoothClosedPath(pts: Poly, tension = 0.4): string {
  const n = pts.length;
  if (n < 3) return '';
  const segs: string[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension / 6;
    if (i === 0) segs.push(`M ${p1[0]},${p1[1]}`);
    segs.push(`C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0]},${p2[1]}`);
  }
  segs.push('Z');
  return segs.join(' ');
}

export const TERRITORY_SHAPES: Record<TerritoryId, Poly> = {
  // ---- North America (x: 28–395, y: 20–315) ----
  alaska:               [[30,95],[85,60],[128,48],[162,75],[155,132],[90,150],[32,118]],
  'northwest-territory':[[162,75],[300,72],[298,138],[240,140],[155,132]],
  greenland:            [[288,25],[390,20],[385,95],[328,105],[290,102]],
  alberta:              [[90,150],[155,132],[240,140],[240,200],[163,207],[90,200]],
  ontario:              [[240,140],[300,138],[306,200],[240,200]],
  quebec:               [[300,138],[388,95],[390,150],[355,200],[306,200]],
  'western-us':         [[90,200],[163,207],[240,200],[244,260],[163,267],[90,255]],
  'eastern-us':         [[240,200],[306,200],[355,200],[355,258],[244,260]],
  'central-america':    [[163,267],[244,260],[355,258],[336,300],[278,312],[215,306],[170,296]],

  // ---- South America (x: 155–382, y: 285–510) ----
  venezuela:            [[215,322],[296,320],[298,367],[250,377],[215,350]],
  peru:                 [[215,350],[250,377],[253,438],[215,448],[196,396],[200,373]],
  brazil:               [[296,320],[376,330],[378,440],[256,447],[253,438],[250,377],[298,367]],
  argentina:            [[215,448],[256,447],[260,505],[225,505]],

  // ---- Europe (x: 378–574, y: 20–242) ----
  iceland:              [[390,70],[420,66],[423,98],[393,103]],
  'great-britain':      [[386,140],[423,136],[426,180],[390,186]],
  scandinavia:          [[460,60],[492,56],[492,96],[488,128],[460,92]],
  'northern-europe':    [[428,130],[492,128],[492,190],[430,192]],
  'western-europe':     [[388,188],[426,180],[430,192],[430,240],[392,242],[378,218]],
  'southern-europe':    [[430,192],[492,190],[492,240],[434,242]],
  ukraine:              [[492,56],[572,54],[574,240],[492,240],[492,96]],

  // ---- Africa (x: 378–634, y: 242–460) ----
  'north-africa':       [[380,248],[432,238],[494,233],[542,248],[548,316],[466,326],[438,300],[380,288]],
  egypt:                [[542,248],[572,251],[578,318],[548,316]],
  'east-africa':        [[548,316],[578,318],[582,384],[558,394],[540,350]],
  congo:                [[466,326],[548,316],[540,350],[540,391],[470,394]],
  'south-africa':       [[470,394],[540,391],[533,453],[476,456]],
  madagascar:           [[598,384],[630,388],[623,428],[596,418]],

  // ---- Asia (x: 574–942, y: 48–370) ----
  ural:                 [[574,100],[642,100],[642,175],[574,175]],
  siberia:              [[642,70],[730,66],[732,160],[650,160],[642,100]],
  yakutsk:              [[730,48],[817,50],[820,130],[732,130],[730,66]],
  kamchatka:            [[820,76],[900,80],[902,165],[864,170],[820,130]],
  irkutsk:              [[732,130],[820,130],[822,180],[732,180]],
  mongolia:             [[732,180],[822,180],[824,230],[732,230]],
  japan:                [[908,76],[942,74],[939,140],[907,146]],
  afghanistan:          [[574,175],[642,175],[647,233],[574,233]],
  china:                [[642,160],[732,160],[732,180],[824,230],[822,290],[730,295],[670,306],[647,236],[642,175]],
  'middle-east':        [[572,233],[647,233],[650,308],[602,312],[570,272]],
  india:                [[647,236],[732,238],[726,310],[652,308]],
  siam:                 [[732,238],[822,290],[824,362],[730,362],[726,310],[732,238]],

  // ---- Australia (x: 730–908, y: 362–510) ----
  indonesia:            [[730,372],[830,372],[830,428],[730,428]],
  'new-guinea':         [[830,366],[908,370],[908,428],[830,428]],
  'western-australia':  [[730,428],[830,428],[830,510],[730,510]],
  'eastern-australia':  [[830,428],[908,428],[908,510],[830,510]],
};

// Continent tints — used for badge label color only (fills are owner-colored).
export const CONTINENT_TINT: Record<ContinentId, string> = {
  NA: '#d4a840',
  SA: '#c5604f',
  EU: '#5e83b3',
  AF: '#cf8a45',
  AS: '#5fa063',
  AU: '#9469b8',
};

export interface Point { x: number; y: number }

// Centroid computed as average of vertices (good enough for convex/near-convex shapes).
// A small override map corrects any concave territory whose average lands outside the polygon.
const CENTROID_OVERRIDE: Partial<Record<TerritoryId, Point>> = {
  'north-africa':    { x: 460, y: 276 },
  'northwest-territory': { x: 228, y: 108 },
  china:             { x: 718, y: 232 },
  'central-america': { x: 252, y: 285 },
  brazil:            { x: 308, y: 385 },
  siam:              { x: 776, y: 302 },
};

export const TERRITORY_CENTROID: Record<TerritoryId, Point> = (() => {
  const out = {} as Record<TerritoryId, Point>;
  for (const id of Object.keys(TERRITORY_SHAPES) as TerritoryId[]) {
    if (CENTROID_OVERRIDE[id]) { out[id] = CENTROID_OVERRIDE[id]!; continue; }
    const pts = TERRITORY_SHAPES[id];
    let sx = 0; let sy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; }
    out[id] = { x: sx / pts.length, y: sy / pts.length };
  }
  return out;
})();

// Sea bridges — dashed connectors between territory centroids across water.
export const BRIDGES: readonly (readonly [TerritoryId, TerritoryId])[] = [
  ['greenland',       'iceland'],
  ['iceland',         'great-britain'],
  ['iceland',         'scandinavia'],
  ['great-britain',   'scandinavia'],
  ['great-britain',   'northern-europe'],
  ['great-britain',   'western-europe'],
  ['central-america', 'venezuela'],
  ['brazil',          'north-africa'],
  ['western-europe',  'north-africa'],
  ['southern-europe', 'north-africa'],
  ['southern-europe', 'egypt'],
  ['southern-europe', 'middle-east'],
  ['east-africa',     'middle-east'],
  ['east-africa',     'madagascar'],
  ['south-africa',    'madagascar'],
  ['siam',            'indonesia'],
  ['japan',           'kamchatka'],
  ['japan',           'mongolia'],
];

// Alaska ↔ Kamchatka dateline stubs (drawn toward the nearest edge instead of across the map).
export const WRAP_STUBS: readonly { from: TerritoryId; toEdge: number; label: string }[] = [
  { from: 'alaska',    toEdge: 2,    label: '↜' },
  { from: 'kamchatka', toEdge: 1022, label: '↝' },
];

export const MAP_W = 1024;
export const MAP_H = 560;
