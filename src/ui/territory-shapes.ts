import type { ContinentId, TerritoryId } from '../engine/map';

// Map-overlay data not derived from the projected geometry in `map-geometry.ts`:
//   - CONTINENT_TINT: continent badge label colors (fills are owner-colored).
//   - BRIDGES: dashed sea-route connectors drawn between territory centroids across water.
// (Original/stylized data — NOT derived from Hasbro artwork.)

// Continent tints — used for badge label color only.
export const CONTINENT_TINT: Record<ContinentId, string> = {
  // Classic board
  NA: '#d4a840',
  SA: '#c5604f',
  EU: '#5e83b3',
  AF: '#cf8a45',
  AS: '#5fa063',
  AU: '#9469b8',
  // Imperial board adds Western/Eastern Europe, Middle East, and Oceania. Chosen as 8 distinct hues
  // (with NA/SA/AF/AS) so every continent reads as its own colour in the show-continents overlay.
  WEU: '#5e83b3', // steel blue
  EEU: '#4fa6b0', // teal
  ME: '#c56b9e',  // magenta
  OC: '#9469b8',  // purple
  // Risk Europe board — 18 distinct hues echoing the source map's colours.
  gb:  '#d98a3d', // orange
  fr:  '#9ccb6b', // light green
  sp:  '#c8a93a', // gold
  pt:  '#b5462f', // brick red
  low: '#e8d24a', // yellow
  ger: '#9aa0a8', // grey
  nit: '#6fae5a', // medium green
  sit: '#3f7a3a', // dark green
  aus: '#46569e', // dark blue
  pru: '#9cb8d8', // light blue
  bal: '#b89ad8', // light purple
  sca: '#8a5fb0', // purple
  blt: '#a7c66b', // lime
  rus: '#c0453d', // red
  blk: '#2f6e4a', // dark green
  ana: '#c2b96a', // khaki
  eg:  '#e08a4a', // orange
  naf: '#d8c0a0', // tan
  // United Kingdom board
  'uk-eng':  '#c0453d', // red
  'uk-ire':  '#e0875a', // salmon
  'uk-nire': '#6a7fd0', // blue
  'uk-ssco': '#7fae5a', // green
  'uk-wal':  '#a98a8a', // mauve
  'uk-nsco': '#d8cf4a', // yellow
  // The Storybook World board
  emp: '#e0d24a', // yellow
  alb: '#c64a44', // red
  ard: '#9469b8', // purple
  isl: '#8fc44a', // lime
  mys: '#9a6b40', // brown
  ima: '#d87a9e', // pink
  wld: '#3f8a4a', // green
  ast: '#e0a83a', // gold
};

// Sea bridges — dashed connectors between territory centroids that are adjacent (attackable) but
// whose drawn shapes don't touch on the map, so every legal attack route reads clearly. Kept in
// sync with ADJACENCY: any adjacent pair with a visible gap between their polygons gets a connector.
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
  // Added: adjacent pairs whose drawn shapes leave a visible gap (were missing a connector).
  ['greenland',       'ontario'],
  ['greenland',       'quebec'],
  ['ukraine',         'afghanistan'],
  ['middle-east',     'india'],
  ['new-guinea',      'western-australia'],
];
