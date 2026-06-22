// Pure map data. No DOM, no rules — just territories, continents, adjacency, and lookups.
//
// The game supports multiple boards. A `GameMap` bundles everything the engine needs to play on
// a board (continents, territories, adjacency, id list). Territory/continent ids are plain strings
// so new boards can introduce their own ids without widening a compile-time union. The classic
// 42-territory board lives here as `CLASSIC_MAP` and is also re-exported as bare constants
// (`CONTINENTS`, `ADJACENCY`, …) for backward compatibility with existing callers and tests.

export type ContinentId = string;
export type TerritoryId = string;

export interface Continent {
  readonly id: ContinentId;
  readonly name: string;
  readonly bonus: number;
  readonly territories: readonly TerritoryId[];
}

export interface Territory {
  readonly id: TerritoryId;
  readonly name: string;
  readonly continent: ContinentId;
}

/** A complete playable board: continents, territories, adjacency graph, and id list. */
export interface GameMap {
  readonly id: string;
  readonly name: string;
  readonly continents: Record<ContinentId, Continent>;
  readonly territories: Record<TerritoryId, Territory>;
  readonly adjacency: Record<TerritoryId, readonly TerritoryId[]>;
  readonly allTerritoryIds: readonly TerritoryId[];
}

// --- Territory ids, grouped by continent (kebab-case, stable) ---

const NORTH_AMERICA = [
  'alaska',
  'northwest-territory',
  'greenland',
  'alberta',
  'ontario',
  'quebec',
  'western-us',
  'eastern-us',
  'central-america',
] as const;

const SOUTH_AMERICA = ['venezuela', 'brazil', 'peru', 'argentina'] as const;

const EUROPE = [
  'iceland',
  'great-britain',
  'scandinavia',
  'northern-europe',
  'western-europe',
  'southern-europe',
  'ukraine',
] as const;

const AFRICA = [
  'north-africa',
  'egypt',
  'east-africa',
  'congo',
  'south-africa',
  'madagascar',
] as const;

const ASIA = [
  'ural',
  'siberia',
  'yakutsk',
  'kamchatka',
  'irkutsk',
  'mongolia',
  'japan',
  'afghanistan',
  'china',
  'middle-east',
  'india',
  'siam',
] as const;

const AUSTRALIA = [
  'indonesia',
  'new-guinea',
  'western-australia',
  'eastern-australia',
] as const;

/** The classic board's territory ids as a literal union — handy for exhaustive classic-only data. */
export type ClassicTerritoryId =
  | (typeof NORTH_AMERICA)[number]
  | (typeof SOUTH_AMERICA)[number]
  | (typeof EUROPE)[number]
  | (typeof AFRICA)[number]
  | (typeof ASIA)[number]
  | (typeof AUSTRALIA)[number];

/** The classic board's continent ids as a literal union. */
export type ClassicContinentId = 'NA' | 'SA' | 'EU' | 'AF' | 'AS' | 'AU';

// --- Continents (bonuses per CLAUDE.md: NA5 SA2 EU5 AF3 AS7 AU2) ---
// The classic constants below are typed with their literal-key unions (not the wide string
// `ContinentId`/`TerritoryId`) so that indexing them by a known key — `CONTINENTS.NA`,
// `ADJACENCY['alaska']` — stays non-undefined under noUncheckedIndexedAccess. The wider
// string-keyed view is exposed through `CLASSIC_MAP` for the map-agnostic engine.

export const CONTINENTS: Record<ClassicContinentId, Continent> = {
  NA: { id: 'NA', name: 'North America', bonus: 5, territories: NORTH_AMERICA },
  SA: { id: 'SA', name: 'South America', bonus: 2, territories: SOUTH_AMERICA },
  EU: { id: 'EU', name: 'Europe', bonus: 5, territories: EUROPE },
  AF: { id: 'AF', name: 'Africa', bonus: 3, territories: AFRICA },
  AS: { id: 'AS', name: 'Asia', bonus: 7, territories: ASIA },
  AU: { id: 'AU', name: 'Australia', bonus: 2, territories: AUSTRALIA },
};

// Human-readable names, kept beside the data they label.
const NAMES: Record<ClassicTerritoryId, string> = {
  alaska: 'Alaska',
  'northwest-territory': 'Northwest Territory',
  greenland: 'Greenland',
  alberta: 'Alberta',
  ontario: 'Ontario',
  quebec: 'Quebec',
  'western-us': 'Western United States',
  'eastern-us': 'Eastern United States',
  'central-america': 'Central America',
  venezuela: 'Venezuela',
  brazil: 'Brazil',
  peru: 'Peru',
  argentina: 'Argentina',
  iceland: 'Iceland',
  'great-britain': 'Great Britain',
  scandinavia: 'Scandinavia',
  'northern-europe': 'Northern Europe',
  'western-europe': 'Western Europe',
  'southern-europe': 'Southern Europe',
  ukraine: 'Ukraine',
  'north-africa': 'North Africa',
  egypt: 'Egypt',
  'east-africa': 'East Africa',
  congo: 'Congo',
  'south-africa': 'South Africa',
  madagascar: 'Madagascar',
  ural: 'Ural',
  siberia: 'Siberia',
  yakutsk: 'Yakutsk',
  kamchatka: 'Kamchatka',
  irkutsk: 'Irkutsk',
  mongolia: 'Mongolia',
  japan: 'Japan',
  afghanistan: 'Afghanistan',
  china: 'China',
  'middle-east': 'Middle East',
  india: 'India',
  siam: 'Siam',
  indonesia: 'Indonesia',
  'new-guinea': 'New Guinea',
  'western-australia': 'Western Australia',
  'eastern-australia': 'Eastern Australia',
};

// Build the territory table from continent membership so the two never drift.
export const TERRITORIES: Record<ClassicTerritoryId, Territory> = (() => {
  const table = {} as Record<ClassicTerritoryId, Territory>;
  for (const continent of Object.values(CONTINENTS)) {
    for (const id of continent.territories as readonly ClassicTerritoryId[]) {
      table[id] = { id, name: NAMES[id] ?? id, continent: continent.id };
    }
  }
  return table;
})();

// --- Adjacency (intended to be symmetric) ---

export const ADJACENCY: Record<ClassicTerritoryId, readonly ClassicTerritoryId[]> = {
  // North America
  alaska: ['northwest-territory', 'kamchatka'],
  'northwest-territory': ['alaska', 'alberta', 'greenland'],
  greenland: ['northwest-territory', 'quebec', 'iceland'],
  alberta: ['northwest-territory', 'ontario', 'western-us', 'eastern-us'],
  ontario: [
    'alberta',
    'quebec',
    'western-us',
    'eastern-us',
  ],
  quebec: ['greenland', 'ontario', 'eastern-us'],
  'western-us': ['alberta', 'ontario', 'eastern-us', 'central-america'],
  'eastern-us': ['western-us', 'ontario', 'quebec', 'central-america', 'alberta'],
  'central-america': ['western-us', 'eastern-us', 'venezuela'],

  // South America
  venezuela: ['central-america', 'brazil', 'peru'],
  brazil: ['venezuela', 'peru', 'argentina', 'north-africa'],
  peru: ['venezuela', 'brazil', 'argentina'],
  argentina: ['peru', 'brazil'],

  // Europe
  iceland: ['greenland', 'great-britain', 'scandinavia'],
  'great-britain': ['iceland', 'scandinavia', 'western-europe'],
  scandinavia: ['iceland', 'great-britain', 'northern-europe', 'ukraine'],
  'northern-europe': [
    'scandinavia',
    'ukraine',
    'southern-europe',
    'western-europe',
  ],
  'western-europe': ['great-britain', 'northern-europe', 'southern-europe', 'north-africa'],
  'southern-europe': [
    'western-europe',
    'northern-europe',
    'ukraine',
    'middle-east',
    'egypt',
    'north-africa',
  ],
  ukraine: [
    'scandinavia',
    'northern-europe',
    'southern-europe',
    'ural',
    'middle-east',
  ],

  // Africa
  'north-africa': [
    'brazil',
    'western-europe',
    'southern-europe',
    'egypt',
    'east-africa',
    'congo',
  ],
  egypt: ['southern-europe', 'north-africa', 'east-africa', 'middle-east'],
  'east-africa': [
    'egypt',
    'north-africa',
    'congo',
    'south-africa',
    'madagascar',
    'middle-east',
  ],
  congo: ['north-africa', 'east-africa', 'south-africa'],
  'south-africa': ['congo', 'east-africa', 'madagascar'],
  madagascar: ['east-africa', 'south-africa'],

  // Asia
  ural: ['ukraine', 'siberia', 'china', 'afghanistan', 'middle-east'],
  siberia: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  yakutsk: ['siberia', 'kamchatka', 'irkutsk'],
  kamchatka: ['yakutsk', 'irkutsk', 'japan', 'alaska'],
  irkutsk: ['siberia', 'yakutsk', 'kamchatka', 'mongolia', 'china'],
  mongolia: ['siberia', 'irkutsk', 'china'],
  // Japan is an offshore island: linked by sea to Kamchatka (north) and China (the China/Korea
  // coast). Dropped the classic Japan↔Mongolia link — Mongolia is landlocked and read as irrelevant.
  japan: ['kamchatka', 'china'],
  // Afghanistan is Central-Asian interior — no European neighbour (dropped the classic
  // Ukraine↔Afghanistan link, which read as irrelevant: the two don't border geographically).
  afghanistan: ['ural', 'china', 'india', 'middle-east'],
  china: ['ural', 'siberia', 'mongolia', 'irkutsk', 'afghanistan', 'india', 'siam', 'japan'],
  'middle-east': [
    'ukraine',
    'southern-europe',
    'egypt',
    'east-africa',
    'afghanistan',
    'ural',
  ],
  // Dropped the India↔Middle East link; India reaches the rest of Asia via Afghanistan, China & Siam.
  india: ['afghanistan', 'china', 'siam'],
  siam: ['china', 'india', 'indonesia'],

  // Australia
  indonesia: ['siam', 'new-guinea', 'western-australia'],
  'new-guinea': ['indonesia', 'western-australia', 'eastern-australia'],
  'western-australia': ['indonesia', 'new-guinea', 'eastern-australia'],
  'eastern-australia': ['new-guinea', 'western-australia'],
};

// --- Lookups ---

export const ALL_TERRITORY_IDS: readonly ClassicTerritoryId[] = Object.keys(
  TERRITORIES,
) as ClassicTerritoryId[];

/** The classic 42-territory board, bundled as a GameMap. */
export const CLASSIC_MAP: GameMap = {
  id: 'classic',
  name: 'Classic World',
  continents: CONTINENTS,
  territories: TERRITORIES,
  adjacency: ADJACENCY,
  allTerritoryIds: ALL_TERRITORY_IDS,
};

// The helpers below accept an optional `map` so the engine can run on any board. They default to
// the classic board, which keeps every existing caller and test (`neighbors('alaska')`, etc.)
// working unchanged.

export function neighbors(id: TerritoryId, map: GameMap = CLASSIC_MAP): readonly TerritoryId[] {
  return map.adjacency[id] ?? [];
}

export function areAdjacent(
  a: TerritoryId,
  b: TerritoryId,
  portals?: ReadonlyArray<readonly [TerritoryId, TerritoryId]>,
  map: GameMap = CLASSIC_MAP,
): boolean {
  if ((map.adjacency[a] ?? []).includes(b)) return true;
  if (!portals) return false;
  return portals.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
}

/** Like `neighbors` but also includes portal-linked territories. */
export function neighborsWith(
  id: TerritoryId,
  portals?: ReadonlyArray<readonly [TerritoryId, TerritoryId]>,
  map: GameMap = CLASSIC_MAP,
): readonly TerritoryId[] {
  const base = map.adjacency[id] ?? [];
  if (!portals || portals.length === 0) return base;
  const extras = portals.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []);
  return extras.length === 0 ? base : [...base, ...extras];
}
