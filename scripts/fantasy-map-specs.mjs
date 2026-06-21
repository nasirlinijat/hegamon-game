// Specs for the imaginary boards. Each continent is an organic blob (cx,cy,rx,ry,wobble) carved into
// `seeds` territories. `links` are the continent pairs joined by sea routes. Continent keys reuse the
// classic ids (NA/SA/EU/AF/AS/AU) so Secret-Missions mode and continent tints work automatically.

const NAMES = {
  verdantia: [
    'Thornwild', 'Oakhollow', 'Mossvale', 'Fernreach', 'Briarfen', 'Elderwood', 'Greenmarch', 'Willowdeep',
    'Sunmeadow', 'Cedargrove', 'Hawthorn', 'Bramblewood', 'Larkspur', 'Hollowmere', 'Duskfen', 'Ivybrook',
    'Wolfsden', 'Stagmoor', 'Honeyvale', 'Reedmarsh', 'Foxglade', 'Ashbourne', 'Birchholt', 'Nettlewood',
    'Quillvale', 'Rowanhill', 'Marshlight', 'Pinecrest', 'Gladewater', 'Emberfern', 'Thistledown', 'Wyrmwood',
    'Silverbark', 'Dewfall', 'Cloverlea', 'Bracken', 'Mistwood', 'Vinereach',
  ],
  isles: [
    'Coralhaven', 'Saltspire', 'Tidewatch', 'Pearlreef', 'Stormcay', 'Driftmoor', 'Brineport', 'Gullrock',
    'Wavecrest', 'Kelpholm', 'Foamreach', 'Mistral', 'Surfbreak', 'Lagoon', 'Marrowsand', 'Seglas',
    'Anchorhold', 'Reefgate', 'Spindrift', 'Halcyon', 'Bramblecay', 'Galewick', 'Netherstrand', 'Cinderkey',
    'Whaleback', 'Shoalhaven', 'Selkie', 'Tempest', 'Mariner', 'Azuredeep', 'Crabclaw', 'Lhost',
  ],
  longmarch: [
    'Stonepass', 'Ironhold', 'Greycliff', 'Frostmarch', 'Granitega', 'Bleakmoor', 'Hammerfell', 'Coldcrag',
    'Ridgewatch', 'Flintvale', 'Dourhall', 'Slatereach', 'Northpike', 'Cragmaw', 'Windgap', 'Hollowstone',
    'Ashridge', 'Boulderfen', 'Snowmark', 'Highreach', 'Dunmoor', 'Steelford', 'Rimecrest', 'Blackpass',
    'Karngate', 'Drystone', 'Talonridge', 'Greymarch', 'Frosthold', 'Stormgap', 'Wraithmoor', 'Ironmark',
  ],
  twincrowns: [
    'Goldthrone', 'Crownreach', 'Regalia', 'Scepterhold', 'Velvetmoor', 'Diadem', 'Kingsmere', 'Argentvale',
    'Ermine', 'Sovereign', 'Coronet', 'Throneward', 'Gildspire', 'Ruby March', 'Opaline', 'Majesthold',
    'Castellan', 'Bastion', 'Highcrown', 'Emberthrone', 'Silvercrown', 'Dawnscepter', 'Garnet', 'Imperia',
    'Lordsreach', 'Mantlewood', 'Court', 'Heralds', 'Pendant', 'Bannermarch',
  ],
};

export const SPECS = [
  // 1. Verdantia — a tight supercontinent cluster: a central hub ringed by four lands.
  {
    id: 'verdantia',
    name: 'Verdantia',
    blurb: 'A green supercontinent — a central heartland ringed by four wild realms.',
    seed: 7411,
    namePool: NAMES.verdantia,
    continents: [
      { key: 'AS', name: 'The Heartland', bonus: 5, cx: 640, cy: 360, rx: 120, ry: 102, wobble: 0.14, seeds: 8 },
      { key: 'NA', name: 'Norvale',       bonus: 4, cx: 455, cy: 175, rx: 145, ry: 100, wobble: 0.17, seeds: 8 },
      { key: 'EU', name: 'Estmark',       bonus: 4, cx: 855, cy: 185, rx: 138, ry: 100, wobble: 0.17, seeds: 7 },
      { key: 'SA', name: 'Sudreach',      bonus: 4, cx: 450, cy: 552, rx: 145, ry: 100, wobble: 0.17, seeds: 7 },
      { key: 'AF', name: 'Austfen',       bonus: 5, cx: 858, cy: 550, rx: 148, ry: 106, wobble: 0.17, seeds: 8 },
    ],
    links: [
      ['AS', 'NA'], ['AS', 'EU'], ['AS', 'SA'], ['AS', 'AF'],
      ['NA', 'EU'], ['SA', 'AF'], ['NA', 'SA'], ['EU', 'AF'],
    ],
  },

  // 2. The Sundered Isles — six island clusters in a ring with a central crossing.
  {
    id: 'isles',
    name: 'The Sundered Isles',
    blurb: 'A scattered archipelago — six island realms linked only by perilous sea lanes.',
    seed: 5290,
    namePool: NAMES.isles,
    continents: [
      { key: 'NA', name: 'Coralhaven', bonus: 3, cx: 255, cy: 180, rx: 118, ry: 98, wobble: 0.22, seeds: 5 },
      { key: 'EU', name: 'Stormcay',   bonus: 3, cx: 640, cy: 155, rx: 118, ry: 92, wobble: 0.22, seeds: 5 },
      { key: 'AS', name: 'Tidewatch',  bonus: 3, cx: 1025, cy: 200, rx: 118, ry: 98, wobble: 0.22, seeds: 5 },
      { key: 'SA', name: 'Driftmoor',  bonus: 3, cx: 255, cy: 540, rx: 118, ry: 98, wobble: 0.22, seeds: 5 },
      { key: 'AF', name: 'Brineport',  bonus: 3, cx: 640, cy: 565, rx: 118, ry: 92, wobble: 0.22, seeds: 5 },
      { key: 'AU', name: 'Gullrock',   bonus: 3, cx: 1025, cy: 540, rx: 118, ry: 98, wobble: 0.22, seeds: 5 },
    ],
    links: [
      ['NA', 'EU'], ['EU', 'AS'], ['AS', 'AU'], ['AU', 'AF'], ['AF', 'SA'], ['SA', 'NA'],
      ['EU', 'AF'], ['NA', 'AF'], ['AS', 'AF'],
    ],
  },

  // 3. The Long March — five tall lands strung west→east, a continental land-bridge world.
  {
    id: 'longmarch',
    name: 'The Long March',
    blurb: 'Five rugged lands strung coast to coast — march the chain or hold the passes.',
    seed: 9132,
    namePool: NAMES.longmarch,
    continents: [
      { key: 'NA', name: 'Westwatch',  bonus: 4, cx: 175, cy: 360, rx: 95, ry: 165, wobble: 0.16, seeds: 6 },
      { key: 'SA', name: 'Greymarch',  bonus: 4, cx: 405, cy: 295, rx: 92, ry: 150, wobble: 0.18, seeds: 6 },
      { key: 'EU', name: 'Midhold',    bonus: 5, cx: 640, cy: 410, rx: 95, ry: 168, wobble: 0.16, seeds: 7 },
      { key: 'AF', name: 'Esthelm',    bonus: 4, cx: 875, cy: 295, rx: 92, ry: 150, wobble: 0.18, seeds: 6 },
      { key: 'AS', name: 'Eastreach',  bonus: 4, cx: 1105, cy: 360, rx: 95, ry: 165, wobble: 0.16, seeds: 6 },
    ],
    links: [
      ['NA', 'SA'], ['SA', 'EU'], ['EU', 'AF'], ['AF', 'AS'], ['SA', 'AF'],
    ],
  },

  // 4. Twin Crowns — two great continents bridged by a north and south isthmus realm.
  {
    id: 'twincrowns',
    name: 'Twin Crowns',
    blurb: 'Two mighty realms divided by sea, joined only at the northern and southern bridges.',
    seed: 3164,
    namePool: NAMES.twincrowns,
    continents: [
      { key: 'NA', name: 'The West Crown', bonus: 6, cx: 320, cy: 360, rx: 165, ry: 205, wobble: 0.14, seeds: 11 },
      { key: 'AS', name: 'The East Crown', bonus: 6, cx: 960, cy: 360, rx: 165, ry: 205, wobble: 0.14, seeds: 11 },
      { key: 'EU', name: 'Northgate',      bonus: 2, cx: 640, cy: 215, rx: 82, ry: 70, wobble: 0.1, seeds: 3 },
      { key: 'AF', name: 'Southgate',      bonus: 2, cx: 640, cy: 505, rx: 82, ry: 70, wobble: 0.1, seeds: 3 },
    ],
    links: [
      ['NA', 'EU'], ['EU', 'AS'], ['NA', 'AF'], ['AF', 'AS'], ['EU', 'AF'],
    ],
  },
];
