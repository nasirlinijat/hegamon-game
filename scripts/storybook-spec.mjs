// The Storybook World — 54 territories across 8 realms drawn from myth & children's literature.
// Mostly an archipelago: each land realm is its own landmass blob; "The Isles" are scattered islands.
// Adjacency is shared-border within a realm + the dashed sea lanes between realms.

const C = (key, name, bonus) => ({ key, name, bonus });
const T = (id, name, cont, x, y, r) => ({ id, name, cont, x, y, ...(r ? { r } : {}) });

export const STORYBOOK_SPEC = {
  id: 'storybook',
  name: 'The Storybook World',
  W: 2000, H: 1560,
  islandR: 46,

  continents: [
    C('emp', 'Empyrea', 4), C('alb', 'Albiona', 3), C('ard', 'Ardania', 5), C('isl', 'The Isles', 6),
    C('mys', 'Mystil', 3), C('ima', 'Imagil', 4), C('wld', 'The Wilds', 3), C('ast', 'Astoria', 6),
  ],

  territories: [
    // Empyrea (polar strip; Turtle Island is separate)
    T('undying-lands', 'Undying Lands', 'emp', 300, 95),
    T('asgard', 'Asgard', 'emp', 520, 120),
    T('mount-olympus', 'Mount Olympus', 'emp', 770, 140),
    T('shangri-la', 'Shangri La', 'emp', 1140, 160),
    T('el-dorado', 'El Dorado', 'emp', 1620, 255),
    T('turtle-island', 'Turtle Island', 'emp', 1885, 80, 44),
    // Albiona (Avalon is an island)
    T('avalon', 'Avalon', 'alb', 215, 235, 56),
    T('camelot', 'Camelot', 'alb', 235, 405),
    T('sherwood-forest', 'Sherwood Forest', 'alb', 152, 470),
    T('cheshire-cat-wood', 'Cheshire Cat Wood', 'alb', 295, 520),
    T('mad-hat', 'Mad Hat', 'alb', 125, 580),
    T('queen-of-hearts', 'Queen of Hearts Realm', 'alb', 255, 645),
    // Ardania
    T('giant-land', 'Giant Land', 'ard', 215, 800),
    T('lantern-waste', 'Lantern Waste', 'ard', 372, 870),
    T('cair-paravel', 'Cair Paravel', 'ard', 432, 922),
    T('the-shire', 'The Shire', 'ard', 112, 940),
    T('rohan', 'Rohan', 'ard', 232, 1002),
    T('archenland', 'Archenland', 'ard', 432, 1042),
    T('mordor', 'Mordor', 'ard', 272, 1142),
    T('calormen', 'Calormen', 'ard', 412, 1182),
    T('gondor', 'Gondor', 'ard', 152, 1282),
    // The Isles (scattered islands)
    T('cyclops-land', 'Cyclops Land', 'isl', 690, 420, 50),
    T('loompa-land', 'Loompa Land', 'isl', 620, 585, 50),
    T('atlantis', 'Atlantis', 'isl', 1000, 505, 66),
    T('utopia', 'Utopia', 'isl', 800, 835, 58),
    T('lilliput', 'Lilliput', 'isl', 780, 1015, 40),
    T('jurassic-park', 'Jurassic Park', 'isl', 1285, 605, 46),
    T('never-neverland', 'Never Neverland', 'isl', 1185, 825, 52),
    T('wild-things', 'Where the Wild Things Are', 'isl', 1380, 995, 48),
    // Mystil
    T('lost-world', 'The Lost World', 'mys', 1385, 425),
    T('truffala-forest', 'Truffala Tree Forest', 'mys', 1565, 405),
    T('land-time-forgot', 'The Land that Time Forgot', 'mys', 1560, 525),
    T('fountain-of-youth', 'Fountain of Youth', 'mys', 1540, 645),
    // Imagil
    T('hundred-acre-wood', 'Hundred Acre Wood', 'ima', 1820, 425),
    T('florin', 'Florin', 'ima', 1905, 505),
    T('guilder', 'Guilder', 'ima', 1785, 615),
    T('hogwarts', 'Hogwarts', 'ima', 1820, 725),
    T('forbidden-forest', 'Forbidden Forest', 'ima', 1720, 845),
    T('hogsmeade', 'Hogsmeade', 'ima', 1905, 865),
    // The Wilds
    T('nool-jungle', 'Nool Jungle', 'wld', 1700, 1062),
    T('elephant-land', 'Elephant Land', 'wld', 1905, 1082),
    T('tarzan-jungle', 'Tarzan Jungle', 'wld', 1720, 1162),
    T('rhino-land', 'Rhino Land', 'wld', 1905, 1222),
    T('jumanji', 'Jumanji', 'wld', 1800, 1322),
    // Astoria
    T('castle-in-the-air', 'Castle in the Air', 'ast', 1060, 1122),
    T('the-doldrums', 'The Doldrums', 'ast', 1110, 1212),
    T('dictionopolis', 'Dictionopolis', 'ast', 1245, 1182),
    T('digitopolis', 'Digitopolis', 'ast', 1245, 1292),
    T('munchkin-land', 'Munchkin Land', 'ast', 1130, 1342),
    T('emerald-city', 'Emerald City', 'ast', 990, 1302),
    T('sidewalk-ends', 'Where the Sidewalk Ends', 'ast', 840, 1282),
    T('wonka-factory', 'Wonka Factory', 'ast', 752, 1382),
    T('whoville', 'Whoville', 'ast', 762, 1432),
    T('fantasia', 'Fantasia', 'ast', 442, 1432),
  ],

  landmasses: [
    { id: 'empyrea', ring: [[230, 70], [560, 60], [820, 95], [1180, 110], [1500, 150], [1700, 300], [1500, 320], [1100, 230], [780, 220], [500, 210], [260, 180]] },
    { id: 'albiona', ring: [[110, 360], [330, 360], [350, 540], [300, 690], [150, 700], [100, 540]] },
    { id: 'ardania', ring: [[90, 760], [470, 770], [500, 1000], [470, 1200], [330, 1360], [150, 1360], [70, 1160], [110, 940]] },
    { id: 'mystil', ring: [[1340, 380], [1640, 380], [1640, 700], [1480, 700], [1340, 560]] },
    { id: 'imagil', ring: [[1700, 390], [1960, 390], [1965, 700], [1965, 920], [1760, 920], [1690, 740]] },
    { id: 'wilds', ring: [[1660, 1020], [1965, 1020], [1965, 1380], [1740, 1380], [1660, 1180]] },
    { id: 'astoria', ring: [[420, 1380], [820, 1320], [1060, 1080], [1300, 1140], [1320, 1320], [1100, 1470], [500, 1480]] },
  ],

  seaRoutes: [
    // Empyrea links
    ['el-dorado', 'turtle-island'], ['undying-lands', 'avalon'], ['asgard', 'avalon'],
    ['mount-olympus', 'cyclops-land'], ['el-dorado', 'hundred-acre-wood'], ['shangri-la', 'atlantis'],
    // Albiona links
    ['cheshire-cat-wood', 'cyclops-land'], ['queen-of-hearts', 'giant-land'], ['camelot', 'avalon'],
    // Ardania links
    ['archenland', 'lilliput'], ['calormen', 'sidewalk-ends'], ['gondor', 'fantasia'], ['cair-paravel', 'utopia'],
    // The Isles internal web
    ['cyclops-land', 'loompa-land'], ['cyclops-land', 'atlantis'], ['loompa-land', 'utopia'],
    ['atlantis', 'utopia'], ['atlantis', 'jurassic-park'], ['utopia', 'lilliput'],
    ['jurassic-park', 'never-neverland'], ['never-neverland', 'utopia'], ['never-neverland', 'wild-things'],
    // Isles ↔ Mystil
    ['atlantis', 'land-time-forgot'], ['jurassic-park', 'lost-world'], ['jurassic-park', 'fountain-of-youth'],
    // Isles ↔ Astoria
    ['lilliput', 'sidewalk-ends'], ['utopia', 'castle-in-the-air'], ['never-neverland', 'dictionopolis'],
    // Isles ↔ Imagil / Wilds
    ['wild-things', 'forbidden-forest'], ['wild-things', 'nool-jungle'],
    // Mystil ↔ Imagil
    ['lost-world', 'hundred-acre-wood'], ['fountain-of-youth', 'guilder'],
    // Imagil ↔ Wilds
    ['forbidden-forest', 'nool-jungle'], ['hogsmeade', 'nool-jungle'],
    // Wilds ↔ Astoria
    ['jumanji', 'digitopolis'],
  ],
};
