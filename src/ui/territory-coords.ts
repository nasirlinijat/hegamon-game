import type { TerritoryId } from '../engine/map';

export interface Point { x: number; y: number }

export const TERRITORY_COORDS: Record<TerritoryId, Point> = {
  // North America
  alaska:               { x: 100, y: 105 },
  'northwest-territory':{ x: 172, y:  98 },
  greenland:            { x: 302, y:  62 },
  alberta:              { x: 155, y: 150 },
  ontario:              { x: 220, y: 150 },
  quebec:               { x: 282, y: 145 },
  'western-us':         { x: 155, y: 200 },
  'eastern-us':         { x: 228, y: 202 },
  'central-america':    { x: 190, y: 258 },

  // South America
  venezuela:            { x: 242, y: 300 },
  brazil:               { x: 282, y: 358 },
  peru:                 { x: 228, y: 358 },
  argentina:            { x: 248, y: 422 },

  // Europe
  iceland:              { x: 418, y:  88 },
  'great-britain':      { x: 418, y: 138 },
  scandinavia:          { x: 492, y:  88 },
  'northern-europe':    { x: 492, y: 150 },
  'western-europe':     { x: 438, y: 195 },
  'southern-europe':    { x: 512, y: 195 },
  ukraine:              { x: 578, y: 148 },

  // Africa
  'north-africa':       { x: 462, y: 270 },
  egypt:                { x: 555, y: 258 },
  'east-africa':        { x: 572, y: 322 },
  congo:                { x: 522, y: 360 },
  'south-africa':       { x: 532, y: 415 },
  madagascar:           { x: 620, y: 385 },

  // Asia
  ural:                 { x: 652, y: 118 },
  siberia:              { x: 730, y: 100 },
  yakutsk:              { x: 800, y:  98 },
  kamchatka:            { x: 878, y: 112 },
  irkutsk:              { x: 778, y: 155 },
  mongolia:             { x: 788, y: 192 },
  japan:                { x: 880, y: 180 },
  afghanistan:          { x: 645, y: 200 },
  china:                { x: 755, y: 225 },
  'middle-east':        { x: 615, y: 250 },
  india:                { x: 685, y: 275 },
  siam:                 { x: 785, y: 275 },

  // Australia
  indonesia:            { x: 815, y: 335 },
  'new-guinea':         { x: 882, y: 335 },
  'western-australia':  { x: 835, y: 408 },
  'eastern-australia':  { x: 902, y: 408 },
};
