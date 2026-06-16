// Pure map data for the standard 42-territory Risk board.
// No DOM, no rules — just territories, continents, adjacency, and lookups.

export type ContinentId = 'NA' | 'SA' | 'EU' | 'AF' | 'AS' | 'AU';

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

export type TerritoryId =
  | (typeof NORTH_AMERICA)[number]
  | (typeof SOUTH_AMERICA)[number]
  | (typeof EUROPE)[number]
  | (typeof AFRICA)[number]
  | (typeof ASIA)[number]
  | (typeof AUSTRALIA)[number];

// --- Continents (bonuses per CLAUDE.md: NA5 SA2 EU5 AF3 AS7 AU2) ---

export const CONTINENTS: Record<ContinentId, Continent> = {
  NA: { id: 'NA', name: 'North America', bonus: 5, territories: NORTH_AMERICA },
  SA: { id: 'SA', name: 'South America', bonus: 2, territories: SOUTH_AMERICA },
  EU: { id: 'EU', name: 'Europe', bonus: 5, territories: EUROPE },
  AF: { id: 'AF', name: 'Africa', bonus: 3, territories: AFRICA },
  AS: { id: 'AS', name: 'Asia', bonus: 7, territories: ASIA },
  AU: { id: 'AU', name: 'Australia', bonus: 2, territories: AUSTRALIA },
};

// Human-readable names, kept beside the data they label.
const NAMES: Record<TerritoryId, string> = {
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
export const TERRITORIES: Record<TerritoryId, Territory> = (() => {
  const table = {} as Record<TerritoryId, Territory>;
  for (const continent of Object.values(CONTINENTS)) {
    for (const id of continent.territories) {
      table[id] = { id, name: NAMES[id], continent: continent.id };
    }
  }
  return table;
})();

// --- Adjacency (full standard Risk board; intended to be symmetric) ---

export const ADJACENCY: Record<TerritoryId, readonly TerritoryId[]> = {
  // North America
  alaska: ['northwest-territory', 'alberta', 'kamchatka'],
  'northwest-territory': ['alaska', 'alberta', 'ontario', 'greenland'],
  greenland: ['northwest-territory', 'ontario', 'quebec', 'iceland'],
  alberta: ['alaska', 'northwest-territory', 'ontario', 'western-us'],
  ontario: [
    'alberta',
    'northwest-territory',
    'greenland',
    'quebec',
    'western-us',
    'eastern-us',
  ],
  quebec: ['greenland', 'ontario', 'eastern-us'],
  'western-us': ['alberta', 'ontario', 'eastern-us', 'central-america'],
  'eastern-us': ['western-us', 'ontario', 'quebec', 'central-america'],
  'central-america': ['western-us', 'eastern-us', 'venezuela'],

  // South America
  venezuela: ['central-america', 'brazil', 'peru'],
  brazil: ['venezuela', 'peru', 'argentina', 'north-africa'],
  peru: ['venezuela', 'brazil', 'argentina'],
  argentina: ['peru', 'brazil'],

  // Europe
  iceland: ['greenland', 'great-britain', 'scandinavia'],
  'great-britain': ['iceland', 'scandinavia', 'northern-europe', 'western-europe'],
  scandinavia: ['iceland', 'great-britain', 'northern-europe', 'ukraine'],
  'northern-europe': [
    'great-britain',
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
    'afghanistan',
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
  ural: ['ukraine', 'siberia', 'china', 'afghanistan'],
  siberia: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  yakutsk: ['siberia', 'kamchatka', 'irkutsk'],
  kamchatka: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'],
  irkutsk: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
  mongolia: ['siberia', 'irkutsk', 'kamchatka', 'japan', 'china'],
  japan: ['kamchatka', 'mongolia'],
  afghanistan: ['ukraine', 'ural', 'china', 'india', 'middle-east'],
  china: ['ural', 'siberia', 'mongolia', 'afghanistan', 'india', 'siam'],
  'middle-east': [
    'ukraine',
    'southern-europe',
    'egypt',
    'east-africa',
    'afghanistan',
    'india',
  ],
  india: ['afghanistan', 'china', 'middle-east', 'siam'],
  siam: ['china', 'india', 'indonesia'],

  // Australia
  indonesia: ['siam', 'new-guinea', 'western-australia'],
  'new-guinea': ['indonesia', 'western-australia', 'eastern-australia'],
  'western-australia': ['indonesia', 'new-guinea', 'eastern-australia'],
  'eastern-australia': ['new-guinea', 'western-australia'],
};

// --- Lookups ---

export const ALL_TERRITORY_IDS: readonly TerritoryId[] = Object.keys(
  TERRITORIES,
) as TerritoryId[];

export function neighbors(id: TerritoryId): readonly TerritoryId[] {
  return ADJACENCY[id];
}

export function areAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  return ADJACENCY[a].includes(b);
}
