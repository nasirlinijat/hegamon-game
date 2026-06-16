# Risk — Build Plan (tasks/todo.md)

Work top to bottom. Finish and commit each phase before starting the next.
Check items off as you go. Definition of done is at the bottom.

## Phase 0 — Project setup
- [ ] Init repo; Vite + TypeScript (strict) + Vitest
- [ ] Folder structure: `src/engine`, `src/ui`, `tests`
- [ ] npm scripts: `dev`, `build`, `test`, `test:watch`
- [ ] Confirm a trivial test runs green

## Phase 1 — Map data
- [ ] `map.ts`: 42 territories with id, name, continent
- [ ] Full adjacency list
- [ ] Continent definitions + bonuses (NA 5, SA 2, EU 5, AF 3, AS 7, AU 2)
- [ ] Test: adjacency is symmetric (A→B implies B→A)
- [ ] Test: every territory is in exactly one continent; 42 total
- [ ] Commit

## Phase 2 — State + actions skeleton
- [ ] `state.ts`: GameState, Player, ownership map, army counts, phase, turn pointer, hands
- [ ] `actions.ts`: action union + reducer `(state, action) => state`
- [ ] `dice.ts`: `rollDice(n, rng)` with INJECTABLE rng
- [ ] Test: reducer is pure (does not mutate input state)
- [ ] Commit

## Phase 3 — Core rules (the heart)
- [ ] `calcReinforcements(state, player)` incl. full-continent bonuses
- [ ] `resolveCombat(attDice, defDice)` → losses (tie → defender)
- [ ] `applyAttack` incl. capture + minimum-move rule
- [ ] `validateFortify` with connected-path traversal over owned territories
- [ ] Tests: reinforcement counts (with & without full continent)
- [ ] Tests: combat including the tie case; capture army movement
- [ ] Test: fortify between adjacent-but-unconnected territories must FAIL
- [ ] Commit

## Phase 4 — Turn cycle + win
- [ ] Enforce phase order: reinforce → attack → fortify → next player
- [ ] Reject illegal actions for the current phase
- [ ] Elimination handling + own-all-42 win check
- [ ] Test: a scripted game reaches a win state
- [ ] Commit

## Phase 5 — Cards
- [ ] `cards.ts`: deck, draw-one-on-capture
- [ ] Set detection (3-of-a-kind / one-of-each / two + wild)
- [ ] Escalating trade-in values (4, 6, 8, 10, 12, 15, +5…)
- [ ] Force trade when holding >= 5 at turn start; +2 territory-match bonus
- [ ] Tests for each set type + the escalation counter
- [ ] Commit

## Phase 6 — Basic AI
- [x] `ai.ts`: legal reinforcement placement, legal attacks, one legal fortify
- [x] Must ONLY ever produce legal actions (assert via reducer)
- [x] Test: AI-vs-AI game runs to completion with zero illegal moves
- [x] Commit

## Phase 7 — UI
- [x] SVG world map; territories clickable; show owner color + army count
- [x] Phase controls (reinforce / attack / fortify / end turn)
- [x] Combat result display (dice + losses)
- [x] Wire UI to dispatch engine actions; UI holds NO rules
- [x] Commit

## Phase 8 — Smarter AI (optional polish)
- [ ] Prioritize completing and holding continents
- [ ] Attack weak borders; avoid overextension
- [ ] Fortify toward the front line
- [ ] Commit

---

## Definition of done (every phase)
Tests green (`npm test`), no rules logic in the UI, committed with a clear message.
Show the test output as evidence before checking a phase complete.
