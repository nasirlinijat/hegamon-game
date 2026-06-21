// The "Imperial World" — a 79-territory board inspired by classic grand-strategy world maps.
//
// Pure data only (no DOM, no rules). Territory geometry for rendering is generated separately into
// src/ui/map-geometry-imperial.ts from public-domain Natural Earth data; this module is the engine's
// source of truth for territories, continents, and the adjacency graph.
//
// Adjacency is declared once as an UNDIRECTED edge list and expanded into a symmetric record at
// module load, so the "A→B implies B→A" invariant holds by construction. Every edge endpoint is
// validated against the territory set so a typo fails fast instead of producing a silent dead link.

import {
  type GameMap,
  type Continent,
  type Territory,
  type TerritoryId,
  type ContinentId,
} from './map';

// --- Territories grouped by continent (id → display name) ---

const CONTINENT_DEFS: ReadonlyArray<{
  id: ContinentId;
  name: string;
  bonus: number;
  territories: ReadonlyArray<readonly [TerritoryId, string]>;
}> = [
  {
    id: 'NA',
    name: 'North America',
    bonus: 7,
    territories: [
      ['alaska', 'Alaska'],
      ['w-canada', 'W. Canada'],
      ['e-canada', 'E. Canada'],
      ['greenland', 'Greenland'],
      ['washington', 'Washington'],
      ['california', 'California'],
      ['maine', 'Maine'],
      ['texas', 'Texas'],
      ['mexico', 'Mexico'],
    ],
  },
  {
    id: 'SA',
    name: 'South America',
    bonus: 4,
    territories: [
      ['salvador', 'Salvador'],
      ['columbia', 'Columbia'],
      ['brazil', 'Brazil'],
      ['new-germany', 'New Germany'],
      ['paraguay', 'Paraguay'],
      ['argentina', 'Argentina'],
    ],
  },
  {
    id: 'WEU',
    name: 'Western Europe',
    bonus: 6,
    territories: [
      ['iceland', 'Iceland'],
      ['ireland', 'Ireland'],
      ['england', 'England'],
      ['denmark', 'Denmark'],
      ['germany', 'Germany'],
      ['france', 'France'],
      ['burgundy', 'Burgundy'],
      ['swiss', 'Swiss'],
      ['portugal', 'Portugal'],
      ['spain', 'Spain'],
      ['italy', 'Italy'],
      ['sicily', 'Sicily'],
    ],
  },
  {
    id: 'EEU',
    name: 'Eastern Europe',
    bonus: 7,
    territories: [
      ['norway', 'Norway'],
      ['sweden', 'Sweden'],
      ['finland', 'Finland'],
      ['latvia', 'Latvia'],
      ['poland', 'Poland'],
      ['austria', 'Austria'],
      ['hungary', 'Hungary'],
      ['greece', 'Greece'],
      ['bulgaria', 'Bulgaria'],
      ['ukraine', 'Ukraine'],
      ['crimea', 'Crimea'],
      ['russia', 'Russia'],
      ['tatarland', 'Tatarland'],
    ],
  },
  {
    id: 'AF',
    name: 'Africa',
    bonus: 5,
    territories: [
      ['morocco', 'Morocco'],
      ['algeria', 'Algeria'],
      ['w-desert', 'W. Desert'],
      ['e-desert', 'E. Desert'],
      ['s-desert', 'S. Desert'],
      ['egypt', 'Egypt'],
      ['jungle', 'Jungle'],
      ['rhodesia', 'Rhodesia'],
      ['new-holland', 'New Holland'],
      ['madagascar', 'Madagascar'],
    ],
  },
  {
    id: 'ME',
    name: 'Middle East',
    bonus: 4,
    territories: [
      ['turkiye', 'Turkiye'],
      ['lebanon', 'Lebanon'],
      ['azerbaijan', 'Azerbaijan'],
      ['n-arabia', 'N. Arabia'],
      ['s-arabia', 'S. Arabia'],
      ['dubay', 'Dubay'],
      ['iran', 'Iran'],
    ],
  },
  {
    id: 'AS',
    name: 'Asia',
    bonus: 8,
    territories: [
      ['ural', 'Ural'],
      ['siberia', 'Siberia'],
      ['turkmenistan', 'Turkmenistan'],
      ['uzbekistan', 'Uzbekistan'],
      ['north-turkistan', 'North Turkistan'],
      ['south-turkistan', 'South Turkistan'],
      ['uyghur', 'Uyghur'],
      ['mongolia', 'Mongolia'],
      ['manchuria', 'Manchuria'],
      ['china', 'China'],
      ['korea', 'Korea'],
      ['japan', 'Japan'],
      ['taiwan', 'Taiwan'],
      ['india', 'India'],
      ['thailand', 'Thailand'],
    ],
  },
  {
    id: 'OC',
    name: 'Oceania',
    bonus: 4,
    territories: [
      ['malayia', 'Malayia'],
      ['indonesia', 'Indonesia'],
      ['guinea', 'Guinea'],
      ['w-australia', 'W. Australia'],
      ['e-australia', 'E. Australia'],
      ['tazmania', 'Tazmania'],
      ['n-zealand', 'N. Zealand'],
    ],
  },
];

// --- Undirected adjacency edges (each listed once; symmetrised below) ---

const EDGES: ReadonlyArray<readonly [TerritoryId, TerritoryId]> = [
  // North America
  ['alaska', 'w-canada'], ['w-canada', 'e-canada'],
  ['w-canada', 'washington'], ['e-canada', 'greenland'], ['e-canada', 'maine'],
  ['washington', 'california'], ['washington', 'texas'], ['washington', 'maine'],
  ['california', 'texas'], ['california', 'mexico'], ['texas', 'mexico'], ['texas', 'maine'],
  // North America → neighbours
  ['greenland', 'iceland'], ['mexico', 'salvador'],

  // South America
  ['salvador', 'columbia'], ['columbia', 'brazil'],
  ['brazil', 'new-germany'], ['brazil', 'paraguay'], ['new-germany', 'paraguay'],
  ['new-germany', 'argentina'], ['paraguay', 'argentina'],
  // South America → Africa
  ['brazil', 'morocco'],

  // Western Europe
  ['iceland', 'ireland'], ['iceland', 'norway'], ['ireland', 'england'],
  ['england', 'france'], ['england', 'denmark'], ['denmark', 'germany'],
  ['germany', 'france'], ['germany', 'burgundy'], ['germany', 'austria'], ['germany', 'poland'],
  ['france', 'burgundy'], ['france', 'spain'], ['france', 'swiss'],
  ['swiss', 'italy'], ['swiss', 'austria'], ['spain', 'portugal'], ['italy', 'sicily'],
  ['italy', 'austria'], ['italy', 'greece'],
  // Western Europe → Africa
  ['spain', 'morocco'], ['sicily', 'algeria'],

  // Eastern Europe
  ['norway', 'sweden'], ['denmark', 'sweden'], ['denmark', 'norway'], ['norway', 'russia'],
  ['sweden', 'finland'], ['finland', 'russia'], ['finland', 'latvia'], ['latvia', 'russia'],
  ['latvia', 'poland'], ['poland', 'austria'], ['poland', 'ukraine'], ['poland', 'hungary'],
  ['austria', 'hungary'], ['hungary', 'ukraine'], ['hungary', 'bulgaria'],
  ['bulgaria', 'greece'], ['bulgaria', 'ukraine'], ['greece', 'turkiye'],
  ['ukraine', 'crimea'], ['ukraine', 'russia'], ['crimea', 'russia'], ['russia', 'tatarland'],
  // Eastern Europe → Middle East / Asia
  ['crimea', 'turkiye'], ['bulgaria', 'turkiye'], ['russia', 'azerbaijan'],
  ['tatarland', 'ural'],

  // Africa
  ['morocco', 'algeria'], ['morocco', 'w-desert'], ['algeria', 'w-desert'],
  ['w-desert', 'e-desert'], ['e-desert', 's-desert'],
  ['e-desert', 'egypt'], ['e-desert', 'jungle'], ['s-desert', 'jungle'], ['egypt', 's-desert'],
  ['jungle', 'rhodesia'], ['rhodesia', 'new-holland'], ['rhodesia', 'madagascar'],
  ['new-holland', 'madagascar'],
  // Africa → Middle East
  ['egypt', 'lebanon'], ['egypt', 'n-arabia'],

  // Middle East
  ['turkiye', 'lebanon'], ['turkiye', 'azerbaijan'], ['lebanon', 'n-arabia'],
  ['azerbaijan', 'iran'], ['n-arabia', 's-arabia'], ['n-arabia', 'dubay'], ['n-arabia', 'iran'],
  ['s-arabia', 'dubay'], ['dubay', 'iran'],
  // Middle East → Asia
  ['iran', 'turkmenistan'],

  // Asia
  ['ural', 'siberia'], ['ural', 'north-turkistan'], ['siberia', 'mongolia'],
  ['siberia', 'manchuria'], ['siberia', 'north-turkistan'],
  ['north-turkistan', 'south-turkistan'], ['north-turkistan', 'uyghur'],
  ['north-turkistan', 'mongolia'],
  ['south-turkistan', 'uzbekistan'], ['south-turkistan', 'uyghur'],
  ['uzbekistan', 'turkmenistan'], ['uyghur', 'mongolia'], ['uyghur', 'china'], ['uyghur', 'india'],
  ['mongolia', 'manchuria'], ['mongolia', 'china'], ['manchuria', 'china'], ['manchuria', 'korea'],
  ['korea', 'japan'], ['korea', 'china'], ['china', 'taiwan'], ['china', 'thailand'],
  ['china', 'india'], ['india', 'thailand'],
  // Asia → Oceania
  ['thailand', 'malayia'],

  // Oceania
  ['malayia', 'indonesia'], ['indonesia', 'guinea'], ['indonesia', 'w-australia'],
  ['guinea', 'w-australia'], ['guinea', 'e-australia'], ['w-australia', 'e-australia'],
  ['e-australia', 'tazmania'], ['e-australia', 'n-zealand'], ['tazmania', 'n-zealand'],
];

// --- Assemble continents, territories, and the symmetric adjacency graph ---

const continents: Record<ContinentId, Continent> = {};
const territories: Record<TerritoryId, Territory> = {};
const allTerritoryIds: TerritoryId[] = [];
const adjacency: Record<TerritoryId, TerritoryId[]> = {};

for (const def of CONTINENT_DEFS) {
  const ids = def.territories.map(([id]) => id);
  continents[def.id] = { id: def.id, name: def.name, bonus: def.bonus, territories: ids };
  for (const [id, name] of def.territories) {
    territories[id] = { id, name, continent: def.id };
    allTerritoryIds.push(id);
    adjacency[id] = [];
  }
}

for (const [a, b] of EDGES) {
  if (!territories[a]) throw new Error(`Imperial map: edge references unknown territory '${a}'`);
  if (!territories[b]) throw new Error(`Imperial map: edge references unknown territory '${b}'`);
  if (!adjacency[a]!.includes(b)) adjacency[a]!.push(b);
  if (!adjacency[b]!.includes(a)) adjacency[b]!.push(a);
}

export const IMPERIAL_MAP: GameMap = {
  id: 'imperial',
  name: 'Imperial World',
  continents,
  territories,
  adjacency,
  allTerritoryIds,
};
