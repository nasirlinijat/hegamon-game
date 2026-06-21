// Risk Europe — ~177 historical provinces across 18 continents. Each territory is a positioned seed
// at its approximate real-world location; the atlas generator builds stylized Voronoi shapes clipped
// to landmasses (so the British Isles, Iceland, Italy and the Med islands separate) and derives
// adjacency from shared borders + the sea routes below. Continent bonuses match the board's legend.

const C = (key, name, bonus) => ({ key, name, bonus });
const T = (id, name, cont, x, y, r) => ({ id, name, cont, x, y, ...(r ? { r } : {}) });

export const EUROPE_SPEC = {
  id: 'europe',
  name: 'Risk Europe',
  W: 2000, H: 1480,
  islandR: 30,

  continents: [
    C('gb', 'Great Britain', 10), C('fr', 'France', 12), C('sp', 'Spain', 10), C('pt', 'Portugal', 3),
    C('low', 'Low Countries', 3), C('ger', 'Germany', 6), C('nit', 'Northern Italy', 6), C('sit', 'Southern Italy', 6),
    C('aus', 'Austria', 12), C('pru', 'Prussia', 12), C('bal', 'Balkans', 10), C('sca', 'Scandinavia', 6),
    C('blt', 'Baltic States', 3), C('rus', 'Russia', 14), C('blk', 'Black Sea', 5), C('ana', 'Anatolia', 10),
    C('eg', 'Egypt', 8), C('naf', 'North Africa', 6),
  ],

  territories: [
    // Great Britain (Britain island + Ireland island)
    T('scotland', 'Scotland', 'gb', 470, 245), T('york', 'York', 'gb', 525, 300),
    T('n-england', 'Northern England', 'gb', 560, 332), T('w-england', 'Western England', 'gb', 545, 420),
    T('e-england', 'Eastern England', 'gb', 605, 420), T('wales', 'Wales', 'gb', 512, 455),
    T('s-england', 'Southern England', 'gb', 552, 490), T('london', 'London', 'gb', 615, 470),
    T('ulster', 'Ulster', 'gb', 390, 335), T('connaught', 'Connaught', 'gb', 340, 378),
    T('leinster', 'Leinster', 'gb', 388, 405), T('munster', 'Munster', 'gb', 355, 442),
    // France
    T('brittany', 'Brittany', 'fr', 515, 545), T('normandy', 'Normandy', 'fr', 600, 535),
    T('picardy', 'Picardy', 'fr', 685, 515), T('paris', 'Paris', 'fr', 662, 567),
    T('champagne', 'Champagne', 'fr', 752, 555), T('anjou', 'Anjou', 'fr', 625, 592),
    T('berry', 'Berry', 'fr', 682, 632), T('burgundy', 'Burgundy', 'fr', 778, 612),
    T('poitou', 'Poitou', 'fr', 620, 652), T('auvergne', 'Auvergne', 'fr', 702, 678),
    T('guyenne', 'Guyenne', 'fr', 642, 722), T('gascony', 'Gascony', 'fr', 620, 766),
    T('languedoc', 'Languedoc', 'fr', 712, 762), T('provence', 'Provence', 'fr', 796, 760),
    T('savoy', 'Savoy', 'fr', 800, 690), T('franche-comte', 'Franche Comte', 'fr', 842, 592),
    T('alsace-lorraine', 'Alsace & Lorraine', 'fr', 826, 558),
    // Spain
    T('galicia', 'Galicia', 'sp', 358, 812), T('asturia', 'Asturia', 'sp', 422, 808),
    T('old-castile', 'Old Castile', 'sp', 488, 818), T('navarre', 'Navarre', 'sp', 548, 808),
    T('pyrenees', 'Pyrenees', 'sp', 620, 826), T('catalonia', 'Catalonia', 'sp', 642, 862),
    T('leon', 'Leon', 'sp', 432, 882), T('madrid', 'Madrid', 'sp', 512, 892),
    T('aragon', 'Aragon', 'sp', 572, 882), T('new-castile', 'New Castile', 'sp', 502, 948),
    T('valencia', 'Valencia', 'sp', 592, 948), T('murcia', 'Murcia', 'sp', 562, 992),
    T('andalusia', 'Andalusia', 'sp', 482, 1002), T('grenada', 'Grenada', 'sp', 522, 1022),
    T('estremadura', 'Estremadura', 'sp', 418, 948), T('gibraltar', 'Gibraltar', 'sp', 452, 1042),
    // Portugal
    T('minho', 'Minho', 'pt', 360, 862), T('beira', 'Beira', 'pt', 360, 912),
    T('lisbon', 'Lisbon', 'pt', 346, 968), T('alemetejo', 'Alemetejo', 'pt', 362, 1012),
    // Low Countries
    T('holland', 'Holland', 'low', 792, 492), T('netherlands', 'Netherlands', 'low', 748, 520),
    T('flanders', 'Flanders', 'low', 728, 502), T('palatinate', 'Palatinate', 'low', 802, 532),
    // Germany
    T('hannover', 'Hannover', 'ger', 880, 422), T('westphalia', 'Westphalia', 'ger', 835, 476),
    T('hesse-kassel', 'Hesse-Kassel', 'ger', 912, 492), T('saxony', 'Saxony', 'ger', 990, 492),
    T('brunswick', 'Brunswick', 'ger', 958, 442), T('baden', 'Baden', 'ger', 890, 542),
    T('wurttemberg', 'Wurttemberg', 'ger', 926, 562), T('bavaria', 'Bavaria', 'ger', 976, 576),
    T('tyrol', 'Tyrol', 'ger', 1000, 616),
    // Northern Italy
    T('piedmont', 'Piedmont', 'nit', 856, 722), T('genoa', 'Genoa', 'nit', 886, 756),
    T('lombardy', 'Lombardy', 'nit', 930, 710), T('venice', 'Venice', 'nit', 976, 690),
    // Southern Italy (sardinia + sicily are islands)
    T('tuscany', 'Tuscany', 'sit', 986, 758), T('papal-states', 'Papal States', 'sit', 1022, 792),
    T('rome', 'Rome', 'sit', 1042, 832), T('naples', 'Naples', 'sit', 1082, 872),
    T('basilicata', 'Basilicata', 'sit', 1132, 922), T('sicily', 'Sicily', 'sit', 1056, 1012, 34),
    T('sardinia', 'Sardinia', 'sit', 916, 892, 32),
    // Austria
    T('bohemia', 'Bohemia', 'aus', 1056, 556), T('moravia', 'Moravia', 'aus', 1132, 560),
    T('austrian-galacia', 'Austrian Galacia', 'aus', 1290, 546), T('vienna', 'Vienna', 'aus', 1142, 602),
    T('central-hungary', 'Central Hungary', 'aus', 1242, 616), T('east-hungary', 'East Hungary', 'aus', 1312, 616),
    T('styria', 'Styria', 'aus', 1102, 636), T('carinthia', 'Carinthia', 'aus', 1046, 636),
    T('carniola', 'Carniola', 'aus', 1056, 682), T('west-hungary', 'West Hungary', 'aus', 1182, 652),
    T('croatia', 'Croatia', 'aus', 1086, 712), T('banat', 'Banat', 'aus', 1302, 682),
    T('transylvania', 'Transylvania', 'aus', 1382, 642), T('slavonia', 'Slavonia', 'aus', 1202, 692),
    // Prussia
    T('brandenburg', 'Brandenburg', 'pru', 1022, 416), T('pomerania', 'Pomerania', 'pru', 1092, 406),
    T('west-prussia', 'West Prussia', 'pru', 1182, 416), T('east-prussia', 'East Prussia', 'pru', 1282, 362),
    T('mazovia', 'Mazovia', 'pru', 1332, 392), T('berlin', 'Berlin', 'pru', 1086, 456),
    T('south-prussia', 'South Prussia', 'pru', 1212, 462), T('poland', 'Poland', 'pru', 1302, 462),
    T('silesia', 'Silesia', 'pru', 1172, 512), T('red-russia', 'Red Russia', 'pru', 1372, 502),
    // Balkans (crete is an island)
    T('wallachia', 'Wallachia', 'bal', 1372, 722), T('dobruja', 'Dobruja', 'bal', 1452, 742),
    T('bosnia', 'Bosnia', 'bal', 1172, 756), T('serbia', 'Serbia', 'bal', 1262, 752),
    T('montenegro', 'Montenegro', 'bal', 1202, 792), T('bulgaria', 'Bulgaria', 'bal', 1372, 792),
    T('macedonia', 'Macedonia', 'bal', 1302, 832), T('constantinople', 'Constantinople', 'bal', 1432, 842),
    T('albania', 'Albania', 'bal', 1242, 852), T('thessaly', 'Thessaly', 'bal', 1302, 882),
    T('morea', 'Morea', 'bal', 1302, 958), T('crete', 'Crete', 'bal', 1372, 1076, 32),
    // Scandinavia (iceland is an island)
    T('iceland', 'Iceland', 'sca', 150, 72, 60), T('norway', 'Norway', 'sca', 872, 110),
    T('sweden', 'Sweden', 'sca', 1010, 152), T('stockholm', 'Stockholm', 'sca', 1112, 112),
    T('scania', 'Scania', 'sca', 1030, 252), T('finland', 'Finland', 'sca', 1390, 80),
    T('denmark', 'Denmark', 'sca', 916, 296), T('copenhagen', 'Copenhagen', 'sca', 978, 306),
    T('schleswig-holstein', 'Schleswig-Holstein', 'sca', 912, 346),
    // Baltic States
    T('estonia', 'Estonia', 'blt', 1432, 162), T('lavonia', 'Lavonia', 'blt', 1432, 212),
    T('kurland', 'Kurland', 'blt', 1392, 256), T('lithuania', 'Lithuania', 'blt', 1422, 302),
    // Russia
    T('carelia', 'Carelia', 'rus', 1752, 58), T('saint-petersburg', 'Saint Petersburg', 'rus', 1642, 202),
    T('muscovy', 'Muscovy', 'rus', 1832, 162), T('novgorod', 'Novgorod', 'rus', 1562, 226),
    T('moscow', 'Moscow', 'rus', 1802, 292), T('smolensk', 'Smolensk', 'rus', 1622, 312),
    T('white-russia', 'White Russia', 'rus', 1532, 362), T('chernigov', 'Chernigov', 'rus', 1662, 376),
    T('black-russia', 'Black Russia', 'rus', 1472, 402), T('podlesia', 'Podlesia', 'rus', 1552, 426),
    T('volhynia', 'Volhynia', 'rus', 1482, 456), T('little-russia', 'Little Russia', 'rus', 1642, 472),
    T('poltawa', 'Poltawa', 'rus', 1802, 472), T('podolia', 'Podolia', 'rus', 1532, 512),
    T('ukraine', 'Ukraine', 'rus', 1622, 542), T('jedisan', 'Jedisan', 'rus', 1562, 592),
    T('bessarabia', 'Bessarabia', 'rus', 1502, 582), T('moldavia', 'Moldavia', 'rus', 1432, 582),
    // Black Sea
    T('crimea', 'Crimea', 'blk', 1652, 692), T('circassia', 'Circassia', 'blk', 1900, 642),
    T('mingrelia', 'Mingrelia', 'blk', 1900, 762), T('kherson', 'Kherson', 'blk', 1782, 612),
    // Anatolia
    T('sinope', 'Sinope', 'ana', 1622, 842), T('nicea', 'Nicea', 'ana', 1492, 892),
    T('kerassi', 'Kerassi', 'ana', 1452, 932), T('caramania', 'Caramania', 'ana', 1602, 922),
    T('hamid', 'Hamid', 'ana', 1502, 962), T('menteshe', 'Menteshe', 'ana', 1432, 978),
    T('tekke', 'Tekke', 'ana', 1482, 1012), T('cilicia', 'Cilicia', 'ana', 1642, 1002),
    T('trebizond', 'Trebizond', 'ana', 1782, 862), T('sivas', 'Sivas', 'ana', 1762, 922),
    T('armenia', 'Armenia', 'ana', 1900, 942), T('kurdistan', 'Kurdistan', 'ana', 1882, 1012),
    // Egypt (Levant + African side)
    T('aleppo', 'Aleppo', 'eg', 1722, 1082), T('syria', 'Syria', 'eg', 1702, 1182),
    T('baghdad', 'Baghdad', 'eg', 1832, 1192), T('palestine', 'Palestine', 'eg', 1642, 1292),
    T('arabia', 'Arabia', 'eg', 1822, 1302), T('mecca-medina', 'Mecca and Medina', 'eg', 1702, 1412),
    T('sinai', 'Sinai', 'eg', 1532, 1332), T('cairo', 'Cairo', 'eg', 1432, 1412),
    T('alexandria', 'Alexandria', 'eg', 1432, 1292), T('libya', 'Libya', 'eg', 1332, 1342),
    T('cyrenaica', 'Cyrenaica', 'eg', 1132, 1372),
    // North Africa
    T('morocco', 'Morocco', 'naf', 340, 1292), T('tangier', 'Tangier', 'naf', 392, 1192),
    T('fez', 'Fez', 'naf', 472, 1182), T('oran', 'Oran', 'naf', 562, 1142),
    T('algiers', 'Algiers', 'naf', 622, 1116), T('bona', 'Bona', 'naf', 702, 1112),
    T('tunis', 'Tunis', 'naf', 792, 1096), T('sahara', 'Sahara Desert', 'naf', 562, 1342),
    T('tunisia', 'Tunisia', 'naf', 812, 1232), T('tripolis', 'Tripolis', 'naf', 962, 1332),
  ],

  // Landmasses that clip the global Voronoi. Anything outside all of these (Iceland, Sicily, Sardinia,
  // Crete) becomes its own island via the fallback circle.
  landmasses: [
    { id: 'britain', ring: [[455, 225], [545, 222], [605, 268], [638, 335], [642, 432], [618, 505], [535, 518], [488, 478], [450, 400], [442, 308]] },
    { id: 'ireland', ring: [[318, 312], [408, 312], [422, 400], [388, 462], [330, 458], [306, 378]] },
    { id: 'iberia', ring: [[330, 790], [665, 795], [672, 892], [612, 1062], [440, 1078], [328, 1000]] },
    { id: 'nafrica', ring: [[260, 1130], [820, 1055], [1100, 1310], [1500, 1240], [1600, 1310], [1585, 1468], [280, 1468]] },
    { id: 'eurasia', ring: [
      [560, 500], [700, 470], [820, 360], [860, 150], [905, 60], [1180, 55], [1500, 52], [1830, 45],
      [1965, 150], [1965, 640], [1965, 1000], [1965, 1455], [1600, 1458], [1555, 1300], [1560, 1110],
      [1460, 1035], [1330, 1008], [1300, 995], [1190, 955], [1150, 940], [1090, 905], [1015, 815],
      [960, 765], [835, 795], [700, 795], [660, 805], [615, 790], [560, 690], [500, 560], [510, 540],
    ] },
  ],

  // Sea routes (and a few inter-landmass land bridges) read from the board's dotted lines.
  seaRoutes: [
    // British Isles & North Sea
    ['iceland', 'scotland'], ['iceland', 'norway'], ['scotland', 'norway'],
    ['ulster', 'scotland'], ['leinster', 'wales'], ['munster', 'connaught'],
    ['e-england', 'holland'], ['s-england', 'flanders'], ['s-england', 'picardy'], ['s-england', 'brittany'],
    // Iberia ↔ France (Pyrenees) and Iberia ↔ Africa (Gibraltar)
    ['navarre', 'gascony'], ['pyrenees', 'languedoc'], ['catalonia', 'languedoc'],
    ['gibraltar', 'tangier'], ['gibraltar', 'morocco'], ['grenada', 'tangier'],
    // Western Med islands
    ['sardinia', 'genoa'], ['sardinia', 'rome'], ['sardinia', 'tunis'], ['sardinia', 'sicily'],
    ['sicily', 'naples'], ['sicily', 'tunis'], ['sicily', 'tunisia'],
    // Adriatic / Italy ↔ Balkans
    ['venice', 'croatia'], ['naples', 'albania'],
    // Aegean / Crete / Anatolia
    ['crete', 'morea'], ['crete', 'alexandria'], ['morea', 'menteshe'],
    ['constantinople', 'nicea'], ['thessaly', 'nicea'],
    // Black Sea ring
    ['crimea', 'kherson'], ['crimea', 'constantinople'], ['crimea', 'circassia'],
    ['circassia', 'mingrelia'], ['mingrelia', 'trebizond'], ['mingrelia', 'armenia'],
    ['kherson', 'crimea'], ['kherson', 'jedisan'], ['sinope', 'crimea'],
    // Anatolia ↔ Levant (Egypt continent) land border
    ['cilicia', 'aleppo'], ['cilicia', 'syria'], ['kurdistan', 'baghdad'],
    // Levant ↔ Africa (Sinai land bridge) and African Egypt internal links
    ['sinai', 'palestine'], ['sinai', 'cairo'], ['cyrenaica', 'tripolis'], ['alexandria', 'cyrenaica'],
  ],
};
