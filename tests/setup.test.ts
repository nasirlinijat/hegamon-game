import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  STARTING_ARMIES,
  type GameState,
  type PlayerId,
} from '../src/engine/state';
import { reduce, type Action } from '../src/engine/actions';
import { chooseAction } from '../src/engine/ai';
import { ALL_TERRITORY_IDS } from '../src/engine/map';
import { DEFAULT_CONFIG, type GameConfig } from '../src/engine/modes';

function totalArmies(s: GameState): number {
  return ALL_TERRITORY_IDS.reduce((sum, id) => sum + (s.armies[id] ?? 0), 0);
}
function armiesOf(s: GameState, pid: PlayerId): number {
  return ALL_TERRITORY_IDS.filter((id) => s.owner[id] === pid).reduce((sum, id) => sum + s.armies[id]!, 0);
}
function setupTotalLeft(s: GameState): number {
  return Object.values(s.setupRemaining).reduce((a, b) => a + b, 0);
}

// The default config now auto-deploys armies (skips the setup phase). These tests exercise the
// manual setup-phase mechanics, so they opt into manual + step placement explicitly.
const MANUAL: GameConfig = { ...DEFAULT_CONFIG, setupMode: 'manual', placement: 'step' };

describe('setup — initial deal', () => {
  it('enters the setup phase with 1 army on every territory', () => {
    const s = createInitialState(['You', 'CPU 1', 'CPU 2'], { setup: true, config: MANUAL });
    expect(s.phase).toBe('setup');
    expect(ALL_TERRITORY_IDS.every((id) => s.armies[id] === 1)).toBe(true);
    expect(totalArmies(s)).toBe(42);
  });

  it('gives each player STARTING_ARMIES[N] − (territories dealt) to place', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `P${i}`);
      const s = createInitialState(ids, { setup: true, config: MANUAL });
      for (const pid of ids) {
        const dealt = ALL_TERRITORY_IDS.filter((id) => s.owner[id] === pid).length;
        expect(s.setupRemaining[pid]).toBe(STARTING_ARMIES[n]! - dealt);
      }
      // Each player's eventual total = STARTING_ARMIES; placed-so-far (=dealt) + remaining.
      for (const pid of ids) {
        expect(armiesOf(s, pid) + s.setupRemaining[pid]!).toBe(STARTING_ARMIES[n]);
      }
    }
  });

  it('throws for an unsupported player count (>6)', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `P${i}`);
    expect(() => createInitialState(ids, { setup: true, config: MANUAL })).toThrow();
  });

  it('assigns every territory to exactly one player and keeps counts even', () => {
    const ids = ['You', 'CPU 1', 'CPU 2'];
    const s = createInitialState(ids, { setup: true, rng: () => 0.42 });
    // Every territory owned by one of the players (no gaps).
    expect(ALL_TERRITORY_IDS.every((id) => ids.includes(s.owner[id]!))).toBe(true);
    // Round-robin over the shuffled order keeps shares within 1 of each other (42 / 3 = 14 each).
    const counts = ids.map((pid) => ALL_TERRITORY_IDS.filter((id) => s.owner[id] === pid).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(42);
  });

  it('deal is randomized: different RNG → different layout; same RNG → identical', () => {
    const ids = ['You', 'CPU 1'];
    let n1 = 0; const rngA = () => (n1++ % 2 === 0 ? 0.9 : 0.1);
    let n2 = 0; const rngB = () => (n2++ % 2 === 0 ? 0.9 : 0.1);
    let n3 = 0; const rngC = () => (n3++ % 3 === 0 ? 0.2 : 0.8);
    const a = createInitialState(ids, { setup: true, rng: rngA });
    const b = createInitialState(ids, { setup: true, rng: rngB });
    const c = createInitialState(ids, { setup: true, rng: rngC });
    // Same RNG sequence → identical deal (deterministic).
    expect(ALL_TERRITORY_IDS.map((id) => a.owner[id])).toEqual(ALL_TERRITORY_IDS.map((id) => b.owner[id]));
    // Different RNG → at least one territory changes hands (not a fixed round-robin).
    expect(ALL_TERRITORY_IDS.some((id) => a.owner[id] !== c.owner[id])).toBe(true);
  });
});

describe('setup — placement', () => {
  it('places one army and passes to the next player', () => {
    const s = createInitialState(['A', 'B'], { setup: true, config: MANUAL });
    const myTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === 'A')!;
    const before = s.armies[myTerr]!;
    const beforeRemaining = s.setupRemaining['A']!;

    const next = reduce(s, { type: 'REINFORCE', territory: myTerr, count: 1 });
    expect(next.armies[myTerr]).toBe(before + 1);
    expect(next.setupRemaining['A']).toBe(beforeRemaining - 1);
    expect(next.players[next.turnPointer]!.id).toBe('B'); // passed to next player
    expect(next.phase).toBe('setup');
  });

  it('rejects placing on a territory you do not own', () => {
    const s = createInitialState(['A', 'B'], { setup: true, config: MANUAL });
    const enemy = ALL_TERRITORY_IDS.find((id) => s.owner[id] === 'B')!;
    expect(() => reduce(s, { type: 'REINFORCE', territory: enemy, count: 1 })).toThrow();
  });

  it('rejects placing more armies than remain in the pool', () => {
    const s = createInitialState(['A', 'B'], { setup: true, config: MANUAL });
    const myTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === 'A')!;
    const tooMany = s.setupRemaining['A']! + 1;
    expect(() => reduce(s, { type: 'REINFORCE', territory: myTerr, count: tooMany })).toThrow();
  });

  it('only allows REINFORCE during setup', () => {
    const s = createInitialState(['A', 'B'], { setup: true, config: MANUAL });
    expect(() => reduce(s, { type: 'END_PHASE' })).toThrow();
    expect(() => reduce(s, { type: 'FORTIFY', from: 'alaska', to: 'alberta', count: 1 })).toThrow();
  });

  describe('batch placement', () => {
    const BATCH: GameConfig = { ...DEFAULT_CONFIG, setupMode: 'manual', placement: 'batch' };

    it('keeps the current player placing until their pool is empty, then passes', () => {
      const s = createInitialState(['A', 'B'], { setup: true, config: BATCH, rng: () => 0 });
      const aTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === 'A')!;
      const pool = s.setupRemaining['A']!;

      // Partial placement → still A's turn.
      const s1 = reduce(s, { type: 'REINFORCE', territory: aTerr, count: 1 });
      expect(s1.players[s1.turnPointer]!.id).toBe('A');
      expect(s1.setupRemaining['A']).toBe(pool - 1);

      // Empty the pool → play passes to B.
      const s2 = reduce(s1, { type: 'REINFORCE', territory: aTerr, count: pool - 1 });
      expect(s2.setupRemaining['A']).toBe(0);
      expect(s2.players[s2.turnPointer]!.id).toBe('B');
      expect(s2.phase).toBe('setup');
    });

    it('step placement still passes after a single army (regression)', () => {
      const s = createInitialState(['A', 'B'], { setup: true, config: MANUAL }); // default = step
      const aTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === 'A')!;
      const next = reduce(s, { type: 'REINFORCE', territory: aTerr, count: 1 });
      expect(next.players[next.turnPointer]!.id).toBe('B');
    });
  });
});

describe('setup — completion', () => {
  it('transitions to the first player\'s reinforce phase once all armies are placed', () => {
    let s = createInitialState(['A', 'B'], { setup: true, config: MANUAL });

    // Drive placement greedily: each player drops onto their first owned territory.
    let guard = 0;
    while (s.phase === 'setup' && guard++ < 200) {
      const pid = s.players[s.turnPointer]!.id;
      const myTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === pid)!;
      const action: Action = { type: 'REINFORCE', territory: myTerr, count: 1 };
      s = reduce(s, action);
    }

    expect(s.phase).toBe('reinforce');
    expect(s.turnPointer).toBe(0);
    expect(setupTotalLeft(s)).toBe(0);
    // Each player ended with exactly their starting-army allotment on the board.
    expect(armiesOf(s, 'A')).toBe(STARTING_ARMIES[2]);
    expect(armiesOf(s, 'B')).toBe(STARTING_ARMIES[2]);
    // First player has reinforcements computed for their opening turn.
    expect(s.reinforcementsRemaining).toBeGreaterThanOrEqual(3);
  });

  it('total board armies only ever grow by placements during setup', () => {
    let s = createInitialState(['A', 'B', 'C'], { setup: true, config: MANUAL });
    let prev = totalArmies(s);
    let guard = 0;
    while (s.phase === 'setup' && guard++ < 300) {
      const pid = s.players[s.turnPointer]!.id;
      const myTerr = ALL_TERRITORY_IDS.find((id) => s.owner[id] === pid)!;
      s = reduce(s, { type: 'REINFORCE', territory: myTerr, count: 1 });
      const now = totalArmies(s);
      // Setup placements add exactly 1 until the final transition (which adds reinforcements via startTurn? no — startTurn doesn't place).
      if (s.phase === 'setup') expect(now).toBe(prev + 1);
      prev = now;
    }
    // After setup, the board holds every player's full starting allotment.
    expect(totalArmies(s)).toBe(STARTING_ARMIES[3]! * 3);
  });
});

describe('setup — AI placement', () => {
  it('the AI drives a full setup to completion without illegal moves', () => {
    let s = createInitialState(['A', 'B', 'C', 'D'], { setup: true, config: MANUAL });
    const rng = () => 0.5;
    let guard = 0;
    while (s.phase === 'setup' && guard++ < 500) {
      const action = chooseAction(s, rng);
      expect(action.type).toBe('REINFORCE');
      expect(() => { s = reduce(s, action); }).not.toThrow();
    }
    expect(s.phase).toBe('reinforce');
    expect(setupTotalLeft(s)).toBe(0);
    expect(armiesOf(s, 'A')).toBe(STARTING_ARMIES[4]);
  });
});

describe('setup — auto-deploy (setupMode: auto)', () => {
  const AUTO: GameConfig = { ...DEFAULT_CONFIG, setupMode: 'auto' };

  it('spreads starting armies and skips setup, entering reinforce directly', () => {
    const s = createInitialState(['A', 'B', 'C'], { setup: true, config: AUTO });
    expect(s.phase).toBe('reinforce');
    expect(s.setupRemaining).toEqual({});
    expect(s.turnPointer).toBe(0);
    expect(s.reinforcementsRemaining).toBeGreaterThanOrEqual(3);
  });

  it('each player holds their full starting allotment, distributed (not all 1s)', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `P${i}`);
      const s = createInitialState(ids, { setup: true, config: AUTO });
      for (const pid of ids) {
        expect(armiesOf(s, pid)).toBe(STARTING_ARMIES[n]);
      }
      expect(totalArmies(s)).toBe(STARTING_ARMIES[n]! * n);
      // With more armies than territories, at least some territory holds > 1 army.
      expect(ALL_TERRITORY_IDS.some((id) => (s.armies[id] ?? 0) > 1)).toBe(true);
    }
  });

  it('every territory keeps at least 1 army (no empty owned territory)', () => {
    const s = createInitialState(['A', 'B'], { setup: true, config: AUTO });
    expect(ALL_TERRITORY_IDS.every((id) => (s.armies[id] ?? 0) >= 1)).toBe(true);
  });

  it('scatters randomly: counts vary across territories and respect the per-territory cap (≤8)', () => {
    // Seeded LCG rng so the random scatter is deterministic for the assertion.
    let seed = 12345;
    const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const s = createInitialState(['A', 'B'], { setup: true, config: AUTO, rng });
    const counts = ALL_TERRITORY_IDS.filter((id) => s.owner[id] === 'A').map((id) => s.armies[id]!);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(8);  // capped
    expect(new Set(counts).size).toBeGreaterThan(1);     // not a flat, even spread
    expect(counts.reduce((a, b) => a + b, 0)).toBe(STARTING_ARMIES[2]); // full pool placed
  });
});

describe('setup — opt-out (legacy default unchanged)', () => {
  it('without setup, boots straight into reinforce with flat armies', () => {
    const s = createInitialState(['A', 'B']);
    expect(s.phase).toBe('reinforce');
    expect(s.setupRemaining).toEqual({});
    expect(ALL_TERRITORY_IDS.every((id) => s.armies[id] === 3)).toBe(true);
  });
});
