export type MissionId =
  | 'asia-africa'
  | 'asia-s-america'
  | 'n-america-africa'
  | 'n-america-australia'
  | 'europe-australia-plus'   // Europe + Australia + any 1 additional continent
  | 'europe-s-america-plus'   // Europe + South America + any 1 additional continent
  | 'occupy-24'               // Control any 24 territories
  | 'occupy-18-2armies';      // Control 18 territories each with ≥ 2 armies

export const ALL_MISSION_IDS: readonly MissionId[] = [
  'asia-africa',
  'asia-s-america',
  'n-america-africa',
  'n-america-australia',
  'europe-australia-plus',
  'europe-s-america-plus',
  'occupy-24',
  'occupy-18-2armies',
];

export const MISSION_LABEL: Record<MissionId, string> = {
  'asia-africa':           'Conquer Asia + Africa',
  'asia-s-america':        'Conquer Asia + South America',
  'n-america-africa':      'Conquer North America + Africa',
  'n-america-australia':   'Conquer North America + Australia',
  'europe-australia-plus': 'Conquer Europe + Australia + 1 more continent',
  'europe-s-america-plus': 'Conquer Europe + South America + 1 more continent',
  'occupy-24':             'Occupy any 24 territories',
  'occupy-18-2armies':     'Occupy 18 territories with ≥ 2 armies each',
};

export type GameMode =
  | 'world'       // World Domination — last player standing / all 42
  | 'capitals'    // Capital Conquest — own all capitals
  | 'missions'    // Secret Missions — hidden objective cards
  | 'domination'  // Capture % threshold
  | 'turnlimit'   // Fixed rounds, most territories wins
  | 'twoplayer'   // 2-player neutral-army variant
  | 'zombies'     // Zombie faction spreads each round
  | 'assassin'    // Secret Assassin — eliminate your target
  | 'blizzards'   // Frozen territories each round
  | 'portals';    // Extra non-geographic adjacencies

export type CardBonusMode = 'none' | 'fixed' | 'progressive' | 'nuclear';
/** How armies are deployed: 'step' = one army per click (round-robin setup); 'batch' = deploy
 *  the whole pool at once via a count picker (all starting armies on your first turn, and each
 *  round's reinforcements in one action). */
export type PlacementMode = 'step' | 'batch';
/** How starting armies are deployed at game start: 'manual' = each player places their
 *  starting pool one territory at a time (the classic setup phase); 'auto' = the starting
 *  pool is spread automatically across each player's territories, skipping setup and going
 *  straight to the first reinforce turn. */
export type SetupMode = 'manual' | 'auto';
export type DiceMode = 'balanced' | 'random';
export type AiDifficulty = 'easy' | 'normal' | 'hard';
/** Team mode: 'off' = free-for-all; '2v2' = 4 players 2 teams; '3v3' = 6 players 2 teams. */
export type TeamsMode = 'off' | '2v2' | '3v3';
/** Selectable board. 'classic' = standard 42-territory world; 'imperial' = the 70-territory world. */
export type MapId = 'classic' | 'imperial';

export interface GameConfig {
  readonly mode: GameMode;
  readonly numOpponents: number;
  readonly aiDifficulty: AiDifficulty;
  readonly cardBonus: CardBonusMode;
  readonly placement: PlacementMode;
  /** How starting armies are deployed. Defaults to 'manual' when omitted. */
  readonly setupMode?: SetupMode;
  readonly fogOfWar: boolean;
  readonly dice: DiceMode;
  readonly teams: TeamsMode;
  /** Which board to play on. Defaults to 'classic' when omitted. */
  readonly mapId?: MapId;
  /** Domination threshold (mode === 'domination'): fraction 0–1 of territories. Default 0.70. */
  readonly dominationThreshold?: number;
  /** Turn limit (mode === 'turnlimit'): number of full rounds before scoring. Default 15. */
  readonly turnLimit?: number;
  /** Per-turn timer in seconds (0 = off). When it hits 0, the human's turn auto-ends. */
  readonly turnTimer?: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'world',
  numOpponents: 1,
  aiDifficulty: 'normal',
  cardBonus: 'progressive',
  placement: 'step',
  setupMode: 'manual',
  fogOfWar: false,
  dice: 'random',
  teams: 'off',
  turnTimer: 0,
};

export interface ModeMetadata {
  readonly id: GameMode;
  readonly label: string;
  readonly blurb: string;
  readonly implemented: boolean;
}

export const MODES: readonly ModeMetadata[] = [
  {
    id: 'world',
    label: 'World Domination',
    blurb: 'Conquer every territory on the board. Last player standing wins.',
    implemented: true,
  },
  {
    id: 'capitals',
    label: 'Capital Conquest',
    blurb: 'Hold your capital and seize every enemy capital.',
    implemented: true,
  },
  {
    id: 'missions',
    label: 'Secret Missions',
    blurb: 'Complete your hidden objective before anyone else.',
    implemented: true,
  },
  {
    id: 'domination',
    label: 'Domination',
    blurb: 'Control a target % of territories to claim victory.',
    implemented: true,
  },
  {
    id: 'turnlimit',
    label: 'Turn Limit',
    blurb: 'Most territories after a fixed number of rounds wins.',
    implemented: true,
  },
  {
    id: 'twoplayer',
    label: '2-Player',
    blurb: 'A neutral army balances head-to-head play.',
    implemented: true,
  },
  {
    id: 'zombies',
    label: 'Zombies',
    blurb: 'A zombie horde spreads across the map each round.',
    implemented: true,
  },
  {
    id: 'assassin',
    label: 'Secret Assassin',
    blurb: 'Eliminate your secret target before yours finds you.',
    implemented: true,
  },
  {
    id: 'blizzards',
    label: 'Blizzards',
    blurb: 'Random territories freeze each round, shifting battle lines.',
    implemented: true,
  },
  {
    id: 'portals',
    label: 'Portals',
    blurb: 'Wormholes add unexpected attack routes across the globe.',
    implemented: true,
  },
];
