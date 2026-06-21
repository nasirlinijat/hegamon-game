// United Kingdom — 42 provinces across 6 regions (bonuses from the board legend). Positioned seeds on
// the two main islands (Great Britain, Ireland) plus the Scottish island groups; stylized Voronoi
// shapes, adjacency from shared borders + the white sea-link lines on the board.

const C = (key, name, bonus) => ({ key, name, bonus });
const T = (id, name, cont, x, y, r) => ({ id, name, cont, x, y, ...(r ? { r } : {}) });

export const UK_SPEC = {
  id: 'uk',
  name: 'United Kingdom',
  W: 1200, H: 1820,
  islandR: 34,

  continents: [
    C('uk-eng', 'England', 7), C('uk-ire', 'Ireland', 6), C('uk-nire', 'Northern Ireland', 4),
    C('uk-ssco', 'Southern Scotland', 4), C('uk-wal', 'Wales', 3), C('uk-nsco', 'Northern Scotland', 2),
  ],

  territories: [
    // Northern Scotland (Highland + Grampian mainland; Western/Orkney/Shetland are islands)
    T('highland', 'Highland', 'uk-nsco', 560, 380),
    T('grampian', 'Grampian', 'uk-nsco', 700, 470),
    T('western-isles', 'Western Isles', 'uk-nsco', 360, 400, 46),
    T('orkney-isles', 'Orkney Isles', 'uk-nsco', 700, 140, 40),
    T('shetland-isles', 'Shetland Isles', 'uk-nsco', 1000, 150, 40),
    // Southern Scotland
    T('argyll', 'Argyll', 'uk-ssco', 560, 565),
    T('tayside', 'Tayside', 'uk-ssco', 725, 580),
    T('glasgow-edinburgh', 'Glasgow & Edinburgh', 'uk-ssco', 650, 720),
    T('the-borders', 'The Borders', 'uk-ssco', 770, 745),
    T('dumfries-galloway', 'Dumfries & Galloway', 'uk-ssco', 620, 835),
    // Northern Ireland
    T('londonderry', 'Londonderry', 'uk-nire', 330, 962),
    T('antrim', 'Antrim', 'uk-nire', 412, 930),
    T('tyrone', 'Tyrone', 'uk-nire', 322, 1012),
    T('armagh', 'Armagh', 'uk-nire', 392, 1016),
    T('down', 'Down', 'uk-nire', 442, 1010),
    // Ireland
    T('donegal', 'Donegal', 'uk-ire', 252, 930),
    T('monaghan', 'Monaghan', 'uk-ire', 332, 1062),
    T('meath', 'Meath', 'uk-ire', 372, 1112),
    T('dublin', 'Dublin', 'uk-ire', 412, 1190),
    T('galway', 'Galway', 'uk-ire', 182, 1130),
    T('kilkenny', 'Kilkenny', 'uk-ire', 342, 1280),
    T('tipperary', 'Tipperary', 'uk-ire', 292, 1350),
    T('clare', 'Clare', 'uk-ire', 182, 1290),
    T('cork', 'Cork', 'uk-ire', 212, 1420),
    T('kerry', 'Kerry', 'uk-ire', 122, 1410),
    // Wales
    T('anglesey', 'Anglesey', 'uk-wal', 600, 1178),
    T('snowdonia', 'Snowdonia', 'uk-wal', 642, 1232),
    T('mid-wales', 'Mid Wales', 'uk-wal', 692, 1330),
    T('ceredigion', 'Ceredigion', 'uk-wal', 600, 1342),
    T('pembrokeshire', 'Pembrokeshire', 'uk-wal', 560, 1430),
    T('cardiff', 'Cardiff', 'uk-wal', 680, 1452),
    // England
    T('north-england', 'North England', 'uk-eng', 762, 950),
    T('yorkshire-humber', 'Yorkshire & the Humber', 'uk-eng', 900, 992),
    T('north-west-england', 'North West England', 'uk-eng', 800, 1052),
    T('west-midlands', 'West Midlands', 'uk-eng', 800, 1152),
    T('east-midlands', 'East Midlands', 'uk-eng', 922, 1132),
    T('east-anglia', 'East Anglia', 'uk-eng', 1050, 1232),
    T('heart-of-england', 'Heart of England', 'uk-eng', 880, 1330),
    T('gloucestershire', 'Gloucestershire', 'uk-eng', 800, 1402),
    T('london', 'London', 'uk-eng', 970, 1432),
    T('southern-england', 'Southern England', 'uk-eng', 872, 1532),
    T('south-west-england', 'South West England', 'uk-eng', 650, 1600),
  ],

  landmasses: [
    // Great Britain (Scotland mainland + England + Wales).
    { id: 'gb', ring: [
      [500, 360], [760, 430], [780, 700], [1130, 1180], [1110, 1300], [1010, 1480], [900, 1620],
      [700, 1660], [560, 1500], [560, 1180], [600, 1140], [600, 900], [520, 840], [520, 560],
    ] },
    // Ireland (Republic + Northern Ireland).
    { id: 'ireland', ring: [
      [110, 900], [470, 905], [490, 1060], [470, 1260], [330, 1470], [150, 1460], [90, 1280], [120, 1060],
    ] },
  ],

  seaRoutes: [
    // Northern Scotland island groups
    ['western-isles', 'highland'], ['orkney-isles', 'highland'], ['orkney-isles', 'grampian'],
    ['shetland-isles', 'orkney-isles'],
    // Isle of Man hub (drawn as white lines) — connect the lands it bridged directly
    ['down', 'dumfries-galloway'], ['down', 'north-west-england'], ['dublin', 'north-west-england'],
    ['dublin', 'anglesey'], ['anglesey', 'north-west-england'],
    // The long southern crossing
    ['cork', 'south-west-england'],
    // Wales ↔ England seam (Anglesey island onto the GB landmass)
    ['anglesey', 'snowdonia'],
  ],
};
