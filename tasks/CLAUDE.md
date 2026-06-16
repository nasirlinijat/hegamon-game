# Risk — Project Guide (CLAUDE.md)

## What we're building
A playable digital version of the board game Risk: world domination on a
42-territory, 6-continent map. Single human vs AI opponents (hotseat optional later).

## Golden rule: engine first, UI last
Game logic lives in a PURE, framework-free engine with ZERO UI/DOM imports.
The UI only reads engine state and dispatches actions. Never put rules in components.
- `src/engine/` — pure TypeScript. No React, no DOM. Fully unit-tested.
- `src/ui/` — rendering and input only. Imports from engine; engine NEVER imports from ui.
If tempted to compute a rule inside a component, STOP and put it in the engine with a test.

## Tech stack
- TypeScript (strict mode)
- Vite (dev/build)
- Vitest (tests)
- React + SVG for the UI (swappable; the engine must not depend on it)

## Architecture / modules
- `engine/map.ts` — territory + continent data, adjacency list, continent bonuses (pure data + lookups)
- `engine/state.ts` — GameState type, players, ownership, army counts, phase, card hands, turn pointer
- `engine/dice.ts` — dice rolling with an INJECTABLE rng (so combat is deterministic in tests)
- `engine/rules.ts` — reinforcement count, combat resolution, fortify validation, capture, win check
- `engine/cards.ts` — deck, draw, set detection, trade-in values
- `engine/ai.ts` — opponent decisions (pure: state in → action out)
- `engine/actions.ts` — action types + reducer: `(state, action) => newState`
- `ui/*` — board, panels, controls

## RNG must be injectable
`dice.ts` takes an rng function so tests feed fixed rolls. NEVER call `Math.random()`
inside rules. This is the only way to test combat deterministically.

## THE RULES (implement exactly — these are the common bug spots)

### Reinforcement (draft phase)
- base = `max(3, floor(territoriesOwned / 3))`
- PLUS a continent bonus for EACH continent the player owns ENTIRELY
- PLUS card trade-in armies if a set is turned in
- Continent bonuses: North America 5, South America 2, Europe 5, Africa 3, Asia 7, Australia 2

### Attack / combat
- May attack only an ADJACENT territory owned by another player.
- Attacking territory needs >= 2 armies (must always leave 1 behind).
- Attacker dice = `min(3, attackingArmies - 1)`.
- Defender dice = `min(2, defendingArmies)`.
- Roll both, sort each DESCENDING, compare highest-vs-highest then second-vs-second.
- DEFENDER WINS TIES. Loser of each compared pair loses one army.
- If defender reaches 0: attacker captures and must move in AT LEAST the number of
  attack dice just rolled (and >= 1), up to `(attackingArmies - 1)`.
- A player who captures >= 1 territory during their turn draws ONE card at end of turn.

### Fortify
- One fortify move per turn.
- Move armies between two owned territories CONNECTED through a path of territories you
  own (NOT merely adjacent — do a graph traversal over owned territories).
- Must leave >= 1 army in the source.

### Cards
- Types: Infantry, Cavalry, Artillery, + Wild.
- A valid set: three of the same type, OR one of each type, OR any two + a wild.
- Must trade when holding >= 5 cards at the start of your turn.
- Trade-in values escalate globally: 4, 6, 8, 10, 12, 15, then +5 each subsequent trade.
- +2 bonus armies if a traded card shows a territory you own (placed on that territory).

### Win condition
- A player owning zero territories is eliminated; if eliminated by an attacker, the
  attacker takes their cards (and must immediately trade if now holding >= 6).
- Game ends when one player owns all 42 territories.

## Testing requirements
- Every function in `rules.ts`, `cards.ts`, `dice.ts` has unit tests.
- Combat tests use a mock rng and assert exact army outcomes, INCLUDING the tie-goes-to-defender case.
- Sanity test: total armies on the board change only via combat losses + reinforcements.
- Run `npm test` and show passing output before claiming a layer is done.

## Workflow expectations
- Use plan mode for each new layer; do not jump straight to code.
- Build order: engine+tests → turn state machine → win/cards → basic AI → UI → smarter AI.
- Commit after each layer passes tests, with a descriptive message.
- Show test output as evidence; never assert success without it.
- Keep components dumb; all logic in the engine.

## Out of scope (v1)
- Online multiplayer / networking
- The 2-player neutral-army variant (add later)
- Mission / secret-objective card mode
