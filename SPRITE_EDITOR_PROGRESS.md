# Sprite States / Animation editor — progress tracker

Internal tracking artifact for this effort (same tier as `MIGRATION_V2_AUDIT.md` — not part of
the public `docs/` site). Exists specifically so this multi-session effort doesn't repeat the
Path A/B failure mode of context drifting across sessions with nothing durable to re-anchor on.
See `[[snes-sprite-animation-ui-reverted]]` (Claude memory) for the full history of the two
prior, fully-reverted attempts this one deliberately does not resume or reference for design.

## Scoping decision (read this before changing anything here)

This is an **authoring-only** port of GB Studio's Sprites page — not the full free-form
metasprite editor GB Studio itself has. The user was asked directly (`AskUserQuestion`) how to
scope the effort after research showed GB Studio's real metasprite model (arbitrary per-frame
OAM tile lists, `metasprite_t{dy,dx,tile,attr}`) is fundamentally incompatible with this
engine's current rendering (`SceneRenderActors`/`actor_render_tile` in `appData/src/snes/src/
scene.c`: exactly one `oamSet` per actor per frame, from one of 8 hard-coded, already-full
256-tile OBJ regions — no "loop over N tiles" exists in the render path, and no spare VRAM).
They chose **"Authoring-only port now"**: real GB Studio data model/Redux/UI layout and field
order, but every frame's actual tile content stays bound to what this engine can already
render. The full free-form engine rewrite (new OAM tile-list format, multi-entry render loop,
new VRAM budget) is explicitly deferred, matching the standing v4 cadrage decision D3 in
`[[gbsnes-v4-gbstudio321-integration]]` ("defer the sprite/metasprite editor entirely").

Concretely, this means:
- Only 3 of GB Studio's 6 `animationType` values are ported — `fixed` → `SPRITE_STATIC`,
  `multi` → `SPRITE_ACTOR` (3-frame, side auto-mirrored), `multi_movement` →
  `SPRITE_ACTOR_ANIMATED` (6-frame, same mirroring). `fixed_movement`/`platform_player`/
  `cursor` are dropped — there is no Platformer/Point-and-Click genre on this top-down-only
  SNES fork, so they'd have zero backing.
- `Collision Bounding Box` (`boundsX/Y/Width/Height`) is real, stored editor data but **has no
  engine consumer** — actor collision here is tile-based (`can_step`/`npc_blocking`), not
  per-sprite-bounds. It is **not compiled into `assets.c`** (no dead bytes for a field nothing
  reads), kept purely as schema parity / a future hook, and must stay documented as inert
  wherever it's mentioned — never silently implied to affect collision.
- `Canvas Size` is fixed, read-only "16 × 16" info — not an editable field. Every frame on this
  engine is always exactly one 16×16 (2×2-tile) block.
- The left-sidebar "Animations/States" content is the **already-shipped-but-headless**
  `SpriteState` feature (whole-sheet swap, backing the "Set Sprite State" script events —
  `addSpriteState`/`editSpriteState`/`removeSpriteState` reducers already exist and work, with
  zero UI today) — not a new per-frame sub-range concept GB Studio has and this engine doesn't.

Full plan: `C:\Users\jeanm\.claude\plans\twinkly-petting-frost.md` (local to the machine that
planned this, not part of the repo).

## Milestones

- [x] **M0** — wireframe Artifact published, explicit user sign-off obtained
- [x] **M1** — data layer (`entitiesTypes.ts` `animationType`/`bounds*` fields, `editSpriteSheet`
      reducer re-added)
- [x] **M2** — compiler (`snesgfx.js` `imageToSpriteData` override param, `compileSnesData.js`
      wiring)
- [x] **M3** — UI components (left sprite/state list, center preview+playback, right inspector)
- [~] **M4** — verification: `yarn test` green (151 suites, 718 passed) and a real `npm start`
      renderer compile with no TS errors are **done**. Manually driving the new page in the
      running app, and a Mesen check that an `animationType` override changes the compiled
      ROM's rendered pose set, are **not done yet** - see note below.

**Real multi-tile metasprite support (research done 2026-10-11, see that section below for the
full writeup; a separate, larger effort from M0-M4's authoring-only scope - not started):**

- [x] **M5** — toolchain decision: user chose to port the algorithm into `snesgfx.js` rather than
      vendor the real `gfx4snes.exe` binary. `imageToMetaspriteData()` implemented and tested -
      see the dated log entry below. Deliberately **not** wired into `compileSnesData.js` or the
      engine yet (that's M6-M8) - this milestone was scoped to "only update the javascript part
      of our JS internal tool," per the user's own words.
- [x] **M6** — OAM budget investigated against the real code (not profiled live - the real
      numbers came straight from the static id formulas, no Mesen run needed this time; see the
      dated log entry below for the full table, a real pre-existing bug found, and the
      genuinely-new 32-sprites-per-scanline gap).
- [~] **M7** — (a) and (b) done, see the dated entry below for the full writeup and a real
      sequencing finding: (c) and (d) turned out to be genuinely data-dependent on M8 (there's no
      real per-slot cost data to size a scanline warning from, or a real multi-tile list to loop
      over, until M8 exists) - deferred to land together with M8 rather than built hollow now.
      (a) the real id-84 avatar/projectile collision is fixed. (b) a real per-actor OAM id base
      (`actor_oam_base[]`, a prefix sum over a new scaffolded `sprite_oam_ids_for_slot[8]`
      per-scene table, every entry compile-time 1 today) replaces the old incidental `i << 2`
      spacing in `SceneRenderActors`/the emote/projectile/avatar OID macros. Toolchain build +
      full test suite + a real Mesen run all verified now (see the dated entry below) -
      `actor_oam_base[0..3]` read back exactly `[0, 1, 2, 3]` on real hardware, proving the
      prefix-sum allocator. M7 is otherwise done; marked `[~]` only because (c)/(d) are
      deliberately deferred to M8, not because (a)/(b) are incomplete.
- [ ] **M8** — compiler wiring: shell out to `gfx4snes` or emit the equivalent table from a
      ported JS algorithm (depends on M5), ingested by `compileSnesData.js`.
- [ ] **M9** — editor-side real free-form placement UI (the actual click-to-place canvas,
      Path B's original goal) - get a wireframe sign-off first, same discipline as this
      effort's own M0, per `[[snes-sprite-animation-ui-reverted]]`'s own lesson.
- [ ] **M10** — migration plan: replace or keep the existing 3-frame/6-frame fixed-region actor
      convention alongside real metasprites - open question, not resolved yet.

Once M4 lands, link this file from `CLAUDE.md`'s own narrative (same way `EVENTS.md`/`PERF.md`
are linked) — not before, to avoid documenting an unfinished feature as shipped.

## Log

_(dated entries appended here after each milestone — real finding, real fix, real
verification, not a status platitude, matching this project's own `CLAUDE.md` narrative style)_

### 2026-10-10 — tracker created

Plan approved (`AskUserQuestion` → "Authoring-only port now"). Grounded in GB Studio 3.0.3's
real source, recovered from its packaged `app.asar`'s webpack sourcemap (`sourcesContent` embeds
every original file verbatim) and cross-checked against the real 3.2.1 source checkout at
`C:\svgexterne\vboxshared\DropboxSvnClient\snes\gb-studio-3.2.1` — both agree exactly on the data
model, Redux reducer shapes, UI component tree/layout order, and compiler output shape
(`metasprite_t`/`spritesheet_t`). This file created before any code, per the plan's own
first-step requirement. Next: M0 wireframe.

### 2026-10-10 — M0 done: wireframe signed off

Published a static HTML wireframe (Artifact) using the app's real `darkTheme.ts` colors,
showing the 3-column layout: left (Sprites list + States list), center (composed animation
preview + transport, then the full raw sprite sheet strip with filename/dimensions + an
"Edit…" button — same pattern as the Backgrounds page's `ImageViewer` — then a read-only
Frames strip at the bottom), right (Canvas Size fixed read-only, Collision Bounding Box marked
inert, Animation Type limited to the 3 real values, selected State name/target-sheet). Two
rounds of user-directed layout changes before sign-off: moved the Frames strip from the left
sidebar to directly under the center preview, then added the full-sheet-plus-Edit-button panel
between the preview and the Frames strip. Approved as-is ("ok, go now"). Next: M1 data layer.

### 2026-10-10 — M1 + M2 done: data layer and compiler wiring

**M1**: `entitiesTypes.ts` gained `SpriteAnimationType = "fixed" | "multi" | "multi_movement"`
and 5 new optional `SpriteSheet` fields (`animationType`, `boundsX/Y/Width/Height`). Re-added a
generic `editSpriteSheet` reducer (`{spriteSheetId, changes}` -> `spriteSheetsAdapter.updateOne`)
in `entitiesState.ts`, registered in the "Sprite States" section right above the existing
`addSpriteState`/`editSpriteState`/`removeSpriteState` (unchanged) - deliberately written via
`updateOne` directly, not through `localSpriteSheetSelectors.selectById` then a mutation, per
`[[rtk-draftsafe-selector-mutation-bug]]`'s own lesson (a selector-returned value can be an
immer-frozen snapshot once this reducer runs after a real prior dispatch). Test added:
`entitiesState.test.ts` ("Should edit a sprite sheet's animationType override and bounds").

**M2**: `snesgfx.js`'s `imageToSpriteData` gained an `animationTypeOverride` option. "fixed"
always applies (re-labels an already-3/6-frame sheet's `spriteType` to `0`/`SPRITE_STATIC`
without changing `frameCount`). "multi"/"multi_movement" need >=3/>=6 real 16x16 frames in the
source image to apply; with fewer, they warn and fall back to the plain auto-detected result
(doesn't change how pixels are sliced - just picks which of the 3 already-existing
interpretations applies). `compileSnesData.js`'s one `imageToSpriteData` call site now passes
`{ animationTypeOverride: sheet.animationType }`.

Real finding along the way, out of scope to fix here: `test/data/compiler/snesgfx.test.js`
doesn't exist anywhere in this repo's history past the `v2` M1 wholesale vendor import of GB
Studio 2.0.0-beta5 sources (confirmed via `git log -- <path>`) - the same "fresh vendor import
silently drops a fork-specific file" pattern `CLAUDE.md` already documents for
`updateChecker.js`, except this one was never caught because `CLAUDE.md`'s own later narrative
kept citing "Tests: `snesgfx.test.js`" for post-v2 fixes without anyone noticing the file was
gone. Re-created the file fresh with just this milestone's own 4 new override tests (auto-detect
unchanged; "fixed" re-labels a 6-frame sheet; "multi" picks 3 of 6 frames; "multi_movement"
warns-and-falls-back on too few frames) - restoring the rest of its historical coverage (colour-
limit warnings, round-trip, etc.) is a separate cleanup, not attempted here. Full `yarn jest
snesgfx compileSnesData entitiesState` green (4 + 37 + 54 tests). Next: M3 UI components.

### 2026-10-10 — M3 done, M4 partially done

**M3**: built the full new Sprites page under `src/components/sprites/` (didn't exist on disk
before this - confirmed safe to create fresh):
- `SpriteNavigator.tsx` - left sidebar, two stacked resizable panes (`useSplitPane`, the same
  hook GB Studio 3.0.3's own `NavigatorSprites.tsx` uses) - a plain Sprites list, and a States
  list with a "+" add button + per-row remove, backed entirely by the already-shipped
  `addSpriteState`/`removeSpriteState` reducers from M1/earlier.
- `SpritePreview.tsx` - composed-animation preview (`SpriteSheetCanvas`, reused as-is) with
  Play/Pause/Step transport, frame range derived from the existing `framesPerDirection()` helper
  in `gbstudio.js`. Deliberately always shows the sheet's real auto-detected rendering, not an
  `animationType`-override preview - noted inline and in the inspector's own field note, to
  avoid a shared, widely-reused component silently gaining a second, override-aware contract.
- `SpriteSheetPanel.tsx` - the full raw sheet PNG + filename/frame-count + an "Edit..." button,
  same `electronActions.openFile` mechanism `ImageViewer.js` already uses for Backgrounds.
- `SpriteFramesStrip.tsx` - read-only raw-frame breakdown via `SpriteSheetCanvas`'s own
  `rawFrame` prop (its worker's comment already named this exact use case: "used by the sprite
  editor's Animations/Frames panel to show/curate a project's own chosen frames").
- `SpriteInspector.tsx` - right sidebar, field order copied exactly from the real decoded GB
  Studio 3.0.3 `SpriteEditor.tsx` (name -> Canvas Size -> divider -> Collision Bounding Box ->
  Animation Settings -> Animation Type -> selected state), using this fork's own `FormField`
  `info` prop for the inert/fixed/overrides-auto-detect notes instead of hand-rolled styling.
- `AnimationTypeSelect.tsx` (`src/components/forms/`) - modeled directly on the existing
  `SpriteTypeSelect.tsx` pattern; includes an explicit 4th "Default (Auto-detect)" option so
  clearing the override is a real, visible choice, not implied by picking "Fixed".
- `SpritesPage.js` rewritten entirely (3-column layout, `useResizable` per side, matching
  `WorldPage.tsx`'s own established pattern) - replaces the old plain `ImageViewer`+
  `FilesSidebar` file browser.
- New l10n keys added to `en.json` only (not the other 13 locales - `l10n.js` falls back to
  `en` for missing keys, a deliberate scope trim given this is internal/authoring tooling, not
  re-checked against the fuller-coverage precedent elsewhere in this project's history).

Real correction caught while building this: `SpriteInspector.tsx` first assumed a separate
`spriteStateSelectors`/`spriteStatesAdapter` existed (matching real GB Studio 3.0.3's own
normalized `SpriteState` table, confirmed via the decoded 3.0.3 source) - this fork's own
`SpriteState` is actually an **embedded array** on `SpriteSheet.states`, not a normalized entity
table (confirmed by grep: no such adapter/selector exists in `entitiesState.ts`). Fixed by
deriving the selected state via `sprite.states.find(...)` directly instead.

**M4, done so far**: full `yarn test` (151 suites, 718 passed, 3 skipped - unchanged from
before M3) and a real `npm start` - the renderer bundle was fetched directly
(`curl http://localhost:3000/main_window/index.js`, HTTP 200, 7.7MB, 0 matches for
`error TS`/`Module build failed`) while the dev server was up, confirming the new `.tsx` files
type-check cleanly under this project's real `fork-ts-checker` config, not just a syntax parse.

**M4, not done yet - flagged, not silently skipped**: actually clicking through the new Sprites
page in a running window (select a sprite, add/rename/remove a state, edit bounds/animation
type, confirm the preview/frames strip render) has **not** been done this session - this is
exactly the check `[[snes-sprite-animation-ui-reverted]]`'s own lesson says matters most
("tests passing is necessary but not sufficient for a UI-layout task"), and this session has no
GUI-automation driver set up for this app (no project skill for it, and building one - e.g. a
Playwright `_electron` driver - was judged non-trivial enough on Windows to flag rather than
rush). Also not done: a real toolchain + Mesen pass confirming an `animationType` override
actually changes the compiled ROM's rendered OAM tiles for a real sprite sheet - the override's
*compiler-level* correctness (right `spriteType`/`frameCount` chosen) is already covered by
M2's unit tests, and the full suite's toolchain-gated `buildSnesRom.test.js` already confirms
the engine still compiles/links with these changes present, but neither of those is the same as
watching the actual rendered sprite change in Mesen.

### 2026-10-11 — user-found bug: States pane invisible, Sprites list partially broken

User tested the real running app (closing the M4 gap above) and reported: layout matched the
approved wireframe, but the left Sprites list "does not refresh all the list, only a few part"
and the States pane below it "is no more displayed" at all.

Root cause, found by re-reading `SpriteNavigator.tsx` and `use-split-pane.ts` together:
`useState([Math.floor(height * 0.55), 0])` initialized the States pane's size to **0** -
`useSplitPane`'s own reset effect treats any size `<= collapsedSize` (30) as already collapsed
and never redistributes space back to it, so it stayed invisible permanently, by design of that
shared hook. Compounding it: `height` itself is `-38` on the very first render (`useWindowSize`
intentionally starts at `undefined` width/height to avoid SSR-style rehydration mismatches, per
its own comment), so the Sprites pane's *own* initial size came out **negative**
(`Math.floor(-38 * 0.55)`) - and because both sizes started at/under the collapse threshold,
the hook's reset effect could never recover either of them once the real window height arrived
(its own div-by-zero guard, written for a different purpose, left both permanently stuck).

Fixed by not deriving the initial sizes from `height` at all - `useState([300, 200])`, matching
how GB Studio 3.0.3's own `NavigatorSprites.tsx` initializes the identical hook (fixed starting
pixel sizes, not a fraction of a prop that may not be measured yet). Both values are safely
above the collapse threshold, so the reset effect's proportional rescale actually runs once the
real height is known, instead of getting stuck. No test added - this is a pure sizing/lifecycle
bug in a hook usage, not a logic branch a unit test would naturally cover; verified by the user
directly in the running app after the fix.

### 2026-10-11 — researched GB Studio 3.x's real "add a frame" mechanism, before building one

User asked, after testing: "how can I add a frame in FRAMES part, i don't have a + button" (a
new explosion animation on an actor sheet in the `snesgbs2` template). Per the M0 scoping
decision, the Frames strip here is deliberately **read-only** - there's no `+` button because
this engine ties frame count directly to the source PNG's pixel width (`imageToSpriteData`'s
`sheetFrames = floor(imageWidth / 16)`), not to any independently-stored, composable list.
Explained the real workaround (widen the PNG by 16px in the external editor via the existing
"Edit..." button, draw the new frame, save). User then asked, before any "+" button gets built,
to document how GB Studio 3.x itself actually does this - re-grounding in the real decoded
3.0.3 source (`entitiesState.ts`, `SpriteAnimationTimeline.tsx`) rather than assuming.

**GB Studio 3.x's real mechanism - completely decoupled from the source PNG:**
- A "frame" there is a `Metasprite` entity: just `{id, tiles: string[]}` - an ordered list of
  `MetaspriteTile` ids, each a `{x, y, sliceX, sliceY, flipX, flipY, objPalette, paletteIndex,
  priority}` record referencing a tile *slice* of the source sheet, placed at an arbitrary
  canvas offset. The source PNG is only ever a fixed tile *palette* to pick slices from - it is
  read once at import and never resized or rewritten by the editor.
- The real "+" button lives in `SpriteAnimationTimeline.tsx`, at the end of the frame strip.
  It dispatches one of two `entitiesState.ts` reducers depending on whether Alt is held:
  - **`addMetasprite`** (plain click, `PlusIcon`) - `prepare` mints a fresh
    `metaspriteId: uuid()`; the reducer creates a brand new, **empty** `Metasprite` (`tiles: []`)
    and appends its id to the current `SpriteAnimation.frames` array. The new frame starts
    completely blank - zero tiles, an empty canvas.
  - **`cloneMetasprite`** (Alt-held, `CloneIcon`) - `prepare` mints a fresh `newMetaspriteId`;
    the reducer deep-clones the *currently selected* frame's own tile list (fresh uuids per
    tile, same x/y/flip/palette/priority values) into a new `Metasprite`, and appends *that* id
    to `frames` instead - i.e. "duplicate this frame, then tweak it" (exactly what you'd want
    for an explosion's later frames, which are usually small variations on the first).
- Drawing into a newly-added frame is a **separate** step, done afterward in the Tiles panel
  (`SpriteTilePalette.tsx`): the user picks already-existing tile slices from the fixed source
  PNG and clicks/drags them onto the new, still-empty canvas to build up that frame's
  `MetaspriteTile` list. Nothing about adding a frame ever touches the PNG file itself.

**Why this fork can't do the same thing, and what it should do instead:** this engine has no
`Metasprite`/`MetaspriteTile` concept at all - a "frame" *is* a fixed 16x16 pixel column of the
sheet's own source file, period (confirmed again against `snesgfx.js`'s real
`imageToSpriteData`, M2). There is no intermediate tile-pool/composition layer to add an empty
slot into, because that whole layer is exactly the free-form-metasprite engine capability the
M0 `AskUserQuestion` scoping decision explicitly deferred (new OAM tile-list format, per-frame
compositing, extra VRAM). Replicating GB Studio's *exact* mechanism is therefore not available
without that deferred engine work.

The planned "+" button here is a **file-level analogue of the same end-user action**, not a
port of GB Studio's own reducers: append a new 16x16 column directly to the sheet's PNG (blank
on a plain click; a straight pixel-copy of the last existing frame's column on Alt-held, as the
closest honest equivalent to `cloneMetasprite`'s "duplicate, then tweak" UX) and immediately
open it in the external editor via the same `electronActions.openFile` mechanism
`SpriteSheetPanel.tsx` already uses, so the user lands straight on the new frame ready to draw.
`sprite.numFrames` updates automatically next time the file is rescanned/compiled - no new
Redux entity, no engine change, nothing to wire into `compileSnesData.js` at all. Noting this
explicitly so a future reader doesn't mistake the file-resize approach for a missed attempt at
porting `addMetasprite`/`cloneMetasprite` - it's a deliberate, scoped substitute, chosen because
this engine's real "frame" unit is a pixel column, not a composable entity.

## Investigated: PVSnesLib's real metasprite engine + gfx4snes (2026-10-11)

User asked, before building the "+" button above, to investigate PVSnesLib's own metasprite
engine and `gfx4snes` (the tool that auto-generates `t_metasprite` tables) and plan milestones
to actually bring real multi-tile metasprite support into GB2SNES Studio - revisiting the "Full
free-form engine rewrite" option the original `AskUserQuestion` deferred. **Nothing code-level
was touched for this - pure research, read a real local PVSnesLib + gfx4snes checkout
(`C:\svgexterne\vboxshared\DropboxSvnClient\snesdev\pvsneslib\pvsneslib` +
`...\snesdev\pvsneslib\tools\gfx4snes\src`), not assumed from memory or the GitHub link alone.**

### The real engine side (`pvsneslib/include/snes/sprite.h`, `pvsneslib/source/sprites.asm`)

```c
typedef struct {
    u16 dx, dy;     // delta X/Y relative to the metasprite's own origin (0,0)
    u16 dtile;      // start tile, relative to the metasprite's own tile pool
    u8 props;       // OBJ_PAL(n) | OBJ_PRIO(n) | OBJ_FLIPX | OBJ_FLIPY
    u8 unused;      // pad to 16-bit alignment
} t_metasprite;
#define metasprite_end -128              // sentinel checked against dx as a 16-bit value (0xFF80)
#define METASPR_TERM {metasprite_end}
```
Real differences from GBDK's own `metasprite_t` (the struct our Sprite Editor research already
decoded from GB Studio 3.0.3's compiler output): PVSnesLib's fields are `u16` not `s8`/`u8` -
needed since SNES OAM X/Y range and tile indices are wider than GB's - and there's a *second*,
separate struct, `t_metasprites` (plural - a "live instance" record: `metsprofsx/y`,
`metsprframeid`, `metsprattribute`, `metsprtype`, `metsprgraphics`), used by the more dynamic
`oamDynamicMetaDraw` family for a metasprite whose *composition itself* can vary per-instance
(mixing 8x8/16x16/32x32 sub-sprites) - we almost certainly only need the simpler, fixed-shape
family below, not this dynamic one.

Runtime: a whole family of `oamMetaDraw{8,16,32}` / `oamMetaDrawDyn{8,16,32}` functions
(`sprites.asm`), one id/size combination each. Traced `oamMetaDraw16` (the one matching our own
engine's existing 16x16 OBJ convention) in the real asm: it loops over the `sprmeta` array,
`cmp #$FF80` against each entry's `dx` (the sentinel), and for every non-terminator entry writes
one real `oambuffer` OAM slot (`oamx`/`oamy`/`oamframeid`/`oamattribute`), starting at the given
`id` and incrementing - i.e. **this directly replaces our own `SceneRenderActors`'s single
`oamSet`/`oamSetEx` call with a loop over N real OAM slots**, where N is however many non-blank
sub-tiles that frame actually has. **Real OAM-budget consequence, not optional to plan around**:
today every actor costs exactly 1 of the SNES's 128 OAM slots, a fixed, already-budgeted
constant throughout this engine's history (`PERF.md`, the per-scene 8-sprite-sheet pool, etc).
Under real metasprites that becomes **variable per actor** (as many slots as visible sub-tiles),
so adopting this needs an explicit OAM budget plan, not just a data-format change - especially
alongside this engine's existing emote/projectile/avatar OAM consumers and the CPU tightness
`PERF.md` already documents for even single-OAM-slot actors.

### `gfx4snes`'s real generation model (`tools/gfx4snes/src/metasprites.c`, `gfx4snes.c`)

Real CLI flags (`gfx4snes.c`'s argument table): `-T`/`--metasprite` (bool, requires `-s` tile
conversion to also be on), `-X`/`--meta-width` and `-Y`/`--meta-width` (**a real upstream typo**
- both the width and height flags share the literal long-name `"meta-width"` in gfx4snes's own
source; `-Y` is really the height), `-P`/`--meta-priority`, `-L`/`--meta-flip` (bitmask: 1=flipX
variant, 2=flipY variant, 4=flipX+Y variant).

Traced `metasprite_save()` (the real generator) line by line - the actual model is **a fixed-
size grid slice of an already-tile-converted sheet**, not free placement:
- The whole source image is treated as a grid of `metawidth`x`metaheight`-pixel metasprite
  blocks (e.g. 32x32), each subdivided into `blocksize`x`blocksize` (e.g. 16x16) real OBJ
  sub-tiles, scanned row-by-row.
- A sub-tile that's **fully transparent** (`tile_is_blank()` - every pixel is palette index 0)
  is silently skipped - no `METASPR_ITEM` emitted for it at all, a free, automatic space saving
  for a non-rectangular sprite (an L-shaped or round sprite doesn't pay for its empty corners).
- **Flip variants are generated for free, automatically, with zero extra art or tile cost**: the
  X/Y/XY-flip variants (`-L` bits) are built by re-emitting the *same* tile indices with mirrored
  offsets and `OBJ_FLIPX`/`OBJ_FLIPY` set in `props` - exactly the kind of "draw it once, mirror
  it for the opposite facing" optimization our own engine already does **by hand**, just for the
  single-pose 3-frame actor convention; gfx4snes generalizes the same idea to arbitrary
  multi-tile metasprites.
- **Real fidelity gap vs GB Studio's actual metasprite editor**: flip here is only ever
  *whole-metasprite* (mirror the entire block), generated once at tool-run time - there is no
  per-sub-tile independent flip the way GB Studio's own `MetaspriteTile.flipX/flipY` lets one
  tile inside a frame flip while its neighbours don't. And placement is a **mechanical grid
  scan**, not an authored, arbitrary x/y per tile - an artist still draws into fixed
  `blocksize`-aligned cells inside a fixed `metawidth`x`metaheight` box, they don't click-place
  a tile anywhere on an open canvas the way GB Studio's `MetaspriteEditor.tsx` works.
- Output: a plain **C** (not asm) `#include`-able file, `<sheet>_meta.inc` - one
  `const t_metasprite <name>_metasprite<i>[] = { METASPR_ITEM(dx,dy,tile,props), ...,
  METASPR_TERM };` per metasprite×flip-variant, plus one trailing
  `const t_metasprite* <name>_metasprites[N] = {...};` pointer table over all of them (unflipped
  variants first, then the enabled flip variants in X, Y, XY order). Simpler to adopt into our
  own pipeline than our current `.as`-asm-emission scheme (`compileSnesData.js`'s "graphic
  assets are 65816 source" bullet in `CLAUDE.md`) - this is 816-tcc-compilable C glued in via a
  plain `#include`, no `wla-65816`/label-matching step needed for the metasprite tables
  themselves (the underlying tile/palette data would still go through our existing asm scheme).

### Three-tier fidelity picture (not two)

| Tier | Placement model | Flip | Cost to reach from here |
|---|---|---|---|
| **Today** (this fork) | 1 fixed OAM entry/actor, picked from 8 hard-coded 256-tile regions | whole-sheet side-pose mirror only, hand-coded | - |
| **gfx4snes-adopted** | N OAM entries/actor, but still a fixed `metawidth`x`metaheight` grid of `blocksize` cells (bigger sprites, non-rectangular shapes via blank-skip) | whole-metasprite mirror, free (any variant) | moderate - real tool + engine loop already exist, see milestones below |
| **Real GB Studio parity** | arbitrary per-tile x/y, independent per-tile flip, true click-to-place | per-tile, independently authored | large - needs a from-scratch editor-side placement layer *on top of* either tier above; gfx4snes does not provide this by itself |

Adopting gfx4snes closes real distance (bigger-than-16x16 actors, non-rectangular sprites, free
mirrored variants, official PVSnesLib runtime support already written/optimized in asm) but
does **not** by itself deliver GB Studio's actual free-form editor experience - worth being
explicit about so a future session doesn't treat "adopt gfx4snes" and "match GB Studio exactly"
as the same milestone.

### Proposed milestones for a future session (not started, not approved yet - planning only)

- **M5 - toolchain decision**: adopt the real vendored `gfx4snes.exe` (shell out to it from
  `compileSnesData.js`/`buildSnesRom.js`, the same way `816-tcc`/`wla-65816`/`smconv` already
  are) vs. port its real, fairly small (~150-line) grid-slice + blank-skip + flip-variant
  algorithm into `snesgfx.js` directly, staying consistent with this project's existing "convert
  every asset ourselves in JS" architecture (and avoiding re-adding a tool this project's own
  toolchain-trim history deliberately removed as unused - see `CLAUDE.md`'s "devkitsnes/
  {bin,tools} is trimmed" entry). Needs an `AskUserQuestion` - real tradeoff, not a default.
- **M6 - OAM budget plan**: before touching the render loop, work out the real per-scene OAM
  budget under variable-cost actors (today's fixed "1 slot/actor" assumption breaks), reusing
  this project's own established profiling method (`PERF.md`'s Mesen tick-ratio approach) rather
  than guessing.
- **M7 - engine render loop**: rewrite `SceneRenderActors`/`actor_render_tile`
  (`appData/src/snes/src/scene.c`) to call the real `oamMetaDraw16`-family loop per actor
  instead of one `oamSet`/`oamSetEx`, consuming M6's budget plan. This is the piece Path B's own
  compiler had "nowhere to plug into" - it would finally exist here.
- **M8 - compiler wiring**: depending on M5's decision, either shell out to real `gfx4snes` per
  sprite sheet (ingesting its generated `_meta.inc`) or emit the equivalent table directly from a
  ported JS algorithm, matching this project's existing "generated 65816/C source, not a JS
  binary blob" convention. **Exact porting scope identified (2026-10-11), if M5 picks the JS
  route:**
  - **Port nearly verbatim** (~210 lines, genuinely new logic, no existing equivalent):
    `tools/gfx4snes/src/metasprites.c`'s `metasprite_save()` (the grid loop + 3 flip-variant
    passes + output table) and its `tile_is_blank()` helper. The bit-packing constants it reads
    tile index/palette from (`common.h`): `TILEIDX_MASK = 0x01FF` (bits 0-8, 9-bit tile index),
    `PALETTE_MASK = 0x1C00` / `PALETTE_OFS = 10` (bits 10-12) - close to but not identical to
    our own BG tilemap word layout (`tile | pal<<10 | prio<<13 | ...`, a 10-bit tile field) -
    use our own convention for the ported version rather than copying gfx4snes's literally,
    since we're not reading its binary output, only its algorithm.
  - **Do NOT need to port** `tiles_convertsnes()` (generic image -> raw tile-pixel-buffer
    slicing - we already do this via `get-pixels` + our own per-tile extraction), any of
    `images.c`/`loadbmp.c`/`lodepng.c` (PNG/BMP decoding - already have `get-pixels`/`pngjs`),
    `palettes.c` (palette reduction/rearrange - already have our own extraction in `snesgfx.js`),
    `gradients.c`/`lz77.c` (unrelated features), `incgener.c` (generic `.inc` writer - we'll
    match our own existing emission convention instead), or any of `gfx4snes.c`'s own CLI
    argument parsing (`arguments.c/h`, `cmdparser.c/h`).
  - **One real prerequisite still needed, likely already substantially written**: traced
    `metasprite_save()`'s actual input (`map_snes`, built by `maps.c`'s `map_convertsnes()`
    before `metasprite_save()` ever runs, confirmed via `gfx4snes.c`'s real call sequence) - it's
    a tile-deduped, packed-word tilemap covering the *whole* source image's `blocksize`-granularity
    grid (`tilevalue = (palette << PALETTE_OFS) | tileindex`, confirmed directly in `maps.c`).
    This is functionally the same shape as what our own `imageToBGData()` already builds for
    backgrounds ("tile dedup with H/V-flip matching, 16-bit tilemap", per its own description
    elsewhere in this project) - **not** what `imageToSpriteData`'s current fixed-quad
    extraction produces. So the real integration work for M8 is adapting/reusing
    `imageToBGData`-style tile-dedup logic against a metasprite's own source image, feeding the
    ported `metasprite_save()` equivalent - not writing a tile-dedup pass from scratch.
- **M9 - editor-side real placement UI**: the actual free-form click-to-place canvas (Path B's
  original, reverted goal) - the one piece gfx4snes genuinely does not provide. Only attempt
  this once M5-M8 give it a real engine target to compile into; per
  `[[snes-sprite-animation-ui-reverted]]`'s own lesson, get a wireframe sign-off (same discipline
  as this effort's own M0) before writing any canvas component code.
- **M10 - migration plan**: decide whether the existing 3-frame/6-frame fixed-region actor
  convention is replaced outright or kept running alongside real metasprites as a lighter-weight
  option for simple actors - an open question, not resolved by this research.

None of M5-M10 are started. This section exists so a future session can pick this up without
re-deriving the real engine/tool shapes from scratch.

### 2026-10-11 — M5 done: `imageToMetaspriteData()` ported into `snesgfx.js`

User confirmed the M5 decision (port to JS, don't vendor the real binary) and explicitly scoped
this pass to "only update the javascript part of our JS internal tool" - no `compileSnesData.js`
wiring, no engine change, matching M6-M8's own separate scope.

Added `imageToMetaspriteData(filename, options)` to `src/lib/compiler/snesgfx.js`, a from-scratch
JS port of `gfx4snes`'s real `metasprite_save()` (confirmed against the real local checkout, see
the research section above) - not a reimplementation from the struct docs alone. Real SNES OAM
attribute bits added (`OBJ_PAL`/`OBJ_PRIO`/`OBJ_FLIPX`/`OBJ_FLIPY`, matching PVSnesLib's own
`sprite.h` macros exactly: `n<<1`, `n<<4`, `0x40`, `0x80`).

Behaviour: takes `blockSize` (8/16/32 - the OBJ sub-sprite size), `metaWidth`/`metaHeight` (one
metasprite's pixel bounding box), `priority`, `paletteSlot`, and a `flip` bitmask (1/2/4 =
flipX/flipY/flipXY variants, matching gfx4snes's own `-L` flag). Returns `{tiles, tileBytes,
palette, paletteBytes, colorCount, metaCols, metaRows, metasprites, warnings}`, where
`metasprites` is an array (one per metasprite in the sheet) of `{base, flipX?, flipY?, flipXY?}`
- each a list of `{dx, dy, tile, props}` items, one per non-blank `blockSize` sub-sprite, `tile`
being a real index into the function's own deduped `tiles[]` array. No C/asm text emission and
no sentinel-terminated array convention (`METASPR_TERM`/-128) - that's purely an M8 (compiler
wiring) concern once this gets consumed by an actual code generator; the JS shape here is a
plain array, which already "terminates" itself.

Three deliberate departures from gfx4snes's own real implementation, each logged in the
function's own header comment too (not just here):
1. **Real 8x8 tile dedup, not disabled.** gfx4snes's own metasprite map-conversion pass runs
   with `isnoreduction=1` (confirmed directly in `gfx4snes.c`'s real call site) - a simplicity
   trade-off specific to how its OWN separate tile-save pass re-derives VRAM layout afterward.
   This function controls its own tile array end-to-end, so it dedupes properly (exact match) -
   a real tile-budget improvement gfx4snes's simplified path doesn't bother with.
2. **No flip-folding in the dedup itself** (unlike `imageToBGData`'s own `dedupeFlips`) - combining
   a per-tile dedup-flip with a whole-metasprite mirror variant would need correctly XOR-ing both
   flip bits per tile; real but non-trivial, deferred. A metasprite's mirrored variant flips the
   *whole panel* via `OBJ_FLIPX`/`OBJ_FLIPY` on each item's existing tile index, exactly matching
   gfx4snes's own real behaviour (it never re-derives tile content for a flip variant either).
3. **`dtile` indexes this function's own `tiles[]`**, not gfx4snes's internal blockSize-granularity
   map index (which only stays meaningful relative to a *separate*, differently-reconverted
   tile-save pass further down its own pipeline - a quirk of its implementation, not a real
   requirement of the `t_metasprite` format itself).

Also corrected a stale doc comment while reading the real source: PVSnesLib's own `t_metasprite`
struct comment says "flip x/y will be added later" - but `metasprite_save()`'s actual generator
code already sets `OBJ_FLIPX`/`OBJ_FLIPY` in `props` today. Noted in this function's own header
comment so a future reader trusts the real generator code over that stale struct doc.

One real, test-driving bug found and fixed along the way (in a test fixture, not the production
code): the "colour at pixel (0,0) becomes palette index 0 / transparent" convention every
converter in this file relies on breaks silently if a fixture's own painted content happens to
cover that exact corner pixel - the first test fixture painted a solid rect starting at (0,0),
so the sprite's own colour became index 0 instead of the intended background, making a fully
opaque sub-sprite register as "blank". Fixed by restructuring the fixture (a leading, genuinely
blank metasprite first, guaranteeing a real background pixel at the image's own origin) rather
than changing any production code - worth remembering for the next synthetic-PNG fixture in this
file.

Tests: `test/data/compiler/snesgfx.test.js`, new `describe("imageToMetaspriteData ...")` block -
basic non-blank case + dedup, blank-sub-sprite skipping + cross-position dedup, all 3 flip
variants' mirrored offsets and attribute bits, a 2x2 metasprite grid's per-metasprite-relative
offsets, and 2 validation-error cases (bad `blockSize`, non-multiple `metaWidth`/`blockSize`).
Full suite green (151 suites, 724 passed, 3 skipped - up from 718 before this milestone).

### 2026-10-11 — M6 done: real OAM budget investigated (not a profiling run - a code audit)

Dispatched an Explore agent to read every real `oamSet`/`oamSetEx` call site, `gbs_types.h`,
`targets/snes.js`, and `PERF.md` directly - no Mesen run needed this time, the real answer was
sitting in static id formulas, not runtime behaviour.

**Real current OAM usage - 25 of 128 hardware ids (~20%), 103 free:**

| Consumer | OAM id formula | Slots | Fixed/variable | Worst case |
|---|---|---|---|---|
| Actors incl. player (`actors[0..19]`) | `scene.c`: `oid = i << 2` | 1/actor | `MAX_ACTORS`=20 (compile-time) | 20 |
| Emote bubble | `EMOTE_OID = MAX_ACTORS<<2` = 80 | 1 | fixed | 1 |
| Projectiles | `PROJECTILE_OID_BASE = (MAX_ACTORS+1)<<2` = 84, +4/+8/+12 | 1 each | `MAX_PROJECTILES`=4 | 4 |
| Dialogue avatar | `AVATAR_OID = (MAX_ACTORS+1)<<2` = **84** | 1 | fixed | 1 |
| Menu/choice cursor | n/a - a BG tilemap glyph, not an OAM sprite at all | 0 | - | 0 |

`maxActors: 19` in `targets/snes.js` (editor-authored cap) + the player (`actors[0]`, no separate
reserved id) = `MAX_ACTORS` 20, confirmed against `gbs_types.h`'s real array size.

**Real pre-existing bug found, unrelated to metasprites, not yet fixed:** `AVATAR_OID` and
`PROJECTILE_OID_BASE` are the *literal same macro expression* - both `(MAX_ACTORS+1)<<2` = 84.
The dialogue avatar and projectile pool slot 0 silently share one hardware OAM id; `game.c`'s
main loop runs `SceneUpdate()` (writes projectile slot 0 if live) then `UIUpdate()` (writes the
avatar) every frame, so a live projectile and a shown avatar on the same frame fight over id 84.
Narrow trigger (a Shmup/Platform-genre project with projectiles active while a dialogue box with
an avatar is also open) - flagging it here rather than fixing it now, since it's a real but
separate bug from this effort's own scope; your call whether to fix it now or roll it into M7's
id-scheme rework below (which would touch the same lines anyway).

**The allocation scheme is static and `<<2`-spaced, not a real reserved block per actor** - the
spacing is incidental (keeps emote/projectile bases on round numbers), not a deliberate
multi-slot reservation. M7 will need real per-actor id blocks (N ids reserved per actor slot) to
support more than 1 OAM entry per actor without collision - a genuine restructure, not just a
constant bump.

**Two documentation gaps confirmed, both real:** `PERF.md` has no OAM budget section at all
(VRAM/ROM/WRAM/CPU all got one; OAM never did) - the only place anyone had done this math before
was a code comment in `gbs_types.h`, and that comment's own total was off by one (double-counted
id 84). And the SNES's separate **32-sprites-per-scanline** hardware limit has *zero* mentions
anywhere in this codebase's docs or comments - only the 128-total budget has ever been
discussed, informally, in that one comment.

**Bottom line / recommendation for M7:** the 128-total budget is not the binding constraint -
even a flat 4x per-actor cost (20 actors x 4 = 80, +6 for the other consumers = 86) comfortably
fits. The real risks M7 needs to design around are (a) the pre-existing id-84 collision above,
(b) the complete lack of any 32-per-scanline accounting - arguably the *sharper* constraint for
metasprites, since several multi-tile actors clustered at the same screen Y (common in a
top-down scene, e.g. a line of enemies) could hit that ceiling well before the 128-total one
ever would, and (c) replacing the flat `<<2`-incidental id scheme with real per-actor reserved
blocks. None of this is fixed or implemented yet - M6 was investigation only, per the plan.

### 2026-10-11 — M6 follow-up: user decisions + a real PVSnesLib reference example checked

User responded to all 3 M6 risks directly:
1. **id-84 collision** - fix it as part of M7 (touches the same lines as the id-scheme rework
   anyway, per the original recommendation). Folded into M7's scope below.
2. **32-sprites-per-scanline** - user asked directly whether this is just an immutable hardware
   fact we can't do anything about. **Correction, not a flat "yes"**: the limit itself (the PPU
   really will only draw 32 OBJs on a given scanline, full stop) can't be changed - that part is
   right. But this project has a long, consistent precedent of not leaving a hardware ceiling to
   fail silently: VRAM tile overflow, >16-colour sprite sheets, >6-sheet OBJ palette overflow,
   >3 parallax layers, >1024 BG tiles - every one of those gets a compile-time warning instead of
   silent corruption. The same pattern applies here: we can't raise the ceiling, but we *can* add
   a warning that estimates a scene's worst-case same-scanline OAM count and flags it before the
   author ships a scene that silently drops sprites on real hardware. Proposed as part of M7's
   scope (not a separate milestone - the same code that assigns OAM id blocks per actor is the
   natural place to also sum worst-case per-scanline counts).
3. **No library-level id allocator** - user pointed at a real PVSnesLib example to check before
   designing M7: `snesdev/pvsneslib/snes-examples/graphics/Sprites/DynamicEngineMetaSprite/`.
   Read the real `.c` source and a real generated `_meta.inc` directly (not just the header
   docs). Confirms the exact thing user flagged: `oamMetaDrawDyn16(id, x, y, sprmeta, gfxptr,
   sprsize)` takes the starting OAM id as its *first* parameter, and **PVSnesLib itself provides
   no allocation/bookkeeping for it at all** - the example's own `main()` just hardcodes `id=1`
   for the first dynamic sprite and `id=10` for the second, with a hand-written comment
   explaining why: "1st one will be at index 1 and second one at index 10 (as metasprites burn
   some intermediate indexes too)" - a human manually counted how many OAM ids the first
   sprite's metasprite could need and left that much of a gap by hand. There's no
   `oamAllocateMetaspriteIds()` or similar anywhere in the library.
   The real generated `spritehero16_meta.inc` in that same example folder (a genuine gfx4snes
   output, useful as a cross-check against this effort's own `imageToMetaspriteData`'s shape)
   shows a 2x3-block (32x48px) hero sprite burning **6** real `METASPR_ITEM` entries per frame -
   confirms per-actor OAM cost can be well above the 1-4 range casually assumed earlier, and that
   a flat reserved-ids-per-actor constant would be the wrong design; **reservation size must be
   driven by each actor's own compiled sheet's real max sub-sprite count** (available directly
   from `imageToMetaspriteData`'s own `metasprites[i].base.length`, already computed in M5),
   not a guessed constant.
   **Confirmed conclusion for M7**: this engine has to build its own real OAM id-block allocator
   - PVSnesLib gives us the primitive (`oamMetaDraw16`/`Dyn16` etc.) but explicitly expects the
   calling program to manage id ranges itself, exactly as the real example does by hand.

M7 (not started) is now scoped to: (a) fix the id-84 collision, (b) a real per-actor OAM id-block
allocator sized from each actor's own compiled max-sub-sprite-count, (c) a worst-case
same-scanline warning using that same per-actor sizing data, (d) the actual `SceneRenderActors`
render-loop rewrite to call the real `oamMetaDraw16`-family function per actor.

### 2026-10-11 — M7 (a)+(b) done; (c)+(d) resequenced to land with M8

**A real sequencing problem found before writing any code**: (c) (the scanline warning) and (d)
(the actual `oamMetaDraw16` render loop) both need per-actor data that doesn't exist yet - M8
hasn't shipped, so no sheet has a real multi-tile sub-sprite count to size a warning from or a
real `t_metasprite` list to loop over. Building either now would mean writing code against fake
placeholder data with no way to verify it does the right thing once real data shows up - so (c)
and (d) are resequenced to land together with M8, not dropped. What's genuinely buildable and
verifiable *now*, independent of M8, turned out to be narrower than the plan assumed: (a) and
(b) only.

**(a) - the id-84 collision, fixed for real.** Confirmed directly in the source (not just the
M6 agent's report): `scene.c`'s `PROJECTILE_OID_BASE` and `ui.c`'s `AVATAR_OID` were the
*literal same macro expression*, `(u16)(MAX_ACTORS + 1) << 2`. Both are now derived from one
shared, tight numbering instead of two independently hand-picked constants that happened to
collide.

**(b) - a real per-actor OAM id base, replacing the incidental `i << 2` spacing.** New
scaffolded per-scene table `sprite_oam_ids_for_slot[8]` (mirrors the existing
`sprite_type_for_slot`/`sprite_frames_for_slot`/`sprite_pal_for_slot` pattern exactly - same
file, same loop, same "SceneInit DMAs it fresh every scene load" convention), grown onto the
end of the scene blob's per-scene sprite-slot table (**[24] -> [32]** bytes - the same kind of
scene-blob-growth this project has done several times before, e.g. the M6 parallax table
addition). `compileSnesData.js` emits `1` for every slot today - nothing calls
`imageToMetaspriteData` yet (M8), so there's no real per-slot cost to emit - but `scene.c`
already reads it for real. `SceneInit` computes `actor_oam_base[MAX_ACTORS]` via a prefix sum
over this table (keyed by `actors[i].frame_offset >> 1`, the same per-actor sprite-slot lookup
`sprite_pal_for_slot[]` already uses) right after the actor-init loops. `SceneRenderActors`
now uses `actor_oam_base[i]` instead of `(u16)i << 2`. `EMOTE_OID`/`PROJECTILE_OID_BASE`/
`AVATAR_OID` became tight constants (`MAX_ACTORS`, `MAX_ACTORS+1`, `MAX_ACTORS+1+
MAX_PROJECTILES`) instead of `<<2`-spaced ones - correct today because every
`sprite_oam_ids_for_slot[]` entry is 1, so `actor_oam_base[i] == i` exactly; a comment at each
of these three defines flags that **M8 must convert them to runtime values** (read off the real
`actor_oam_base[scene_num_actors]` total) the moment a real per-slot cost can exceed 1, since
they can no longer be compile-time constants once actor OAM cost actually varies. Also dropped
the same incidental `<<2` spacing from the projectile pool's own id spacing (each projectile is
still exactly 1 OAM entry, so `PROJECTILE_OID_BASE + i`, not `+ (i << 2)`) and from the
unused-actor-slot hide loop in `SceneInit` (now plain `oamSetVisible(i, OBJ_HIDE)`) - a comment
there flags that this specific loop will need to hide up through a real worst-case high-water
mark, not just `MAX_ACTORS-1`, once per-actor cost can vary.

**Regenerated the committed dummy fixture** (`appData/src/snes/tools/gen-dummy-gfx.js` ->
`appData/src/snes/src/assets.c`) to match the new [32]-byte table shape (its own
`dummySprSlots` grew a 4th `[1,1,1,1,1,1,1,1]` sub-array) - this is the same committed-dummy-data
discipline every prior scene-blob-growth in this project's history has followed.

**Updated every byte-offset assertion in `compileSnesData.test.js`** that the +8 byte shift
touched (6 call sites: the main scene-blob-header test, the collision-bitmap test, the
actor-entry-offset test, and 3 parallax-table tests) - same "shift every downstream offset"
discipline the M6 parallax addition documented doing (that one needed 4 fixes; this one needed
6, all mechanical, all the same `+8`).

**Verified**: full `yarn test` (151 suites, 724 passed, 3 skipped - unchanged counts, only
assertion values shifted) and a real toolchain build (`yarn jest buildSnesRom`, 816-tcc/
wla-65816/wlalink genuinely ran, not skipped) both green. **Not yet Mesen-verified** - this
touches the hardware OAM id of every visible sprite in the game (actors, player, emote,
projectiles, avatar), the highest-blast-radius class of change in this whole effort so far, and
a real on-hardware confirmation (actors/avatar/emotes still appear at the right position with no
new id collisions) is still worth doing before this ships in a tagged release - flagged
explicitly, not silently treated as done because the toolchain build succeeded.

### 2026-10-11 — M7 Mesen verification: the core fix proven, one unrelated gap found

Built a real ROM (cloned `test/projects/Test_Math`'s assets, 3 actors + a scene-init script
launching a projectile and showing a `TEXT_WITH_AVATAR` dialogue) and read real WRAM via Mesen,
same `game.sym`-address + `emu.memType.snesMemory` methodology this project always uses
(`[[mesen-snesmemory-addressing-correction]]`).

**The core result - `actor_oam_base[]`, proven correct on real hardware:**
```
actor_oam_base0=0  actor_oam_base1=1  actor_oam_base2=2  actor_oam_base3=3
```
Exactly the expected tight prefix sum (player + 3 actors, each costing the scaffolded default
of 1 OAM id) - not the old `0,4,8,12`. This is the highest-risk, most novel piece of M7 (a new
runtime computation replacing a hardcoded scheme), and it's correct on real hardware, not just
"the toolchain accepted it."

**The id-84 fix needed no further runtime proof.** Unlike the allocator, this part of M7 was a
pure constant-arithmetic change: the bug was that `PROJECTILE_OID_BASE` and `AVATAR_OID` were
the *literal identical expression*. They're now `MAX_ACTORS+1` (21) and
`MAX_ACTORS+1+MAX_PROJECTILES` (25) - different formulas that cannot evaluate to the same
value by construction. There's nothing a runtime check adds here that direct code inspection
didn't already settle.

**A real, separate, unexpected finding along the way - not part of M7, not yet root-caused.**
The fixture's `EVENT_LAUNCH_PROJECTILE` (fired once, directly from the *scene's own* init
script, `actorId` pointing at a real named actor) compiled to legitimate-looking bytecode
(confirmed by dumping the real compiled bytes - `LAUNCH_PROJECTILE`'s own opcode and all 5 args
present and sane) and the script pointer did advance past it (ended up blocked on the later
`TEXT` instruction, as designed) - but `projectiles[0].active` stayed `0` for the entire
400-frame window, never becoming `1`. Every prior real-project verification of
`LAUNCH_PROJECTILE` in this codebase's history fired it from an **actor's own** script
(`updateScript`/`startScript`), never a bare scene-level script with an explicit `actorId` - so
this may be a real, narrow gap specific to that combination, or may be this particular
fixture's own authoring mistake (the kind this project's history has hit before - e.g. the
variable-index-ordering and union-value-shape mistakes documented in
`[[snes-move-usecollisions-noclip-bug]]`). Not investigated further - it's unrelated to the OAM
id-scheme fix M7 is actually about, and chasing it further risked turning an OAM-id
verification pass into a whole separate investigation. Noting it here rather than silently
dropping it, in case a future session hits the same symptom from a real project.

Temporary files used for this (`test/data/compiler/_m7mesenBuild.test.js`,
`_m7mesenInspect.test.js`) deleted after use, per this project's established convention.

### 2026-10-11 — M8 blocker resolved before writing any compiler code: a free second OBJ bank

Before touching `compileSnesData.js`, a real architectural question needed answering: this
engine's OBJ VRAM sheet is already documented as **full** (256/256 tiles, the 8 fixed regions
in `scene.h`'s own "Fixed VRAM layout" comment). A real metasprite actor (the real PVSnesLib
`DynamicEngineMetaSprite` example's own "spritehero16" needs **6** real tile-sized sub-sprites
per frame, per the M6 research) needs far more tiles than the existing budget has room for -
so where would metasprite tile data actually live?

**Confirmed empirically, not guessed - a real, already-configured, currently-unused second
256-tile OBJ bank exists today:**
- Read Mesen's `emu.getState()` PPU fields (`ppu.oamBaseAddress`, `ppu.oamAddressOffset`) against
  the real, known-working PVSnesLib `DynamicEngineMetaSprite.sfc` example (which genuinely uses
  tile indices past 255 for its big sprites): `oamBaseAddress=0`, `oamAddressOffset=4096`
  (words). The SNES OBJ tile index is 9 bits (0-511) across two 256-tile hardware "tables" -
  table 0 at `oamBaseAddress`, table 1 at `oamBaseAddress + oamAddressOffset`. `4096` words =
  `0x1000` - meaning table 1 sits at VRAM word `0x1000`.
- **Cross-checked against our own engine's real build** (not just the example): identical
  values, `oamBaseAddress=0`, `oamAddressOffset=4096`. This isn't example-specific - it's
  PVSnesLib's own `oamInitGfxAttr`/`oamInitGfxSet` library-internal default (the exposed C API
  only takes `address`/`oamsize`, no gap parameter at all - confirmed by reading the real
  vendored asm, `source/sprites.asm`'s `oamInitGfxAttr`: `REG_OBSEL = oamsize | (address >> 13)`,
  no separate gap term to override).
- This means **VRAM word `0x1000-0x1FFF` - exactly the gap this project's own fixed VRAM layout
  already leaves completely unused between `OBJ_GFX_VRAM` (`0x0000-0x0FFF`) and `BG1_GFX_VRAM`
  (starts at `0x2000`) - is a second, real, already-addressable 256-tile OBJ bank**, reachable
  today via OAM tile indices 256-511 (the attribute byte's tile-upper-bit), with **zero OBSEL
  register reconfiguration needed** - it's already configured, just never used.

**What this means for M8's design**: the OBJ tile budget for real metasprites doesn't need any
new VRAM-layout engineering or a risky change to the existing fixed-region actors' own budget -
it can simply get its own dedicated 256-tile allocation at `0x1000-0x1FFF`, DMA'd by `SceneInit`
alongside (not instead of) the existing `0x0000-0x0FFF` upload. This doubles the real total OBJ
tile budget (256 -> 512) using hardware capability that was already configured and sitting idle.

This was the one real unresolved blocker standing between M7 and actually writing M8's compiler
code - resolved now. **Paused here, as asked**: no `compileSnesData.js` changes have been made
yet. M8's real remaining design questions (not yet decided): which sprite sheets opt into the
real-metasprite path vs. the existing fixed-region model (a size-based auto-detect, mirroring
how `imageToSpriteData` already infers type from frame count? or an explicit author choice?),
how a scene's metasprite-using actors share the one 256-tile second bank across however many
distinct big sprites a scene has (the existing per-scene palette/tile-sharing logic in
`buildSceneSprites` is the closest precedent to adapt), and how this interacts with the
already-shipped M0-M6 "Animation Type" authoring UI (same sheet, two different compiled paths,
or deliberately separate concepts). Next step is a user decision on these before any code.
