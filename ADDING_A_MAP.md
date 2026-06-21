# Adding a New Map — Complete Playbook

This is a **standalone** guide: a fresh AI agent (or human) with no prior context can follow it to
add a brand-new playable board from a reference image. It documents the full pipeline and every
non-obvious issue we hit building the **Imperial World** (79 territories) board, with the fix baked
in so you don't re-hit them.

> **Imaginary (non-real-world) boards** take a different path — they are generated procedurally, not
> from Natural Earth. See `scripts/build-fantasy-maps.mjs` + `scripts/fantasy-map-specs.mjs`: each
> continent is an organic "blob" carved into territories by a Lloyd-relaxed **Voronoi** diagram, so
> territories tile each continent and **adjacency is derived from shared borders** (visuals and graph
> always fit). The script emits *both* the engine module and the geometry module. To add one, append a
> spec (continent blobs + sea-route `links`) and run `node scripts/build-fantasy-maps.mjs`, then
> register it exactly as below (`MapId`, `MAPS`, a `map-render` bundle with `touchGrid: 2`, and the
> board selector). Verdantia / Sundered Isles / Long March / Twin Crowns are worked examples.

There are two worked examples in the repo — read them before starting; you will copy their shape:

| Concern | Classic (42 territories) | Imperial (79 territories) |
|---|---|---|
| Engine data | `src/engine/map.ts` (`CLASSIC_MAP`) | `src/engine/imperial-map.ts` (`IMPERIAL_MAP`) |
| Geometry build script | `scripts/build-map.mjs` | `scripts/build-imperial-map.mjs` |
| Generated geometry | `src/ui/map-geometry.ts` | `src/ui/map-geometry-imperial.ts` |
| Render tuning | `CLASSIC` block in `src/ui/map-render.ts` | `IMPERIAL` block in `src/ui/map-render.ts` |
| Tests | `tests/map.test.ts` | `tests/imperial-map.test.ts` |

**Golden rule:** copy the imperial build script and the imperial engine module, then change the data.
Don't invent new mechanisms — every problem below already has a solution in those files.

---

## Mental model

A board has **two halves that never mix**:

1. **Engine data** (`GameMap`) — pure logic: which territories exist, which continents they belong
   to, and the adjacency graph. No pixels. Lives in `src/engine/`.
2. **Geometry** — the SVG shapes, label/coin positions, and sea-route connectors. Generated offline
   from public-domain **Natural Earth 110m** data into `src/ui/map-geometry-<board>.ts`, then turned
   into a draw bundle by `src/ui/map-render.ts`.

The engine is **map-agnostic**: every rule reads `state.map.*` (never a hard-coded global).
`config.mapId` selects the board, `getMap(mapId)` (`src/engine/map-registry.ts`) resolves it, and
`createInitialState` stores the resolved `GameMap` on `state.map`. So once your `GameMap` is
registered, **all 10 game modes and every setting work on it automatically** (see caveat in
§"Modes & settings compatibility").

`GameMap` (in `src/engine/map.ts`):
```ts
interface GameMap {
  id: string;
  name: string;
  continents: Record<ContinentId, Continent>;   // Continent = { id, name, bonus, territories[] }
  territories: Record<TerritoryId, Territory>;   // Territory = { id, name, continent }
  allTerritoryIds: readonly TerritoryId[];
  adjacency: Record<TerritoryId, readonly TerritoryId[]>;
}
```
`TerritoryId` and `ContinentId` are plain `string`, so a new board introduces its own ids freely.

---

## Phase 0 — Read the image into a territory plan

From the reference image, produce a plan **before touching code**:

1. **List every territory** and which continent it belongs to. Group into continents and assign a
   bonus per continent (classic bonuses scale with size: small continents +2, large +7; pick
   similar).
2. **Map each territory to real-world geography** for the geometry step. Three sources, in order of
   preference:
   - **A whole country** → use its ISO 3166-1 *numeric* code (e.g. France = 250, China = 156).
   - **A sub-country split** of US / Canada / Russia / Australia → use real admin-1 provinces
     (these four are the only countries with province data in `data/admin1-states.json`).
   - **A sub-country split of any other country** (e.g. western China, northern Saudi) → a lon/lat
     **box clip** of the country polygon.
   - **Fantasy names** (e.g. "Tatarland", "Jungle", "New Holland") → map to the nearest real region
     and just give it the fantasy display name. The geometry follows real coastlines; only the label
     differs.
3. **Decide continent ids.** Reuse classic ids (`NA`, `SA`, `EU`, `AF`, `AS`, `AU`) where the regions
   line up — this keeps Secret-Missions mode fully working (see §compatibility). New ids are fine but
   make continent-based missions referencing the old ids unwinnable on your board.
4. **Draft the adjacency** as an **undirected edge list** (each border once). Only connect
   territories that genuinely touch or have a real sea crossing — see the "geographically-wrong
   edges" gotcha; bad edges produce ugly connector lines.

ISO numeric codes: look them up (Natural Earth / ISO 3166-1). Verify a code exists by checking it's
a key in `data/countries-110m.json` (`world-atlas` zero-pads to 3 digits, e.g. `'076'`).

---

## Phase 1 — Engine data module: `src/engine/<board>-map.ts`

Copy `src/engine/imperial-map.ts` and replace the data. Key patterns to keep:

- Declare continents as `{ id, name, bonus, territories: [[id, 'Display Name'], …] }`.
- Declare adjacency as an **undirected `EDGES` array** (`['a','b']` listed once). Build the symmetric
  `adjacency` record in code by adding **both** directions. This guarantees the *"A→B implies B→A"*
  invariant for free and halves authoring.
- **Validate at module load**: throw if any edge endpoint isn't a known territory, and initialise
  every territory's adjacency to `[]` so isolated-typo territories are caught.
- Export the assembled `GameMap`.

Result: a self-validating module. A typo in an edge fails fast with a clear error.

---

## Phase 2 — Register the board

- `src/engine/modes.ts`: add your id to the `MapId` union (`'classic' | 'imperial' | '<board>'`).
- `src/engine/map-registry.ts`: import your `GameMap` and add it to the `MAPS` record. `getMap()`
  already falls back to classic for unknown ids.

At this point the **engine** is done — you could play your board headless. The deck is already built
per-board (`createDeck(rng, getMap(config.mapId).allTerritoryIds)` in `src/ui/App.tsx`).

---

## Phase 3 — Geometry: `scripts/build-<board>-map.mjs`

Copy `scripts/build-imperial-map.mjs`. It shares the classic projection
(`geoEquirectangular().rotate([-12,0])`, 1280×720 `fitExtent`) so both boards use the same viewBox.
You only edit the **`COMPOSITION`** object (one entry per territory) and `EXPECTED_COUNT`.

Composition primitives already in the script:
| Helper | Use |
|---|---|
| `countryFeat([ids])` | whole countries by ISO numeric code; tracks `usedCountryIds` to warn on a country assigned twice |
| `rawCountry(id)` | a country feature **without** marking it used — for a country you will split |
| `provinceGroup(ADMIN, (lon,lat,name)=>bool)` | bin real admin-1 provinces (US/CA/RU/AU only) |
| `clip(feat, [lonMin,latMin,lonMax,latMax])` | carve a sub-region by lon/lat box (pixel-space) |
| `diff(base, ...others)` | a feature minus other features (e.g. `china` = China − uyghur − manchuria) |
| `mergePx([...])` | union features/regions into one (mix country + clip) |

**CRITICAL — clip in PIXEL space, never lon/lat.** The script's `clip`/`diff`/`mergePx` operate on
**projected pixel rings** and emit raw `M/L/Z` paths. If you instead clip raw lon/lat geometry and
feed it back through d3's *spherical* `geoPath`, reversed-winding rings render as the **whole-sphere
complement** — a giant rectangle covering the entire map. (We hit exactly this; the fix is why the
helpers project first.) Keep the helpers as-is.

**Label/coin point — pole of inaccessibility.** `labelPoint(d)` returns `{ x, y, r }`: the interior
point of the **largest** sub-polygon farthest from any edge (NOT a geographic centroid or vertex
average — those land in the sea on concave coasts or between islands). `r` is the inscribed-circle
radius (clearance), used later to keep the name on small territories. Already wired; don't change it.

Run it:
```bash
node scripts/build-<board>-map.mjs    # → "N/N territories", no missing/duplicate warnings
```
Output: `src/ui/map-geometry-<board>.ts` exporting `MAP_W`, `MAP_H`, `TERRITORY_PATH`,
`TERRITORY_CENTROID` (`{x,y,r}` per id), and `LAND_PATH`.

---

## Phase 4 — Render bundle + UI wiring

### `src/ui/map-render.ts`
Import your geometry module and add a bundle:
```ts
const <BOARD>: MapRender = build(<board>Geo, <BOARD>_MAP, { /* tuning */ });
// then in getMapRender(mapId): return mapId === '<board>' ? <BOARD> : …
```
`build(geo, map, tuning)` produces pruned paths, the id list, centroids, and the **sea-route
connectors**. Tuning fields (all optional):
| Field | Purpose |
|---|---|
| `touchGrid` (px) | **Use this for dense maps.** Two territories sharing an outline vertex (snapped to this lattice) are "touching" → no connector, regardless of sampling. Imperial uses `2`. |
| `gapThreshold` (px) | min gap before a connector is drawn between non-touching neighbours (imperial `8`). |
| `sampleCap` | max outline points sampled per territory for nearest-point gap (imperial `2000`). |
| `overrides` | `{ 'a\|b': {x1,y1,x2,y2,c?} }` hand-placed connector endpoints (see gotchas). Key is the two ids **sorted, joined by `\|`**. `c` bows the line. |
| `noConnector` | `['a\|b', …]` pairs that should never draw a line. |
| `pruneMin` | per-territory min sub-polygon area to keep (drops specks; default 30). |
| `excludePairs` / `wrapStubs` | classic-only dateline handling; ignore for new boards. |

### Other UI files
- `src/ui/SetupScreen.tsx`: add your board to the BOARD selector (label + blurb).
- `src/ui/territory-shapes.ts`: add a `CONTINENT_TINT` colour for **every new continent id**, or the
  continent-overlay view and map key render it grey.
- `src/ui/App.tsx`: nothing — the deck already uses the active map's territories.

Everything else (Board, Legend, Roster, ArmyMoveDial, CornerControls) already reads from
`state.map`, so it adapts automatically.

---

## Phase 5 — Tests: `tests/<board>-map.test.ts`

Mirror `tests/imperial-map.test.ts`:
- territory count; every territory in exactly one continent that lists it; continent lists partition
  the full set with no overlap;
- **adjacency symmetric**; no self-edges or duplicate edges; every territory has ≥1 neighbour;
- **graph fully connected** (BFS reaches all territories);
- playability: `createInitialState` deals every territory and sets `state.map`; a real attack across
  an edge captures; owning a continent grants its bonus.

Add a case to `tests/map-render.test.ts` asserting your connectors are in-bounds and short.

---

## Gotchas — symptom → cause → fix

These are real issues we hit. Each is already solved in the imperial files; this is so you recognise
them if you deviate.

1. **TS errors everywhere after adding the map** (`possibly undefined` on `state.owner[id]` etc.).
   *Cause:* `TerritoryId`/`ContinentId` are `string`, so under `noUncheckedIndexedAccess` indexing a
   record yields `T | undefined`. *Fix:* this is correct — a board's `owner`/`armies` only hold its
   own territories. The **classic** constants (`CONTINENTS`, `ADJACENCY`, …) are kept literal-typed
   (`ClassicTerritoryId`/`ClassicContinentId`) so existing callers stay clean; your new data is wide
   string-keyed and guarded with `?? …`. Don't widen the classic constants.

2. **A territory renders as a huge rectangle covering the map.** *Cause:* clipped lon/lat geometry
   fed to spherical `geoPath` with reversed winding. *Fix:* clip in **pixel space** (the script's
   helpers already do; don't reintroduce lon/lat clipping).

2a. **A territory has a stray fragment in a totally wrong region** (e.g. a red piece of *France* down
   in South America — its `countryFeat([250])` includes **French Guiana**). *Cause:* a country
   polygon carries far-flung overseas territory. *Fix:* clip the country to its main region, e.g.
   `france: clip(rawCountry(250), [-6, 41, 10, 52])`. Other offenders: Netherlands (Caribbean),
   Norway (Svalbard), Portugal (Azores). Detect them with the "stray-fragment scan" below — any
   sub-polygon with area > prune threshold far from the territory's label point. (Distant pieces that
   are *legitimate* — Canada's Arctic islands, far-east Russia — are fine; judge by geography.)

2b. **Box-clipped sub-country territories have straight edges and leave small slivers.** *Cause:*
   `clip`/`diff` cut along lon/lat boxes, so the split is a straight line and the difference can leave
   tiny disconnected fragments (China minus Uyghur/Manchuria left a sliver near Mongolia). *Fix:* the
   straight edges are inherent without province data — accept them; drop the slivers with a
   per-territory `pruneMin` in the render tuning (e.g. `pruneMin: { china: 120 }`).

3. **A name or coin sits in the sea / between islands.** *Cause:* geographic centroid or vertex
   average. *Fix:* `labelPoint` (pole of inaccessibility on the largest piece). Verify with the
   point-in-polygon script below.

4. **A name floats off a small territory** (but its coin is fine). *Cause:* the name is drawn at a
   fixed offset above the coin (`y − 16`), which overshoots small shapes. *Fix:* the offset is capped
   by clearance, `min(16, r × 0.7)`, using the `r` baked into each centroid. (`Board.tsx` already
   does this; make sure your geometry emits `r`.)

5. **Dotted lines cross *through* a territory between two territories that clearly share a border.**
   *Cause:* coarse outline sub-sampling makes a shared border read as a false gap. *Fix:* set
   `touchGrid` in your tuning — the shared-vertex test suppresses lines between touching territories
   regardless of sampling.

6. **A dotted line stretches across other land** (e.g. a connector cutting through France between
   Benelux and Switzerland). *Cause:* a **geographically-wrong adjacency edge** — two territories the
   graph connects but that don't actually touch, with a third between them. *Fix:* **remove the edge**
   from the engine module, not just the line. Removing only the line would leave an invisible
   adjacency (gotcha #7a); the edge itself is wrong. Re-run the connectivity (BFS) test after.

6a. **A connector is redundant or routed to the wrong spot.** Two tuning levers (set per board in the
   `build(...)` call in `map-render.ts`):
   - *Redundant line on a visibly-touching land border* (the gap just exceeds `gapThreshold`, e.g.
     India↔Uyghur in the Himalaya): add the pair to **`noConnector`** (`['india|uyghur', …]`) — the
     shared border already conveys the adjacency. Keys are the two ids **sorted, joined by `|`**.
   - *Line lands on the wrong crossing* (nearest-point picked a corner, e.g. Greece↔Turkiye hugging
     the Dardanelles instead of crossing the Aegean): add an **`overrides`** entry routing it to the
     correct coasts (read vertices with the "rendered geometry" script). Override endpoints are used
     verbatim — place them on the rendered (pruned) coast (gotcha #7).

7. **A connector endpoint floats in open water.** *Cause:* a hand-tuned `overrides` endpoint placed
   on raw geometry that the renderer **prunes away** (tiny speck islands are dropped), or placed off
   the coast. *Fix:* place override endpoints on a vertex of the **rendered (pruned)** path — use the
   "rendered geometry" verification script below to read actual coast vertices. **Do not** auto-snap
   endpoints to the nearest pooled coastline: the nearest point can belong to the *wrong* territory
   and collapse the line. Overrides are deliberate; place by hand and leave verbatim. Computed
   (non-override) connectors already span nearest sampled edge points, so they sit on each coast.

7a. **An "invisible adjacency" — two neighbours that neither touch nor have a line.** *Cause:* an
   adjacency whose territories don't share a border vertex but whose gap is **below `gapThreshold`**,
   so no connector is drawn — the player can attack but sees no link. *Fix:* audit every adjacency
   edge (script below) and set `gapThreshold` so each edge is either touching (shared vertex) or
   lined. The principled value is ~3px: above it a real sea gap shows and needs a line; below it the
   coasts read as touching (a line there is just clutter — its endpoint dots overlap into a blob). A
   misplaced/stray geometry piece (gotcha #2, France) can also inflate a gap — fix the geometry first.

8. **Coins overlap in dense regions / balloon when zoomed in.** *Cause:* fixed map-space coin size.
   *Fix:* `coinK = base / max(1, zoom)` in `Board.tsx` (a smaller `base` for dense boards — imperial
   0.62; classic 1). Already applies to all boards.

9. **Connector lines / dots get thick and huge when zoomed in.** *Cause:* line overlays drawn in map
   space scale with zoom. *Fix:* counter-scale stroke width, dash, and dot radius by
   `invScale = 1 / max(1, zoom)` (already applied to connectors, portal lines, dateline stubs).

10. **A continent shows grey, or two continents look the same colour, in the show-continents
    overlay.** *Cause:* a missing or near-duplicate tint. *Fix:* give **every** continent id an entry
    in `CONTINENT_TINT` (`src/ui/territory-shapes.ts`), and pick **N visually-distinct hues** for an
    N-continent board (the imperial 8 span gold→orange→red→magenta→purple→blue→teal→green). The
    overlay renders each continent's **name + `+N` bonus** centred on it (label placement is the
    average of its territory centroids — verify it lands on land, not in a sea gap, with the
    centroid script below).

---

## Modes & settings compatibility

Once registered, all modes/settings run on your board. Two things to know:

- **Secret Missions** evaluators in `src/engine/rules.ts` reference the **classic** continent ids
  (`NA, SA, EU, AF, AS, AU`). Continent-pair missions only work for continents your board *also*
  names with those ids; the `occupy-N` missions are continent-agnostic and always work. **Reuse
  classic continent ids where the regions correspond** to keep missions fully functional, or accept
  that some continent missions are unwinnable on your board (or add per-map mission definitions).
- **Cards / deck**: built from the active map's `allTerritoryIds` automatically; the "+2 if you own
  the card's territory" bonus works on any board.

---

## Verification — copy-paste checks

Run these after generating geometry; they catch the gotchas above mechanically.

**1. Build is clean** (no missing/duplicate-country warnings):
```bash
node scripts/build-<board>-map.mjs
```

**2. Every centroid is inside its shape** (point-in-polygon over the rendered path):
```bash
node -e "
const fs=require('fs');let s=fs.readFileSync('src/ui/map-geometry-<board>.ts','utf8');
const P=JSON.parse(s.match(/TERRITORY_PATH[^=]*=\s*(\{[\s\S]*?\}) as any/)[1]);
const C=JSON.parse(s.match(/TERRITORY_CENTROID[^=]*=\s*(\{[\s\S]*?\}) as any/)[1]);
const rings=d=>d.split('M').filter(Boolean).map(g=>{const n=g.match(/-?\d+(?:\.\d+)?/g)||[];const r=[];for(let i=0;i+1<n.length;i+=2)r.push([+n[i],+n[i+1]]);return r;}).filter(r=>r.length>=3);
const inR=(px,py,r)=>{let o=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const[xi,yi]=r[i],[xj,yj]=r[j];if(((yi>py)!=(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))o=!o;}return o;};
let bad=[];for(const id of Object.keys(P)){const c=C[id];if(!rings(P[id]).some(r=>inR(c.x,c.y,r)))bad.push(id);}
console.log(bad.length?'OFF-SHAPE: '+bad.join(', '):'all centroids on-shape');
"
```

**3. Stray-fragment scan** (gotcha #2a — overseas pieces in the wrong region):
```bash
node -e "
const fs=require('fs');let s=fs.readFileSync('src/ui/map-geometry-<board>.ts','utf8');
const P=JSON.parse(s.match(/TERRITORY_PATH[^=]*=\s*(\{[\s\S]*?\}) as any/)[1]);
const C=JSON.parse(s.match(/TERRITORY_CENTROID[^=]*=\s*(\{[\s\S]*?\}) as any/)[1]);
const subs=d=>d.split(/(?=M)/).map(x=>x.trim()).filter(Boolean);
const pts=sp=>{const n=sp.match(/-?\d+(?:\.\d+)?/g)||[];const p=[];for(let i=0;i+1<n.length;i+=2)p.push([+n[i],+n[i+1]]);return p;};
const area=p=>{let a=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;a+=p[i][0]*p[j][1]-p[j][0]*p[i][1];}return Math.abs(a/2);};
const cen=p=>{let x=0,y=0;for(const q of p){x+=q[0];y+=q[1];}return [x/p.length,y/p.length];};
for(const id of Object.keys(P)){const lp=C[id];for(const sp of subs(P[id])){const p=pts(sp);if(area(p)<30)continue;const c=cen(p);if(Math.hypot(c[0]-lp.x,c[1]-lp.y)>100)console.log(id,'stray area',area(p)|0,'at',[c[0]|0,c[1]|0]);}}
"
```
Flags France/Guiana-style strays. Distant pieces that are *legitimate* (Canada's Arctic islands,
far-east Russia) also show — judge by geography; clip only the genuinely misplaced ones.

**3b. Continent labels land on-land** (gotcha #10 — overlay label/coin stranded in a sea gap) — add a
throwaway test importing `getMapRender('<board>')` and the board's `GameMap`: for each continent,
average its territory centroids and assert the point is inside one of its territories (point-in-polygon
over that territory's rendered `TERRITORY_PATH`).

**3c. Connectors land on rendered land + adjacency is sane** — add a throwaway test importing
`getMapRender('<board>')` and, for each `GAP_CONNECTORS` entry, assert both endpoints are within
~3px of some territory's rendered `TERRITORY_PATH` (no floats) and lengths are short/in-bounds. (See
how `tests/map-render.test.ts` already does the in-bounds/length check; extend it for your board.)
Also **audit every adjacency edge** (gotcha #7a) for invisible neighbours.

**4. Reading actual coast vertices** for placing an override endpoint — parse
`getMapRender('<board>').TERRITORY_PATH[id]` into points and find the nearest vertex to a target, or
the nearest pair between two territories' rendered (pruned) paths. (This is how the imperial Indonesia
crossing endpoints were chosen.)

**5. Full health:**
```bash
npx tsc --noEmit   # clean
npm test           # all green (engine map tests + render tests)
npm run build      # succeeds
npm run dev        # pick the board: names/coins on land, connectors only on sea routes,
                   # everything stays crisp when zoomed in
```

---

## Final checklist
- [ ] `<board>-map.ts`: symmetric adjacency built from an edge list, validated at load, `GameMap` exported.
- [ ] Registered in `modes.ts` (`MapId`) and `map-registry.ts` (`MAPS`).
- [ ] `build-<board>-map.mjs`: `N/N territories`, no missing/duplicate warnings; geometry emits `r`.
- [ ] `map-render.ts` bundle added with tuning (`touchGrid` for dense boards); returned by `getMapRender`.
- [ ] `CONTINENT_TINT` has every new continent id; board added to `SetupScreen`.
- [ ] Centroids on-shape; connectors reach land, only on sea routes, no land crossings, no floats.
- [ ] No stray fragments; continent labels land on-land; continent tints are visually distinct.
- [ ] Continent ids chosen with Missions-mode compatibility in mind.
- [ ] `tsc` clean · `npm test` green · `npm run build` ok · dev smoke confirms it plays on both modes.
