# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What we're building

Hegemon — a turn-based global conquest game, single human vs AI opponents, with multiple selectable
boards (chosen on the setup screen). Classic and Imperial world boards plus several imaginary maps.
See `ADDING_A_MAP.md` for how a board is defined and rendered.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # production build
npm test           # Vitest (run all tests)
npm run test:watch # Vitest watch mode
```

Run a single test file: `npx vitest run src/engine/rules.test.ts`

## Architecture

```
src/
  engine/   # pure TypeScript — zero React/DOM imports
    map.ts      # territory data, adjacency list, continent bonuses
    state.ts    # GameState, Player, ownership, army counts, phase, hands, turn pointer
    dice.ts     # rollDice(n, rng) — rng is INJECTED, never call Math.random() here
    rules.ts    # reinforcements, combat, fortify validation, capture, win check
    cards.ts    # deck, draw, set detection, escalating trade-in values
    actions.ts  # action union + reducer: (state, action) => newState (pure, no mutation)
    ai.ts       # opponent decisions: state in → action out (pure)
  ui/       # rendering + input only; imports from engine; engine never imports from ui
tests/      # mirrors src/engine/
```

**Engine-first rule:** if logic belongs in a rule, put it in `engine/` with a test. Components only read state and dispatch actions.

## Key invariants

**Injectable RNG** — `dice.ts` takes an `rng: () => number` parameter so tests can feed fixed rolls and assert exact outcomes. This is the only way to make combat deterministic in tests.

**Reducer purity** — the reducer must not mutate its input state. Tests assert this.

**UI holds no rules** — components dispatch actions and render state. Zero game logic in UI files.

## The rules (common bug spots)

### Reinforcement
- `base = max(3, floor(territoriesOwned / 3))`
- +continent bonus for each fully-owned continent: NA 5, SA 2, EU 5, AF 3, AS 7, AU 2
- +card trade-in armies when a set is turned in

### Combat
- Source territory needs ≥ 2 armies; must always leave 1 behind.
- Attacker dice = `min(3, attackingArmies - 1)`; defender dice = `min(2, defendingArmies)`.
- Sort each set descending, compare pair-by-pair. **Defender wins ties.**
- On capture: attacker moves in at least the number of attack dice rolled (and ≥ 1), up to `attackingArmies - 1`.
- Capturing ≥ 1 territory in a turn earns one card draw at end of turn.

### Fortify
- One move per turn; source must keep ≥ 1 army.
- Source and destination must be connected through a **path of owned territories** (graph traversal — adjacency alone is not enough).

### Cards
- Valid set: three of the same type, one of each type, or any two + a wild.
- Must trade when holding ≥ 5 cards at turn start.
- Trade-in values escalate globally: 4, 6, 8, 10, 12, 15, then +5 each subsequent trade.
- +2 bonus if a traded card shows a territory you own (placed on that territory).
- On elimination: attacker takes the loser's cards; must immediately trade if now holding ≥ 6.

### Win condition
- Player with zero territories is eliminated.
- Game ends when one player owns all 42 territories.

## Testing requirements

- Every function in `rules.ts`, `cards.ts`, `dice.ts` must have unit tests.
- Combat tests use a mock rng and assert exact army outcomes including the tie case.
- Adjacency must be symmetric (A→B implies B→A).
- Total armies on the board change only via combat losses and reinforcements.
- Show `npm test` passing output before marking a phase complete.

## Build order

Engine + tests → turn state machine → win/cards → basic AI → UI → smarter AI.
Commit after each phase passes tests with a descriptive message.

## Out of scope (v1)

Online multiplayer.
