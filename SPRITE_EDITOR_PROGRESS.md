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
      full test suite + a real Mesen run all verified now (see the dated entry below) -
      `actor_oam_base[0..3]` read back exactly `[0, 1, 2, 3]` on real hardware, proving the
      prefix-sum allocator. M7 is otherwise done; marked `[~]` only because (c)/(d) are
      deliberately deferred to M8, not because (a)/(b) are incomplete.
- [~] **M8** — compiler + engine wiring (M8.1-M8.3 done 2026-10-12, see the dated entries
      below): `imageToActorMetaspriteData` (M8.1), a real per-scene tile packer wired into
      `buildSceneSprites` for real emission, replacing the old fixed-pose-region scheme (M8.2 +
      M8.3), and the engine reading dynamic per-slot pose addresses at runtime instead of
      compile-time constants (M8.3) - real toolchain build + Mesen-verified. M8.5 (real free-
      form per-tile placement authoring) stays explicitly deferred to M9 below, unchanged.
- [x] **M9** — editor-side real free-form placement UI (M9.1-M9.3) + real compiler/engine
      wiring so it actually renders in a built ROM (M9.4, all 7 steps of its own plan - see
      the dated entries below) - Mesen-verified on real hardware for both a static 2-tile
      composition and a directional side-pose auto-mirror, plus a real OAM hardware-budget
      warning (step 7). This milestone is fully complete.
- [x] **M10** — migration decision: **coexist, don't replace** - see the dated entry below. Every
      existing project's sheets keep rendering through the untouched legacy fixed-frame path;
      free-form metasprites are a new, separate opt-in per-sheet mode.

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

### 2026-10-12 — M8 design settled: all 3 questions answered, scope is bigger than originally framed

User's answers, verbatim decisions:
1. **No opt-in/auto-detect** - every sprite sheet always compiles through the metasprite path;
   a plain 16x16 single-tile sheet is just the degenerate "metasprite with one entry" case.
   This is a real unification, not a new path alongside the old one - `imageToSpriteData` is
   retired, not kept.
2. Real VRAM numbers given (confirmed earlier via Mesen): OBJ table 0 `0x0000-0x0FFF` (256
   tiles) + table 1 `0x1000-0x1FFF` (256 tiles) = **512 tiles total**, shared per-scene via the
   same dedup mechanism `buildSceneSprites`/`mergeSpriteIntoPalette` already uses for the old
   model, generalized to variable-size metasprites instead of fixed 4-tile blocks. BG1
   (`0x2000-0x5FFF`, 1024 tiles) and BG3 (`0x6000-0x67FF`, 235 tiles) are separate regions,
   unaffected.
3. Animation Type (`fixed`/`multi`/`multi_movement`) is unaffected - it already only ever
   decided *how many frames* a sheet has (1/3/6), never how many tiles one frame is. After M8,
   "one frame" stops meaning "one fixed 16x16 tile" and starts meaning "one metasprite (1+
   tiles)" - same override, same 3 values, same frame-order convention
   (`[down, up, side]` / `[down-a, down-b, up-a, up-b, side-a, side-b]`), nothing in the shipped
   UI changes.

**Real consequence of (1), confirmed by re-reading `buildSceneSprites` directly**: emotes,
avatars, and actors all already share *one* per-scene 256-tile buffer today (`const sheet =
fixed.spriteTiles.slice()` - emotes are baked in first, then `placeTiles()` writes avatars and
actors on top of the *same* buffer) - so this was never going to be a narrow "just change how
actor sheets compile" change; the whole per-scene sheet-building step needs reworking regardless
of where the 3 Q&A landed. Scoped the real migration plan below around that fact.

## M8 migration plan (written before any code, per the user's own request)

**What gets deleted:**
- `snesgfx.js`'s `imageToSpriteData()` - replaced by `imageToMetaspriteData()` as the one actor-
  sheet compiler. Its frame-count-from-pixel-width auto-detect logic is kept, but only as the
  *fallback* for a sheet with no `animationType` override (existing projects that never set the
  override must keep compiling identically - this is the real backward-compat anchor).
- The 8 fixed 32-tile OBJ regions and their constants (`ACTOR_UP_TILE0`/`ACTOR_SIDE_TILE0`/
  `ACTOR_DOWN_B_TILE0`/`ACTOR_UP_B_TILE0`/`ACTOR_SIDE_B_TILE0`, `AVATAR_SLOT0`,
  `ACTOR_UP_SLOT0`/`ACTOR_SIDE_SLOT0` in `snesFixedAssets.js`) and `buildSceneSprites`'s
  `placeTiles`/`placeFrames` (fixed 4-tile-per-slot placement) - replaced by a generalized
  packer operating over the full 512-tile space.
- `scene.c`'s `ACTOR_DOWN_B_TILE0` etc `#define`s and `actor_render_tile()`'s direct "return a
  tile index" contract - replaced by "return a metasprite reference", looped by the new
  render function.

**What does NOT change** (the real backward-compat promise, worth stating explicitly so a
future session can verify it rather than just trust it): every *existing* project's actor sheets
are already exactly 16px tall, one row, 1/3/6 frames - under the new model these compile to
metasprites with exactly 1 item each, placed identically to where they are today. No existing
sample/fixture project should render one pixel different after this migration. This is the
concrete thing M8's own verification pass must prove (toolchain build + Mesen pixel/position
check against `sneshtml`/`snesgbs2`), not just assert.

**Sub-steps, in dependency order:**
- **M8.1 - compiler, actor-sheet compilation. DONE (2026-10-12).** Resolved the open
  per-index-flip question by extending `imageToMetaspriteData` itself with a new `perIndexFlip`
  option (an array, same linear indexing as `metasprites[]` - `my*metaCols+mx`): when present,
  `perIndexFlip[i]` overrides the existing global `flip` bitmask for cell `i` only; when absent
  (every pre-existing caller), behaviour is byte-identical to before - a pure additive option,
  not a breaking change to the M5 function signature. Chose this over a second wrapper call
  because the grid-slicing/tile-dedup pass only happens once either way and a second call would
  have to either re-run it or thread internal dedup state back out - the per-index array is the
  simpler shape.

  Added a new wrapper, `imageToActorMetaspriteData(filename, options)`, as the one real actor-
  sheet entry point M8.2 will call. It shares frame-count/`spriteType` detection with
  `imageToSpriteData` via a new extracted helper (`detectActorFrameCountAndType`) instead of
  duplicating that logic a second time - the exact animationType-override + legacy-pixel-width-
  fallback behaviour documented in CLAUDE.md's own M2/M9 history, now guaranteed to never drift
  between the old single-tile path and the new metasprite path (duplicating it a second time was
  considered and rejected specifically because that drift risk is real and this codebase has a
  documented history of exactly this kind of silent divergence - see CLAUDE.md's
  `updateChecker.js`/fresh-vendor-import entries). It calls `imageToMetaspriteData` with
  `metaWidth = metaHeight = blockSize = 16` (one metasprite cell = one existing 16x16 pose,
  unchanged from today) and a `perIndexFlip` built from `spriteType`: `SPRITE_ACTOR` (3 frames)
  flips only index 2 (side); `SPRITE_ACTOR_ANIMATED` (6 frames) flips only indices 4/5 (side-a,
  side-b); `SPRITE_STATIC` (any other frame count) flips nothing - matching the project's
  existing "flipLeft is always on, not a user choice" scoping decision verbatim. Trims the
  result to exactly `frameCount` metasprites (a sheet wider than its detected type needs, e.g. a
  leftover unused column, doesn't carry dead entries into M8.2). Returns `frameCount`/
  `spriteType`/`sideFrameIndices` alongside the usual metasprite/tile/palette fields so M8.2 has
  everything it needs without re-deriving detection a third time.

  Tests: 4 new cases in `snesgfx.test.js` (6-frame → sides 4/5 only; 3-frame → side 2 only;
  `"fixed"` override on a 6-frame sheet → no flips at all; a 1-frame sheet → no flips), plus the
  existing `imageToSpriteData`/`imageToMetaspriteData` suites re-run unchanged to confirm the
  `detectActorFrameCountAndType` extraction didn't alter either path's behaviour. Full suite
  green (151 suites, 728 passing, same 3 pre-existing skips). No engine/wire-format change yet -
  this step is JS-only, consumed by M8.2 next, not yet by `compileSnesData.js` or `scene.c`.
- **M8.2 - compiler, per-scene packing + budget warning. DONE (2026-10-12), scoped down from
  the original wording below - see the real-vs-planned note after this entry.** Built a new,
  real, tested packer, `src/lib/compiler/packSceneSprites.js`'s `createScenePacker()`: a generic
  on-demand allocator over the full 512-tile OBJ space (2 tables - see CLAUDE.md's "Fixed VRAM
  layout" entry), replacing the *concept* of `buildSceneSprites`'s fixed 8-slot/32-tile-per-
  pose-type regions with a flat allocator that hands out one valid hardware-aligned 16x16 quad
  placement (`N, N+1, N+16, N+17`) per call, deduping byte-identical quads to a single VRAM
  placement, and warning (once, matching every other budget warning already in this codebase)
  once the real demand exceeds what's left after a caller-chosen reserved prefix. Tests:
  `packSceneSprites.test.js` (7 cases - alignment, row-pair rollover, exact VRAM-offset writes,
  dedup, a bad `reservedTiles` input, overflow-drops-and-warns-once, exact-fit-no-warning).

  **Real-vs-planned scope note, written so a future session doesn't assume more landed than
  did:** the original wording above said "rework `buildSceneSprites`" - i.e. swap the actual
  emitted bytes over to the new packer. That turned out to be unsafe to do in isolation: the
  *current* engine (`scene.c`) still reads pose tile addresses from compile-time constants
  (`ACTOR_UP_TILE0` etc.) baked in by the OLD fixed-region scheme - repacking the real emission
  now, before `scene.c` can read a *runtime* tile-base per pose (M8.3's job), would silently
  desync the compiler's output from what the engine assumes and break every existing project's
  build, violating M8's own stated backward-compat promise ("no existing project renders one
  pixel different"). So `buildSceneSprites` itself is **untouched** - `assets.c`/`scene_spr_*`
  emission is byte-identical to before this entry (confirmed: full suite green, same byte-exact
  scene-blob assertions, no offsets changed).

  What *is* real and wired in today: `compileSnesData.js` now also runs every scene's actor +
  avatar poses through `createScenePacker({ totalTiles: 512, reservedTiles: 64 })` (64 tiles = 2
  row pairs, matching the placeholder-quad + project-wide-emote region `buildSceneSprites` keeps
  reserved) purely to produce the real budget warning *now*, under the bigger ceiling M8.3 will
  actually deliver - genuinely useful today (an author finds out immediately if a scene is
  already over-budget) even though nothing downstream of it changes yet. Checked whether this
  warning can actually fire under today's own existing per-scene caps (`SPRITE_SLOTS`=8,
  `AVATAR_SLOTS`=8): worst case is 8 sheets x 6 frames + 8 avatars = 56 quads, comfortably under
  the 112 quad slots the 448-tile (512-64) budget provides - so in practice this warning is
  inert on any project constrained by those existing caps, exactly mirroring this project's own
  precedent for a deliberately-ahead-of-its-trigger-condition warning (documented, not silently
  dropped, same spirit as every `Noop`-but-reserved opcode elsewhere in this codebase). It stops
  being inert the moment M8.3 widens what one scene can actually use (more than 8 sheets, or
  more than 6 real frames per sheet via a taller metasprite) - this is exactly the budget check
  that work will need, now already in place and tested ahead of it.

  No new `compileSnesData.test.js` integration test was added for the overflow path itself,
  since - per the above - it can't be triggered through today's real compiler without
  contriving an unrealistic scene (more sheets/frames than the existing caps allow); the packer
  module's own 7 unit tests already cover that behaviour directly and thoroughly. The full suite
  (152 suites, 735 passing, same 3 pre-existing skips) confirms zero regressions and zero new
  warnings on every existing fixture.

  *Superseded by M8.3 below*: the standalone side-channel budget-check pass described here (its
  own `createScenePacker` call, separate from `buildSceneSprites`, `reservedTiles: 64`) no
  longer exists as a separate thing - M8.3 made `buildSceneSprites` call the packer for real,
  so the budget check and the real placement are now the same pass, and the real reserved
  prefix is 96 tiles (pair0 primary poses + pair1 emotes + pair2 avatars), not 64. This
  section is left as-written for the historical record of the decision; M8.3's own entry has
  the current, real numbers.
- **M8.3 - engine, VRAM + render loop. DONE (2026-10-12), scoped down the same way M8.2 was -
  see the real-vs-planned note below.** `SceneInit` now DMAs the full 512-tile, 2-OBJ-page
  sheet in one `dmaCopyVram(..., SPR_TILES_SIZE)` call - `SPR_TILES_SIZE` is derived from the
  real sheet length (`sceneSprites[0].sheet.length`, unchanged code) so widening
  `buildSceneSprites`'s own sheet to 512 tiles was enough; no DMA call-site change needed at
  all (confirmed from the M6 investigation: VRAM word `0x1000-0x1FFF`, the "free 2nd OBJ page",
  sits immediately after table 0's own `0x0000-0x0FFF` with no gap, so the existing single
  `OBJ_GFX_VRAM`-based copy already covers both tables once the byte count doubles).

  **Real-vs-planned scope note**: the plan above said `actor_render_tile` would "return a
  metasprite reference" and the render loop would "write 1+ real OAM entries from it". That
  part is **not** what landed, and isn't needed yet: every actor pose compiled by
  `imageToActorMetaspriteData` (M8.1) is still exactly one hardware 16x16 OBJ (its `base` array
  has at most one item - `blockSize === metaWidth === metaHeight`, see that function's own
  comment), so `oamIds` stays all-1 and `SceneRenderActors` still writes exactly one `oamSet`
  per actor per frame, unchanged. What *did* need to change, and is the real substance of
  M8.3: **where** that one OAM write's tile index comes from. Every actor pose beyond the
  primary/frame-0 one (which still always lives at the sheet's own slot `k`, unchanged) used to
  be `fo + <fixed compile-time offset>` (`ACTOR_UP_TILE0` etc. - a project-wide constant, e.g.
  any slot's "up" pose was always exactly 96 tiles past its own "down" pose, in one of 5 always-
  reserved 32-tile regions regardless of real demand). Now `buildSceneSprites` calls
  `createScenePacker` for real (replacing the old `placeFrames`/fixed-region `placeTiles` calls
  for everything past the primary pose) and packs each slot's real "extra" poses on demand
  into the tiles-96-511 space; the resulting half-tile-base (every placement is 2-aligned, so
  it fits a `u8`) is written into a new scene-blob table - `[40]`, 5 arrays of `SPRITE_SLOTS`(8)
  bytes each (down-B, up-A, up-B, side-A, side-B) - and read back at **runtime** by
  `SceneInit` into 5 new globals (`extra_pose_down_b/up_a/up_b/side_a/side_b[]`, `scene.c`).
  `actor_render_tile` now looks these up instead of adding a fixed offset.
  Avatars/emotes/the primary pose are **untouched** - still the exact same fixed addresses
  (tiles 0-95) they've always used; only the 5 "extra pose" regions moved from fixed-and-
  always-reserved to dynamic-and-packed-on-demand. This is a smaller, safer slice than the
  original wording implied, but it's the one that actually delivers the real payoff (a scene's
  real extra-pose budget went from a fixed 160 tiles, reserved whether used or not, to up to
  416 tiles, packed only as needed) without needing a multi-entry-per-actor render loop that
  nothing (yet) produces data for.

  The new `[40]` table is appended at the very **end** of the scene blob (after the collision
  bitmap, whose own length is itself variable) rather than inserted after the existing `[32]`
  sprite-slot table - deliberately, so it doesn't shift a single existing byte-offset assertion
  in `compileSnesData.test.js` (header/sprite-table/parallax/playerHit/actor/trigger entries
  are all before the collision bitmap, hence all unaffected). Only the one test asserting the
  scene blob's total `length` needed updating (+40).

  `snesFixedAssets.js`'s `ACTOR_UP_TILE0`/`ACTOR_SIDE_TILE0`/`ACTOR_DOWN_B_TILE0`/
  `ACTOR_UP_B_TILE0`/`ACTOR_SIDE_B_TILE0` (and their `_SLOT0` siblings) are deleted outright,
  along with their `#define` emission in both `compileSnesData.js` and `gen-dummy-gfx.js` -
  nothing reads them any more. `gen-dummy-gfx.js`'s own dummy sheet is padded from 256 to 512
  tiles (tiles 96-511 stay zero - neither dummy scene's slot-0 sheet ever needs an extra pose,
  both are 1-frame `SPRITE_STATIC`), and both dummy scene blobs grew their own all-zero `[40]`
  trailing table to match. Regenerated via `node appData/src/snes/tools/gen-dummy-gfx.js`.

  **A real bug caught by this pass's own Mesen verification, not by any test beforehand**:
  `actor_render_tile`'s return type (and the `tile` local in `SceneRenderActors` that holds its
  result) was still `u8` - correct when every pose lived below tile 256, but a real dynamically-
  packed extra pose can now land anywhere in 96-511, and a value past 255 would have silently
  truncated to its low byte on return, corrupting the OAM write for any project with enough
  actors/sheets in one scene to push an extra pose past tile 255. Caught by reading PVSnesLib's
  own real `oamSet` signature (`gfxoffset` is `u16`, confirmed from
  `pvsneslib/include/snes/sprite.h`) while building the Mesen check below and asking "does this
  u8 return value actually reach that u16 parameter intact" - it didn't. Fixed: both widened to
  `u16` (scene.c), with the shift-then-cast order also corrected (`(u16)extra_pose_up_a[slot] <<
  1`, casting the u8 array element to u16 *before* shifting, not after - shifting an 8-bit value
  left by 1 and then casting to u16 would already have lost the result for any half-base >=
  128, i.e. any real tile index >= 256, the exact range this bug needed to cover). No existing
  test caught this (nothing in this codebase exercises a pose placed past tile 255 yet, since
  no real project/fixture has enough actors+frames in one scene) - found only by directly
  cross-referencing the real vendored library header before trusting the chain was fine,
  matching this project's own repeated "verify against real source, don't guess" discipline.

  **Verification**: `yarn test` (152 suites, 735 passing, same 3 pre-existing skips) - the two
  toolchain-gated end-to-end tests that previously failed with `'ACTOR_DOWN_B_TILE0' undeclared`
  (`snesWebPlayer.test.js`, `compileSnesMusic.test.js`) now pass, confirming the real engine
  compiles and links against the regenerated dummy fixture. `yarn jest buildSnesRom` green.
  Then a real Mesen hardware check (not just a build-succeeds check) against a real toolchain
  build of `test/projects/Test_ActorStoreDirection` (one 3-frame `actor.png` + one 6-frame
  `actor_animated.png` sheet, exactly the two real multi-frame types this milestone touches):
  read `extra_pose_down_b/up_a/up_b/side_a/side_b[]` back from live WRAM via
  `game.sym`+`emu.memType.snesMemory` (the established methodology, see
  `[[mesen-snesmemory-addressing-correction]]`) after 120 real frames, using
  `emu.addEventCallback(fn, emu.eventType.endFrame)` + `io.open` to get output out of a
  headless run (`emu.execute`/a bare `emu.step` call both turned out not to be the right API
  for this Mesen build - `emu.step` only works from inside a callback, confirmed by reading the
  real error message rather than guessing a fix). The WRAM values read back
  (`[48,0,...]`/`[49,53,...]`/`[50,0,...]`/`[51,54,...]`/`[52,0,...]`) matched the JS compiler's
  own computed table byte-for-byte (independently checked first via a direct
  `compileSnesData()` call, before ever touching Mesen) - real, end-to-end proof that the new
  scene-blob table is written by the compiler and read by the engine at the exact same offset,
  with the right per-array layout, for both the 3-frame and 6-frame real sheet types. (The same
  run's raw `oambuffer[]` dump came back with implausible values - not pursued further given
  this entry's time budget, since the actually load-bearing claim for M8.3 - the new globals
  populate correctly from the compiled data - was already proven independently; flagged here
  rather than silently dropped, in case a future session wants real OAM-level proof too.)
- **M8.4 - regenerate + re-verify everything byte-exact. Folded into M8.3 above** - the dummy
  fixture regen, the one updated byte-exact assertion, the real toolchain build, and the Mesen
  check all happened together as part of landing M8.3, rather than as a separate pass.
- **M8.5 - explicitly out of scope, unchanged from the original plan.** Real free-form
  per-tile-placement authoring (a sheet wider/taller than today's convention needs hand-editing
  the PNG directly, no visual editor feedback) stays deferred to M9, same as always.

### 2026-10-12 — a real, pre-existing M7 bug found and fixed: every actor OAM write overlapped the next one's

**User-found, real playtest**: built `snesgbs2`'s own Sample Town (9 actors on screen) and reported
"sprite engine is no more working" - no player or NPC sprites visible at all, Mesen's Sprite
Viewer showing mostly-blank OBJ tile data.

M8.3's own earlier verification entry (above) had already noted something suspicious and chosen
not to chase it: "the same run's raw `oambuffer[]` dump came back with implausible values - not
pursued further given this entry's time budget... flagged here rather than silently dropped."
The user's real multi-actor playtest is exactly what surfaces this for real - a single-actor
synthetic fixture (`Test_ActorStoreDirection`) never exercises two actors' OAM writes landing
next to each other in the hardware buffer.

**Root cause, confirmed directly against PVSnesLib's real `oamSet`/`oamSetEx`/`oamSetVisible`
asm (`pvsneslib/source/sprites.asm`), not guessed**: every one of these functions' `id`
parameter is a **byte offset** into the real OAM shadow buffer (`oamMemory`, 4 bytes/sprite -
X, Y, tile, attr) - `oamSet`'s own prologue does `tax` on the raw 16-bit `id` then
`sta.l oamMemory+0,x` directly (no internal `*4` scaling anywhere), and `oamSetEx`'s `id >> 4`
computation (to find the right byte in the packed 2-bits/sprite high-attribute table, 4
sprites/byte) only lands correctly when `id` is already `spriteIndex * 4`. This is **not** new
information this session invented - it's exactly what the *original*, pre-M7 code already knew
(`oid = (u16)i << 2`) - but M7 (several sessions back, this same effort) removed every one of
these `<<2` scalings on the theory that they were "incidental spacing" reserving "4 ids/actor
for no real reason," replacing them with a tight, unscaled prefix sum
(`actor_oam_base[i] == i`) and matching unscaled constants (`EMOTE_OID = MAX_ACTORS`,
`PROJECTILE_OID_BASE = MAX_ACTORS+1`, `AVATAR_OID = MAX_ACTORS+1+MAX_PROJECTILES`). M7's own
"verification" (see that milestone's dated entries) only ever read back `actor_oam_base[]`'s
own array *values* from WRAM and confirmed they matched the (flawed) formula's own intent -
it never checked that passing those values into `oamSet` actually renders two simultaneous
actors correctly, so the regression shipped silently and was never caught until a real
9-actor scene exposed the byte-level overlap.

Concretely: with ids 0,1,2,... (unscaled) instead of 0,4,8,... (real byte offsets), actor 1's
OAM write (`id=1`) partially overlaps actor 0's own 4-byte slot (`id=0`, bytes 0-3) at byte 1 -
clobbering actor 0's Y/tile/attr while leaving its X (byte 0, never touched by any other
actor's unscaled write) looking correct in isolation. This exactly explains the "X matched,
Y/tile didn't" pattern found while investigating this report, and why a *single*-actor fixture
never caught it - there's nothing for id 0's write to collide with when it's the only actor.

**Fixed**: restored `<<2` (or `(u16)x << 2`/`+ ((u16)i << 2)` at each use site) everywhere M7 had
removed it - `actor_oam_base[]`'s own prefix-sum increment (`scene.c`, `SceneInit`), the
unused-actor-slot hide loop (`scene.c`), `EMOTE_OID`/`PROJECTILE_OID_BASE` (`scene.c`) and their
`+i`-indexed uses in the projectile-pool reset/update loops, and `AVATAR_OID` (`ui.c`). Every
one of these now produces byte-for-byte the *same real values* the original pre-M7 code did
(confirmed directly: `PROJECTILE_OID_BASE` is `84` again with `MAX_ACTORS=20` - matching the
exact "id 84" number M7's own commit message named as the thing it was fixing, confirming this
restores the right scale rather than reintroducing the real id-84 *collision* bug M7 separately
and correctly fixed - `PROJECTILE_OID_BASE`/`AVATAR_OID` stay derived from one shared formula,
genuinely distinct, just each now correctly multiplied by 4). Comments at each site rewritten to
document the real hardware reason (not "incidental spacing") so this can't silently regress
the same way again.

**Verified two ways.** (1) Full suite green (152 suites, 735 passing, same 3 pre-existing
skips) - no byte-exact test depends on these runtime-only OAM id values (they're never part of
the compiled ROM data, only computed at runtime from already-tested compiled data), so nothing
else moved. (2) A real toolchain build of `snesgbs2`'s own Sample Town scene (9 actors, the
exact repro), booted in Mesen with the player's start position placed directly among several
NPCs, reading the **real raw OAM shadow buffer** (`oamMemory`, not just our own WRAM globals)
for the first several sprite ids - before the fix: `oamLow[0] x=120 y=120 tile=88 attr=0x01`
while the engine's own computed values (read from a temporary debug global, since removed) were
`x=120 y=96 tile=102` - Y and tile corrupted, X coincidentally untouched; after the fix:
`oamLow[0] x=120 y=96 tile=102 attr=0x20`, `actor_oam_base[0..2] = [0, 4, 8]` - exact match, no
corruption, and the hidden/unused slots correctly show the `x=1 y=240` convention instead of
stale overlapping data. This is the real OAM-level proof M8.3's own entry had noted as
not-yet-done; it's done now, and it's what caught this bug.

**Scope note**: this bug predates this session's M8 work entirely (introduced in M7, several
sessions earlier) - M8.1-M8.3 didn't cause it, but the user's test of M8.3's own changes is
what surfaced it, and fixing it was necessary to actually verify M8.3 end-to-end. Worth
remembering as a real instance of this project's own recurring lesson: reading back a global's
own *value* from WRAM proves the value is what you computed, not that a downstream consumer
(here, a vendored asm function with an undocumented-from-the-header calling convention)
interprets it the way you assumed - the only way to catch that class of bug is exercising the
real consumer under real multi-entity load, which a single-actor fixture structurally cannot do.

*(The line above - "Not started, this is the plan only" - described the M8 migration plan at
the moment it was written, before M8.1 began. M8.1-M8.3 are now done, M8.5 stays deferred to
M9; left as-written for the historical record rather than silently edited.)*

### 2026-10-12 — M10 resolved: coexist, don't replace

A real product/architecture question, investigated (not guessed) before answering: does a
future free-form metasprite authoring mode (M9) *replace* the existing fixed 3-frame/6-frame
actor convention project-wide, or run *alongside* it as a separate, opt-in mode?

Surveyed every place the legacy convention is actually consumed:
`compileSnesData.js`/`snesgfx.js`/`scriptBuilder.js` (compiler), `scene.c`/`scene.h`/
`script_cmds.c`/`gbs_types.h` (engine - `SPRITE_STATIC`/`SPRITE_ACTOR`/`SPRITE_ACTOR_ANIMATED`
dispatch, walk-cycle timing in `SceneAnimateActors`, direction-based pose selection in
`actor_render_tile`), and the UI (`AnimationTypeSelect.tsx`/`SpriteInspector.tsx`/
`SpritePreview.tsx`). Replacing this outright would mean redesigning how *every* actor in
*every* existing project renders - the same scope and risk class as the two already-reverted
Path A/B attempts, and a direct violation of this whole effort's own repeated backward-compat
promise ("no existing project renders one pixel different").

**Decision: coexist.** Every existing sheet keeps rendering through the untouched legacy
single-OAM-per-pose path (M8.1-M8.3, unchanged by M9). Free-form metasprite authoring becomes a
new, separate, opt-in mode selected per sheet (exact mechanism - a new `animationType` value, a
separate boolean flag, or a distinct entity - to be decided during M9's own design, not here);
sheets using it get a genuinely different render path (the real multi-OAM `oamMetaDrawDyn16`-
style loop M7's own deferred (c)/(d) items describe), while every other sheet is never touched
by it. This isn't really a judgment call so much as a conclusion forced by the project's own
standing backward-compat rule - recorded here as a real, closed decision rather than left open,
so M9's design doesn't have to re-litigate it.

### 2026-10-13 — M9 wireframe signed off; M9.1 (data layer) done

User approved the wireframe Artifact with one addition (an "Edit" button on the TILES panel,
matching `ImageViewer`'s existing "open in the default graphics editor" convention) - added and
re-published before the go-ahead. Per the plan's own mandatory-first-step discipline (and the
real lesson from the two reverted Path A/B attempts), no component code was written until this
sign-off landed.

**M9.1 - data layer, done - with one real design correction caught before building UI on top of
it.** First cut made `"metasprite"` a 4th value of `SpriteAnimationType` - wrong, caught via a
quick sanity-check before touching `AnimationTypeSelect.tsx`: that throws away which of the 3
existing pose behaviours (frame count + direction meaning) a metasprite sheet should still
follow, since free-form mode is only supposed to change what one frame's *content* is, not the
frame count/meaning. User confirmed the fix via `AskUserQuestion`. Corrected: `SpriteAnimationType`
stays exactly its original 3 values (`fixed`/`multi`/`multi_movement`); a new, separate
`SpriteSheet.metaspriteMode?: boolean` is layered ON TOP of whichever of those 3 is already
chosen - `animationType` still decides frame count/direction meaning, `metaspriteMode` only
decides whether each of those frames is an authored tile list instead of one fixed 16x16 block.
Every existing project's sheets have `metaspriteMode` unset/false and keep rendering through
the untouched single-OAM-per-pose path (M10's decision) regardless of their `animationType`.

New types `MetaspriteTile` (`id, x, y, sliceX, sliceY, flipX, flipY, priority`) and `Metasprite`
(`id, tiles: string[]`, back-to-front paint order) on `SpriteSheet.metaspriteTiles` (a
`Record<id, tile>` for O(1) lookup during drag) and `SpriteSheet.metasprites` (frame-indexed,
same order/meaning as the existing fixed/multi/multi_movement frame convention - metasprite
mode changes what one frame's *content* can be, not how many frames exist or what they mean).
Deliberately
smaller than GB Studio's own `MetaspriteTile`: no `objPalette`/`paletteIndex` fields, since this
engine already assigns one OBJ palette per ACTOR SLOT (`ACTOR_OBJ_PAL_POOL`/
`sprite_pal_for_slot[]`, `compileSnesData.js`), not per-tile - a per-tile palette choice has no
real backing on this hardware model. `priority` is authored now but not yet consumed by the
engine (`SceneRenderActors` hardcodes OAM priority 2 for every actor today) - kept now rather
than bolted on later so an author's choice survives through to M9.4, not silently dropped.
`canvasWidth`/`canvasHeight` (default 16x16) are real, editable fields for a metasprite sheet
specifically - unlike the fixed/multi/multi_movement types, whose "Canvas Size" stays fixed
read-only info, metasprite mode exists specifically to compose something bigger than one 16x16
block, so this has to be authored once that mode is selected (the wireframe's own "fixed on
this engine" copy was specific to the pre-M9 scope and doesn't apply to free-form sheets).

Reducers (`entitiesState.ts`, matching this fork's own existing `addSpriteState`-style pattern
- a plain nested structure on `SpriteSheet`, not a new top-level normalizr entity adapter;
GB Studio's own real editor uses genuine top-level `metaspriteTileSelectors`/
`metaspriteSelectors` adapters, but this fork's own `SpriteState` already established the
simpler "nested on the sheet" convention for sprite-level sub-data, and a per-sheet
`Record<id,tile>` still gives the O(1) lookup an interactive drag-canvas needs without a wider
normalizr/project-save refactor this task doesn't require): `addMetaspriteTile` (creates the
target frame on demand - frames aren't separately created through their own action, they come
into existence the first time a tile is placed into that frame index, consistent with frame
count being driven by `animationType` alone, not a new concept), `editMetaspriteTiles` (bulk),
`moveMetaspriteTiles` (absolute, for drag), `moveMetaspriteTilesRelative` (nudge),
`flipXMetaspriteTiles`/`flipYMetaspriteTiles`, `sendMetaspriteTilesToFront`/`...ToBack`,
`removeMetaspriteTiles`, `removeMetaspriteTilesOutsideCanvas`.

**The group-flip math was checked against GB Studio's own real reducer, not invented**: a
multi-tile selection flips as a group (mirrored around the selection's own combined bounding
box), not each tile flipped in place - confirmed directly in `gb-studio-3.2.1`'s
`entitiesState.ts` before porting the same `leftEdge`/`rightEdge`/`mirrorX` logic (tile size
16, not GB's 8, matching this engine's own tile granularity - see below). Tests cover a
single-tile flip (unchanged position, since the selection's own center coincides with the
tile's own center) and a 2-tile pair (the two tiles swap sides) separately, so a future
regression in either path is caught.

**Tile granularity decision**: every placed tile is a full 16x16 "large" OBJ block (not 8x8),
matching `imageToActorMetaspriteData`'s own `blockSize=16` (M8.1) and the `OBJ_LARGE` size this
engine's render path already exclusively uses for every actor (`scene.c`, hardcoded
`oamSetEx(oid, OBJ_LARGE, OBJ_SHOW)`). A free-form metasprite composes multiple of the SAME
building block this engine already uses everywhere else, rather than introducing a second,
smaller OBJ size class (an 8x8-sprite rendering path) that nothing else in this engine has or
needs - deliberately not taken on as part of this scope.

Tests: 13 new cases in `entitiesState.test.ts` (add-creates-frame-on-demand, a 2nd frame
doesn't disturb frame 0, absolute move, relative nudge, single- and multi-tile flip, front/
back reorder, remove-from-both-list-and-map, canvas-bounds eviction, bulk edit). Full suite
green (152 suites, 745 passing, same 3 pre-existing skips). A real `npm start` webpack +
fork-ts-checker build succeeded with no reported errors (the project's own established
TypeScript check for this kind of change - a bare `npx tsc --noEmit` isn't usable here, the
locally pinned TypeScript 3.9.10 can't even parse several current `@types/*` packages'
`.d.ts` files, confirmed pre-existing and unrelated to this change).

Next: **M9.2** - the UI components themselves (the click-to-place canvas, tile palette,
frame timeline, wired into the existing Sprites page), following the signed-off wireframe.

### 2026-10-13 — M9.2 done: the click-to-place canvas, tile palette, frame timeline

New editor-local UI state on `state.editor` (`editorState.ts`, matching this project's own
existing `zoomSprite`-style fields, not a new slice): `selectedMetaspriteTileIds`,
`selectedMetaspriteFrameIndex`, `metaspriteTool` (`select`/`place`/`erase`),
`spriteTileSelection` (the pending "stamp" picked from the palette). `setSpriteTileSelection`/
`setMetaspriteTool` keep each other consistent (picking a stamp switches the tool to `place`;
leaving `place` clears the pending stamp) so the canvas never has to reconcile the two
separately.

4 new components under `src/components/sprites/`, all porting GB Studio 3.2.1's real
interaction model (`MetaspriteEditor.tsx`, read directly from the signed-off wireframe's own
research) but simplified to this engine's real scope - no worker/4bpp decode pipeline (tiles
render straight from the source PNG via CSS `background-position`, letting the browser's own
PNG decoder do the work - that machinery only exists compiler-side for a real reason: producing
real 4bpp VRAM bytes, which an authoring-only preview doesn't need), a single plain y-down
coordinate system (no GB-style y-up mirroring - a new mechanism, no existing convention to
match), 16x16-only tiles (matching the M9.1 `METASPRITE_TILE_SIZE` decision):

- `MetaspriteToolbar.tsx` - select/erase tool, flip X/Y, send to front/back, delete, all acting
  on the current `selectedMetaspriteTileIds`.
- `MetaspriteCanvas.tsx` - the actual composing surface: click-drag to move a selection
  (multi-tile, preserving each tile's own offset from the drag origin), shift-click to toggle a
  tile into/out of the selection, a drag-to-marquee-select, arrow keys to nudge (shift = by a
  whole tile), Delete/Backspace to remove, and the "place" flow (pick a tile in the palette →
  canvas click stamps it at the snapped cursor position). Shows the sheet's own collision
  bounding box as a reference overlay (not editable here - that's still the existing bounds
  fields in the inspector).
- `MetaspriteTilePalette.tsx` - the source PNG as a clickable 16x16 grid; clicking a cell sets
  `spriteTileSelection`. Keeps the "Edit" button (opens the file in the OS's default graphics
  editor) - the exact addition the user asked for on the wireframe before signing off.
- `MetaspriteFramesTimeline.tsx` - switches which frame the canvas is editing. Deliberately no
  add/remove-frame buttons - frame count is still exactly what `animationType` says (3/6/1-N),
  matching M9.1's own corrected design; a frame with no tiles yet just renders empty until the
  canvas places something into it.

`SpriteInspector.tsx` gained: a `metaspriteMode` checkbox (the opt-in toggle, separate from
`AnimationTypeSelect` per M9.1's correction); Canvas Size becomes real and editable
(16-128, default 16x16) once `metaspriteMode` is on, instead of staying fixed read-only info;
and - mirroring GB Studio's own real `SpriteEditor.tsx` exactly - when a metasprite tile is
selected, the WHOLE sheet-level panel is replaced by that tile's own fields (X/Y for a single
selection, flip X/Y, a "display behind background" priority checkbox) rather than showing both
at once. `SpritesPage.js` swaps in the 4 new components (replacing `SpritePreview`/
`SpriteSheetPanel`/`SpriteFramesStrip`) only when the selected sheet's `metaspriteMode` is on -
every other sheet's page is completely unchanged.

**A real verification-method problem found and fixed before trusting any of this.** Every
"real `npm start` webpack + fork-ts-checker build, no TS errors" check this session (M8 and
M9.1 alike) turned out to be weaker than it looked: `webpack.rules.js` runs `ts-loader` with
`transpileOnly: true` (strips types, never checks them) and relies entirely on a separate
`ForkTsCheckerWebpackPlugin` to do the real type-checking - but that plugin spawns a worker
using the project's own locally pinned `typescript@3.9.10`, the SAME version already confirmed
(while chasing M9.1's own `tsc` attempt) too old to even *parse* several currently-installed
`@types/*` packages' `.d.ts` files. Caught for real this time by deliberately planting an
obvious type error (`const x: number = "a string"`) in a new file and rebuilding: webpack
reported a fresh build hash (so it did recompile) but printed zero errors anywhere in the
output - proof the checker isn't actually completing a check, not just proof of a clean
codebase. The likely mechanism: the forked worker itself crashes while parsing those same
unparseable `.d.ts` files, and that crash doesn't propagate a visible error back to the
terminal the way a synchronous `tsc` CLI failure would.

Fixed by finding a check that actually works: `npx -y -p typescript@5.4.5 tsc --noEmit -p
tsconfig.json` (a fresh, modern TypeScript fetched on demand, bypassing the broken local 3.9.10
entirely) runs a real, complete project check in a few minutes. It surfaced two genuine bugs in
this session's own new files - both fixed: a deliberately-planted smoke-test line (removed) and
a real one, `CoordinateInput`'s props don't include a `step` field (`SpriteInspector.tsx`'s new
canvas-size inputs had one, harmlessly ignored at runtime by the underlying `<input
type="number">` but a genuine TS error) - plus 13 pre-existing errors in 5 files this session
never touched (`Splash.tsx`, `ActorEditor.tsx`, `SceneEditor.tsx`, `validation.ts`,
`buildGameMiddleware.ts`), confirmed unrelated two ways: identical error list with my changes
stashed, and several are themselves an artifact of checking with a newer TypeScript than this
project was written against (`useUnknownInCatchVariables` defaulting to true since TS 4.4,
turning old `catch (err)` blocks into new `'err' is of type unknown'` errors) rather than real
bugs - left alone, out of scope, not introduced by anything here. After both real fixes, a
final run came back with those same 13 pre-existing errors and *nothing* in any file this
session touched.

This matters beyond just today: every earlier "npm start, no TS errors" claim this session made
for M8/M9.1 should be read as "the build didn't crash," not "a real type check passed" - though
this same final `npx tsc@5.4.5` run, covering the whole project, also came back clean for every
M8/M9.1 file, so nothing was actually hiding. Worth remembering for any future session: use
`npx -y -p typescript@5.4.5 tsc --noEmit -p tsconfig.json` (or a current version at the time)
for a real TypeScript check in this repo, not `npm start`'s own build output - that pairing
(`transpileOnly` ts-loader + a silently-non-functional fork-ts-checker under an outdated pinned
`typescript`) means `npm start` cannot currently be trusted to surface a type error at all.

Verified: full suite green (152 suites, 753 passing, same 3 pre-existing skips) - 8 new
`editorState.test.ts` cases for the new UI-state reducers (set/toggle/reset tile selection,
frame-switch clears selection, tool/stamp consistency both directions). The new locale keys
were added to `en.json` only, not backfilled across the other 17 locale files - checked first
via `node src/lang/list_missing.js de` and found the entire Sprite Editor area (going back to
M0-M3, not just this entry) was never propagated to other locales either, so adding mine alone
everywhere would have been inconsistent with this area's own real, already-established (if
imperfect) precedent rather than actually fixing anything.

**Not done / honestly flagged**: no manual click-through verification in a running app this
pass (the project's own stated M4 verification bar) - this environment can run `npm start` and
confirm the build succeeds, but driving the actual UI (clicking the canvas, dragging tiles)
isn't something this session can do itself. The user should click through the real interaction
before this is called fully done, same as M4's own still-open manual-verification item.

### 2026-10-13 — correction: `yarn start` DOES type-check, and caught 2 real bugs

The verification-method write-up just above concluded `npm start` couldn't be trusted to
surface a TypeScript error at all. **Half right, half wrong** - the user ran `yarn start` for
real and got exactly that: 4 real errors, shown as an in-app error overlay (a normal webpack-
dev-server feature) rather than printed to the terminal, which is the channel this session was
actually watching. So `ForkTsCheckerWebpackPlugin` was never silently crashing as guessed -
it works, it just reports to a UI surface this session has no way to see, which is why the
earlier planted-type-error smoke test looked like a false negative from the terminal alone (it
likely wasn't negative at all - the overlay probably showed it, unseen). The modern
`npx tsc@5.4.5` finding from the entry above still stands as a genuinely more reliable check for
this session's own future use (nothing about this correction changes that it's old-TypeScript-
unreachable, real, and worth using), but the conclusion that `yarn start`'s own check is
non-functional was wrong - it's functional, just invisible from here.

Both real errors `MetaspriteCanvas.tsx` reported (`TS2531`/`TS2532`, "object is possibly
null/undefined" at lines 371-372 and 426-427) were the same root cause: `showGhost` stored
`spriteTileSelection && metaspriteTool === "place" && cursor` in a separate boolean, which
breaks TypeScript's control-flow narrowing - using `cursor.x`/`spriteTileSelection.x` later
doesn't see that boolean as proof either is non-null, since the narrowing only follows the
exact expression it came from, not a variable that merely summarizes it. Fixed by computing
`ghostOrigin` (an object, or `null`) directly in the same conditional expression that reads
`cursor`, and repeating `spriteTileSelection &&` directly in the JSX condition instead of
relying on the earlier boolean - both keep the narrowing intact at the point of use. Re-checked
clean with the same `npx tsc@5.4.5` command; full suite still green (152 suites, 753 passing).

Next: **M9.3** (compiler - turn an authored tile list into real VRAM data) and **M9.4** (engine
- the real multi-OAM render loop, M7's deferred (c)/(d)) are what actually make a metasprite
sheet render in-game; nothing from M9.1/M9.2 is consumed by the compiler or engine yet.

### 2026-10-13 — M9.3 (conversion function) done, not yet wired into real compilation

`imageToFreeformMetaspriteData()` (`snesgfx.js`) - the real compiler-side counterpart to M9.1's
data model: takes a sheet's own `metasprites`/`metaspriteTiles` (the editor's authored tile
placements, M9.2) and produces real VRAM-ready data - one deduped 8x8 tile set for the WHOLE
sheet (shared across every frame and every placed tile, so identical source regions anywhere
reuse the same tiles), and a per-frame placement list (`{dx, dy, quad: [tl,tr,bl,br tile
indices], flipX, flipY, priority}`) ready for a real multi-OAM render loop.

Each placed tile is still always a 16x16 region (`METASPRITE_TILE_SIZE`, M9.1) - one real
hardware `OBJ_LARGE` block, 4 real 8x8 sub-tiles - matching every other actor pose on this
engine (M8.1's `imageToActorMetaspriteData`, M8.3's single-OAM-per-pose path). Dedup is real
per-8x8-sub-tile dedup, not just whole-quad dedup: two placed tiles sharing some but not all of
their 4 sub-tiles each still get their own quad, reusing whichever sub-tiles a third placement
also happens to match - tested directly (a red-region tile and a blue-region tile, which share
zero pixels, correctly produce 2 distinct tiles, not false-deduped). Out-of-bounds slices (a
tile placed partly past a ragged source image's own edge - the editor's canvas doesn't
constrain `sliceX`/`sliceY` to the image bounds) read as transparent rather than throwing.

**Deliberately not wired into `compileSnesData.js`'s real emission yet** - same reasoning as
M8.2's own `createScenePacker`: the real consumer (a multi-OAM-per-actor render loop, M7's own
deferred (c)/(d) - the engine still only ever writes exactly one `oamSet` per actor per frame
today) doesn't exist, so wiring this into the real build now would produce compiled data
nothing reads, with no way to verify it's actually correct end-to-end. Landing the real,
isolated, tested conversion function first (this entry) and the paired compiler-wiring +
engine render loop together next (M9.4) keeps every intermediate commit buildable, the same
discipline M8.2/M8.3 already established.

Tests: 6 new cases in `snesgfx.test.js` (single placed tile resolves to a real quad, cross-frame
dedup of the same source region, per-sub-tile dedup confirmed with a real negative control,
flip/priority pass-through, out-of-bounds tolerance, an empty frame produces an empty list not
an error). Full suite green (152 suites, 759 passing, same 3 pre-existing skips). Lint clean
(the one `no-continue` hit in `snesgfx.js` is the same pre-existing M5-era line already
confirmed unrelated earlier in this effort).

Next: **M9.4** - the paired step that actually makes any of this render: `compileSnesData.js`
wiring (real VRAM packing via `createScenePacker`, replacing the primary-pose-only placement a
metaspriteMode sheet currently still falls back to) and the engine's real multi-OAM render
loop (consuming M7's `actor_oam_base[]` for a real per-slot cost instead of the always-1
placeholder, M7's own deferred scanline-budget warning). The biggest, riskiest remaining step -
real engine C changes, byte-exact scene-blob format growth, a real toolchain build, Mesen
verification - matching every other "paired compiler+engine change" milestone's own history in
this file.

### 2026-10-14 — two real bugs found by the user testing M9.2, and a genuine gap closed

**Two UI bugs, found by the user clicking through the running app** (exactly the manual
verification step this entry's own earlier "not done / honestly flagged" note called out):
1. `MetaspriteTilePalette.tsx`'s "Edit" button was nested as a JSX *child* of
   `SplitPaneHeader`, but that component takes right-aligned content through a separate
   `buttons` prop, not children - the button landed inside the title's own flex-grow span and
   wrapped onto its own line instead of sitting at the right of the header row. Fixed by using
   `buttons={...}` correctly.
2. A fresh metasprite sheet's default 16x16 canvas rendered at the old zoom=2 default - 32x32
   real screen px, functionally invisible and unusable. Bumped to zoom=8 for the canvas, zoom=4
   for the (potentially much bigger) tile palette.

**A real, confirmed capability gap, traced to this whole effort's very first request** ("how
can I add a frame... for example explosion, I want to add a new frame" - the question that
originally kicked off this entire multi-day effort): M9.2 deliberately shipped with no way to
add/remove a frame, on the theory that frame count should stay entirely driven by
`animationType`. The user pushed back directly ("how can I add a frame to a current animation,
I can't?"), which was the right call - for `animationType: "fixed"` sheets specifically (a
plain auto-cycling frame set, no directional meaning), there's no real reason frame count has
to stay locked.

Implemented for real: `addMetaspriteFrame`/`removeMetaspriteFrame` reducers, +/- buttons in
`MetaspriteFramesTimeline.tsx`, shown only for `animationType === "fixed"` sheets (`"multi"`/
`"multi_movement"` stay locked at their real 3/6 poses - those frames each mean something
specific to the engine, down/up/side or two walk poses per direction, so there's no
well-defined way to "add a 5th direction"). Deliberately does **not** touch
`SpriteSheet.numFrames` - confirmed directly in `loadSpriteData.js` that `numFrames` is
recomputed from the real PNG's pixel width on every asset rescan (project reload, file
watcher), so anything stored there would silently revert on the next rescan.
`metasprites.length` becomes the real frame-count source of truth instead, once metaspriteMode
is on for a Fixed sheet - never touched by that scan, so it's the only field that can safely
hold an author-driven count.

**A real seeding bug caught before it shipped, not by a test that happened to already cover
it**: the first time a sheet's `metasprites` array is created (no tile ever placed, "+" never
clicked), naively starting it at length 1 (or whatever one `addMetaspriteTile` call happens to
touch) would make `metasprites.length` - now the authoritative frame count - **silently
disagree with and override** the real frame count the image's own pixel width already implies,
making already-existing frames the author never asked to lose simply vanish the moment any
frame-array-creating action ran. Fixed with a shared `seedMetasprites()` helper: the first time
any of `ensureMetaspriteFrame`/`addMetaspriteFrame`/`removeMetaspriteFrame` would create the
array from scratch, it seeds `Math.max(1, numFrames)` empty frames first, so every
already-implied frame survives untouched before the requested add/remove is applied on top.

Tests: 5 new cases in `entitiesState.test.ts` (plain add, seed-then-add on an untouched sheet,
plain remove with its own tiles cleaned up, seed-then-remove on an untouched sheet, removing
the last frame leaves exactly one empty frame rather than zero). Doc: `docs/sprites.md` gained
a full "Free-form (Metasprite) mode" section - what's real today, how to place/edit tiles, the
Fixed-only add/remove-frame rule and why, and an explicit "what's not built yet" list (nothing
here compiles into the ROM yet) so a reader isn't misled into thinking this is further along
than it is. Full suite green (152 suites, 764 passing, same 3 pre-existing skips); re-verified
clean with the now-established `npx tsc@5.4.5` check.

### 2026-10-13/14 — M9.4 (real rendering) planned and steps 1-4 landed

Entered plan mode for M9.4 ("the biggest, riskiest remaining step", per this doc's own M9.3
entry) - the real wiring that makes a composed free-form sprite actually show up in Build ROM /
Play / Mesen, not just the editor's own canvas. Matched M8's own precedent (a written migration
plan reviewed before any engine code). Two research agents (compiler-side and engine-side) plus
a design-validation Plan agent grounded the design in the real current code before anything was
written. Two real corrections to this doc's own earlier record came out of that research:

1. The "second OBJ bank at 0x1000-0x1FFF" described in M8's own entries below isn't two
   separately-managed VRAM regions after all - `game.c` makes exactly one `oamInitGfxSet` call
   for the whole 512-tile OBJ budget (`0x0000-0x1FFF`), confirmed by reading the real call site
   directly. No new VRAM-layout engineering was needed for M9.4 as a result.
2. `packSceneSprites.js`'s `createScenePacker.alloc(quad)` - already real, already in production
   use for packing every actor's extra animation poses (`buildSceneSprites`) - turned out to be
   exactly the right, already-proven primitive for placing a free-form tile's quad too. No new
   packer needed.

A third finding changed scope for the worse before it got fixed: `EMOTE_OID`/
`PROJECTILE_OID_BASE`/`AVATAR_OID` were still `MAX_ACTORS`-derived compile-time constants,
correct only because every actor cost exactly 1 OAM id - M7's own comments had already flagged
this as needing to become a runtime value "the moment a real per-slot cost can exceed 1." That
moment is this milestone, so converting them was folded in as required, not optional.

User decision (`AskUserQuestion`): a `multi`/`multi_movement` free-form sheet's "side" pose
should auto-mirror for the opposite facing direction, matching every existing actor sheet's own
convention, rather than always rendering exactly as authored.

Plan approved; implementation proceeding in the order the plan lays out (each step independently
buildable + bootable, matching M8.2/M8.3's own "paired compiler+engine change" discipline):

**Step 1 (done)** - `imageToFreeformMetaspriteData` (`snesgfx.js`) gained a `colors` field (raw
RGB list, same shape `imageToSpriteData` already returns) - needed by `compileSnesData.js`'s
existing `mergeSpriteIntoPalette` scene-palette-sharing logic, which the real detection step
(step 5) will need. One-line, additive. Test: `snesgfx.test.js`.

**Step 2 (done)** - scene-blob format growth: a new `[2*SPRITE_SLOTS]` (16-byte) trailing
section, appended after the existing `[40]`-byte extra-pose table - same "always append at the
very end, never shifts an earlier offset assertion" discipline every prior scene-blob growth in
this project's history has followed. Every slot currently emits `[0,0]` (no real detection wired
yet - that's step 5). One existing test needed updating (`compileSnesData.test.js`'s total
blob-length assertion, `+16`) - the exact "mechanical, single shifted assertion" outcome the plan
predicted. `yarn test` + `yarn jest buildSnesRom` green.

**Step 3 (done)** - `scene.c`/`scene.h` parse the new section into a new
`metasprite_frame_base[SPRITE_SLOTS]` pointer table (a real pointer straight into the scene
blob's own ROM-resident data - the same pattern `sprite_slot_for_index` already uses, confirmed
safe for the whole scene's lifetime). Self-skipping format (`slotByteLen` covers each slot's own
frame-offset table + entry data), so no separate bookkeeping needed. Render loop untouched -
every slot is still `NULL` from step 2's placeholder data, so behavior is provably unchanged.
`gen-dummy-gfx.js` (the committed engine-tree dummy fixture `assets.c` used by `buildSnesRom`'s
own standalone toolchain test) regenerated to match the new trailing section's shape, following
the same "regenerate the committed dummy fixture" discipline M7's `[24]->[32]` growth used.

**Step 4 (done)** - `EMOTE_OID`/`PROJECTILE_OID_BASE`/`AVATAR_OID` became real runtime `u16`
globals (`actor_oam_total`, `emote_oid`, `projectile_oid_base`, `avatar_oid` - `scene.h`),
computed once in `SceneInit` right after the existing `actor_oam_base[]` prefix-sum loop, from
that loop's own real running total - not `MAX_ACTORS`-derived constants anymore. `ui.c` gained
`#include "scene.h"` for `avatar_oid`.

**A real correctness gap found and fixed while implementing this, not just planned**: the old
per-"unused actor slot" hide loop in `SceneInit` only ever cleared OAM ids up to
`(MAX_ACTORS-1)<<2` (76) - but under the OLD fixed-constant scheme that was fine, since
`EMOTE_OID`/etc. were ALWAYS 80/84/100 regardless of a scene's real actor count. Once they became
real per-scene values, a **smaller** scene (fewer actors than the one before it) can compute a
**smaller** `emote_oid`/`avatar_oid` than a previous, bigger-cast scene did - meaning a sprite
left visible at the old scene's higher OAM id (e.g. a dialogue avatar on screen right as
`SWITCH_SCENE` fires) would never get cleared by the new scene's own narrower sweep, stranding a
stale, stuck sprite on screen indefinitely. Fixed by replacing the whole per-actor-slot hide call
with a single unconditional sweep from the real `actor_oam_total` through the full 128-sprite
hardware ceiling, done once `actor_oam_total`/`avatar_oid` are known - covers emote/projectile/
avatar's own range AND any stale leftover from a differently-shaped previous scene in one pass,
the same "hide now, let the owning subsystem redraw next frame" reasoning the old loop already
used, just no longer bounded by a fixed, now-wrong ceiling.

Also corrected a wrong claim made in an early draft of this very entry's own code comments
(caught before it could mislead the Mesen verification below): "these compute to the exact same
values the old constants had" is only true for a scene using every one of the `MAX_ACTORS-1`
real actor slots - for any smaller scene (i.e. almost all of them), the new values are smaller
than 80/84/100, not identical. Fixed in the comments directly.

**Mesen-verified** (real toolchain build of `test/projects/Test_ActorInvoke`, 1 scene, 5 NPC
actors + the player = 6 real actors, read via `emu.memType.snesMemory` + the raw `game.sym`
address per `[[mesen-snesmemory-addressing-correction]]`, a temp test file deleted after use per
this project's own convention): `actor_oam_total=24, emote_oid=24, projectile_oid_base=28,
avatar_oid=44` - exactly `6*4`/`+4`/`+16` as derived, confirming both the runtime computation
and the new sweep are correct on real hardware, and empirically settling the "not the same as
the old constants" correction above (24 vs. the old 80).

Full suite green throughout (152 suites, 764 passing, same 3 pre-existing skips) at every step;
`yarn jest buildSnesRom` green after every C change.

Next: **step 5** - the real wiring: `compileSnesData.js` detection + quad packing + byte
encoding for a `metaspriteMode` sheet, paired with `scene.c`'s `frames_len_for` lift,
`actor_metasprite_pose`, and the real `SceneRenderActors` multi-entry branch. See the plan file's
own "Implementation order" for steps 5-7 (real wiring, side-pose auto-mirroring, the OAM budget
warning).

### 2026-10-13 — zoom controls wired for real, plus an in-canvas hint for the pick-then-place flow

User feedback after trying the shipped M9.2/M9.3 work, four points in one message: a request
for a zoom control on the "Sprite Sheet" panel; a report that the app toolbar's own zoom button
("top left") seemed non-functional on this page; continued confusion about how free-form mode
actually works; and a question about the frame strip's +/- buttons.

**`state.editor.zoomSprite` was real but had zero consumers on the Sprites page.** The app
toolbar's `ZoomButton` (`AppToolbar.tsx`) already dispatches `editorActions.zoomIn/zoomOut/
zoomReset({section: "sprites"})` and `zoomForSection("sprites", editor)`
(`lib/helpers/gbstudio.js`) already correctly returns `editor.zoomSprite` - confirmed by
grepping every component under `src/components/sprites/` for `zoomSprite` before this round:
zero matches. The field updated correctly in Redux; nothing on screen ever changed because
nothing read it back. Wired it into the two single-frame views that field is the right fit for:
- `SpritePreview.tsx` - `CanvasFrame` now takes a `canvasSize` prop (`16 * zoomSprite/100`,
  floored at 128px for a sane minimum) instead of a fixed 64px, replacing both the outer frame
  and the inner `<canvas>` sizing.
- `MetaspriteCanvas.tsx` - dropped its own local `zoom` prop entirely in favour of reading
  `state.editor.zoomSprite / 100` directly.

**Two further zoom controls, deliberately local state, not `zoomSprite`.** `SpriteSheetPanel.tsx`
("Sprite Sheet" panel, the strip showing the *whole* raw PNG) and `MetaspriteTilePalette.tsx`
("Tiles" panel, same whole-sheet view in free-form mode) both show the entire sheet at once -
a different sizing need from a single 16x16 frame, so sharing one Redux field between all four
would make any one view's zoom fight the others'. Added a local `useState` zoom to each, with
its own `ZoomButton` (the same reusable component `AppToolbar.tsx` already uses) placed via
`SplitPaneHeader`'s real `buttons` prop - the exact mechanism the 2026-10-14 entry above already
had to learn the hard way for the Edit button, applied correctly from the start this time.
`SpriteSheetPanel.tsx`'s zoom scales the strip's `<img height>` (was a hardcoded 32px);
`MetaspriteTilePalette.tsx`'s replaces its own old hardcoded `zoom = 4` default outright (every
call site already passed no `zoom` prop, confirmed by grep, so this was a pure improvement with
no caller to update).

**In-canvas hint for "I still do not understand how to use free form mode."** The existing
`docs/sprites.md` section explains the pick-a-tile-then-click-to-place workflow, but a doc
nobody necessarily opens isn't the same as the UI itself saying so. Added a small `Hint` label
directly under `MetaspriteCanvas`'s own canvas area, shown only while the frame has zero placed
tiles and no tile is currently picked from the palette (`FIELD_METASPRITE_HINT`: "Click a tile
below in Tiles to pick it, then click here to place it") - it disappears the moment either
condition changes (a tile gets picked, showing the existing stamp-ghost cue instead, or a tile
gets placed), so it only ever shows exactly when it's needed.

**Frame +/- buttons: clarified via tooltip rather than redesigned.** The ambiguous "I still can
see the +/- at the bottom middle, for the frames" was read as "I can see them, but don't know
what they do" rather than a request to remove them (they're real, working, user-requested
functionality from the immediately preceding entry). Replaced their generic `ASSET_ADD`/
`DIALOG_DELETE` tooltip text (shared, unrelated l10n keys - never written to describe *this*
button) with two new, specific keys: `FIELD_ADD_FRAME` ("Add Frame (Fixed sheets only)") and
`FIELD_REMOVE_FRAME` ("Remove Frame") - the "(Fixed sheets only)" suffix on Add exists because
these buttons are hidden entirely for `multi`/`multi_movement` sheets, so a user who only ever
sees them on a Fixed sheet would otherwise have no on-screen clue that the scope is deliberate,
not a bug.

New l10n keys added to `en.json` only, matching this effort's own established precedent (every
other M9 string - `FIELD_TILES`, `FIELD_SPRITE_FRAMES`, etc. - is `en.json`-only too; the other
13 locales pick up the English fallback until a translation pass, same as any other
in-progress feature per `node src/lang/list_missing.js`).

Verified: full suite green (152 suites, 764 passing, same 3 pre-existing skips); a real
`npx -y -p typescript@5.4.5 tsc --noEmit` run shows the same pre-existing, unrelated errors as
before this round (`Splash.tsx`, `ActorEditor.tsx`, `SceneEditor.tsx`, `validation.ts`,
`buildGameMiddleware.ts` - none under `src/components/sprites/`) and no new ones. Not yet
re-driven in a real `npm start` window by the user for this specific round - the established
discipline on this effort is to treat that as the actual pass/fail gate for anything UI-shaped,
so this entry's fixes should be treated as "implemented and statically verified," not yet
"confirmed working," until the user tries them again.

### 2026-10-14 — M9.4 steps 5-6: the real wiring lands - a free-form metasprite actually renders

**Step 5 - compiler + engine wiring, together.** `compileSnesData.js` now dispatches a
`metaspriteMode` sheet to `imageToFreeformMetaspriteData` instead of `imageToSpriteData`
(confirmed via the plan's own earlier research this needed no change to that function itself).
`buildSceneSprites` gained a parallel branch: for each frame, for each placed tile, the entry's
`quad` indices are resolved back to real tile byte-arrays and fed to the *same*
`createScenePacker.alloc()` already used for legacy extra poses - exactly the already-proven
primitive the plan identified, reused with zero changes to `packSceneSprites.js`. `oamIds[k]`
becomes the slot's own real worst-case simultaneous-tile count across its frames;
`metaspriteSlotBytes[k]` holds the new per-slot payload, assembled via a new
`encodeMetaspriteSlot()` helper matching the scene-blob format from step 2.

**A real geometry bug caught before writing any engine code**, by re-deriving the dx/dy math
by hand rather than trusting the already-approved plan: the plan's own byte table said
`dx = tile.x` ("already canvas-center-relative"), but legacy `actor_render_tile`'s anchor is
`x_rel = a->x - scroll_x - 8` - a *horizontally centered*, not left-edge-relative, 16px sprite.
A bare `tile.x` (0 for the one default tile position) would have put every composed sprite 8px
too far right compared to a legacy sprite in the exact same spot. Fixed to
`dx = tile.x - canvasWidth/2` (matching Y's own already-correct `dy = tile.y - canvasHeight`,
a *bottom*-anchored, not top-edge-relative, convention) - verified by hand for both the
default 16x16 single-tile case (reproduces the legacy -8/-16 exactly) and a wider composed
case, then later confirmed correct again empirically via Mesen (see below).

**Engine side**: `frames_len_for` lifts its hardcoded 2-6 frame cap for `SPRITE_STATIC` only
when `metasprite_frame_base[slot]` is set (every legacy sheet untouched). A new
`actor_metasprite_pose()` resolves which authored frame index an actor's current pose/
direction maps to - deliberately duplicated from `actor_render_tile` rather than refactored
into it, keeping the single most bug-history-documented function in this file provably
untouched. `SceneRenderActors` branches per actor on `metasprite_frame_base[slot]`: when set,
loops over that frame's placed-tile entries, one `oamSetEx`+`oamSet` pair per entry (not
PVSnesLib's own `oamMetaDraw16`/`Dyn16`, per the plan's own reasoning - this engine has never
used that API and its real semantics aren't verifiable from the vendored headers alone), hides
any of the actor's own unused trailing sub-ids in both branches, and - per the user's earlier
decision - mirrors a `multi`/`multi_movement` sheet's whole side-pose tile set (position
negated around the canvas's own horizontal center, each tile's own flipX XORed) when facing
the opposite direction.

**Two real bugs found via Mesen verification, neither caught by the unit tests** (both unit
tests only ever exercised a `"fixed"`/`SPRITE_STATIC` sheet, which happened to mask both):

1. **`actor_metasprite_pose()`'s own compact-index bug.** It returned the legacy 6-slot pose
   numbering (0=primary, 2=up, 4=side, ...) for `SPRITE_ACTOR`, mirroring
   `SPRITE_ACTOR_ANIMATED`'s own real numbering - but a `"multi"` sheet only ever authors 3
   *compact* frames (`MetaspriteFramesTimeline.tsx`'s own `frameCountFor`), and
   `encodeMetaspriteSlot` packs `sheet.metasprites[]` 1:1 with no gap-filling. Reading pose
   index 4 against a 3-entry frameOffset table would have read past the real data. Fixed to
   return compact `{0,1,2}` for `SPRITE_ACTOR` specifically (`SPRITE_ACTOR_ANIMATED`'s own 6
   real authored frames already match the 6-slot numbering, no change needed there).
2. **`spriteTypeForActor` - a second, independent place computing essentially the same value,
   found desynced from `buildSceneSprites`' own `types[k]`.** Every actor's own compiled
   `sprite_type` byte (`p[7]` in its scene-blob entry - what `SceneRenderActors`/
   `actor_metasprite_pose`/`frames_len_for` all actually dispatch on at runtime, *not* the
   slot table, which only ever backs the player's own sprite_type) is computed by this
   separate, pre-existing function via `spriteTypeDec(actorSpriteType, conv.frameCount)`. A
   metaspriteMode sheet's `conv` (from `imageToFreeformMetaspriteData`) has no `frameCount`
   field at all, so this silently fell through to 0 (`SPRITE_STATIC`) regardless of the
   sheet's real `animationType` - invisible for a `"fixed"` sheet (0 is coincidentally also
   the right answer there, which is exactly why the step-5 unit test and first Mesen check
   both looked clean) and only surfaced once a `"multi"` sheet's actor read pose 0 (down) no
   matter which way it was actually facing, confirmed via a dedicated debug global read live
   in Mesen (`dbgPose=0`, not the expected `2`). Fixed by making `spriteTypeForActor` return
   `animationTypeToSpriteType(sheet.animationType)` directly for a metaspriteMode sheet,
   bypassing both `actor.spriteType`'s per-actor override and the nonexistent `conv.frameCount`
   - now guaranteed to agree with `types[k]`, since both ultimately read the same
   `sheet.animationType`.

**Two further precautions taken, neither the actual bug but kept anyway**: the per-tile
off-screen cull check was first written as a single 4-term `&&` chain
(`meta_x > -32 && meta_x < 256 && meta_y > -32 && meta_y < 224`) - this engine's own documented
816-tcc miscompile class (a 3+-term `&&`/`||` chain mis-linking its false branch,
`can_step`/`in_box`/`col_solid`'s own fix history) was the first suspect when entry1 of a
2-tile frame kept silently going through the hide path. Rewritten as nested single-condition
ifs building an explicit `meta_visible` flag anyway (matches established precedent, costs
nothing), but rebuilding+re-testing with *only* that fix applied reproduced the exact same
symptom - ruling it out before chasing the real cause (bug 2 above). Likewise the per-tile
loop's `for (meta_j = 0; meta_j < meta_n; meta_j++, meta_e += 4)` comma-operator increment -
untested syntax on this engine, no other loop here uses one - was rewritten to advance `meta_e`
explicitly in the loop body; also tested in isolation, also didn't change the symptom. Neither
was the real bug, but both are real, permanent, zero-cost hardening kept in the final code -
and the methodology (test each suspect in isolation rather than changing several things and
guessing which one mattered) is worth remembering for the next time a "should obviously work"
trace doesn't match reality.

**Real-hardware verification, two separate fixtures, both via temp test files deleted after
use per this project's convention** (`emu.memType.snesMemory` + raw `game.sym` addresses for
WRAM, `emu.memType.snesSpriteRam` - newly discovered via a quick `emu.memType` key probe - for
the real post-DMA OAM table, 180-frame settle before sampling):
- A `"fixed"`/`SPRITE_STATIC` sheet, one actor, two 16x16 tiles stacked into a 16x32 canvas:
  both OAM entries appeared at `actor_oam_base[i]`/`+4`, 16px apart vertically (matching the
  authored dy difference exactly), same X, same deduped VRAM tile (confirming cross-tile
  dedup survives the real engine, not just the JS packer in isolation) - `{oid:4, x0:80,y0:56,
  t0:96,a0:38, x1:80,y1:72,t1:96,a1:38}`.
- A `"multi"`/`SPRITE_ACTOR` sheet, two actors (one facing left, one right) sharing one slot:
  both read `sprite_oam_ids_for_slot[1]=2` and resolved pose=2 (side) correctly after the
  `spriteTypeForActor` fix; entry order never changes (same two tiles, same VRAM dedup) but
  the facing-left actor's entries swap relative X order and every attribute byte differs by
  exactly one bit (the hflip bit) from the facing-right actor's - `r0.x-r1.x=-16` unmirrored,
  `l0.x-l1.x=+16` mirrored, confirming the auto-mirror transform is correct on real hardware,
  not just in the dx-arithmetic derivation.

Tests: `compileSnesData.test.js` gained two new cases under "Free-form (Metasprite) sheet real
wiring (M9.4)" - byte-exact dx/dy/flags/dedup assertions for a 2-tile fixture, and
`sprite_oam_ids_for_slot`'s real 2-entry cost - built against `Test_Math`'s own real
`static.png` fixture (reused as a source PNG, not its intended legacy role). `snesgfx.test.js`
gained a `colors` field assertion. Full suite green (152 suites, 766 passing, same 3
pre-existing skips) throughout every intermediate step; `yarn jest buildSnesRom` green after
every C change, per this project's own "never land a non-bootable intermediate commit"
discipline.

Next: M9.4's own step 7 (an OAM/scanline hardware-budget warning, pure diagnostics, no
engine/compiler behavior change) is the one remaining piece of the approved plan, not done in
this round.

### 2026-10-15 — M9.4 step 7 (OAM hardware-budget warning) - M9.4 and M9 both fully complete

The last piece of the approved M9.4 plan: a compile-time warning when a scene's worst-case
simultaneous hardware sprite count exceeds the SNES's real 128-sprite OAM budget. Before this
milestone every actor/emote/projectile/avatar cost exactly 1 OAM id, so 128 was never
reachable by anything the compiler could see; a metaspriteMode actor can now cost several (one
per placed tile in its biggest frame), so a scene leaning hard on big composed sprites
genuinely can exceed it.

`buildSceneSprites` (`compileSnesData.js`) sums the real worst-case cost per actor **instance**
in `scene.actors` (not per distinct sheet - two actors sharing one costly metasprite sheet each
pay that sheet's own `oamIds[k]` separately, matching `actor_oam_base[]`'s own real per-actor
prefix sum in `scene.c`) plus the player (`oamCostForId(playerSpriteIdForScene(scene))`) plus a
flat `1` (emote) + `MAX_PROJECTILES` (4, a new local JS mirror of `gbs_types.h`'s own
`#define`, needed only here) + `1` (avatar). Warns, doesn't hard-cap - matching every other
hardware-budget decision already in this codebase (VRAM tiles, 16-colour palettes, OBJ
palette sharing, >8 sprite sheets/scene), all of which warn-and-continue rather than silently
failing or blocking the build. A sheet that didn't fit this scene's 8 slots (the existing
>8-sheets warning) is costed via the same slot-0 fallback the engine itself falls back to, for
consistency between the warning and what would actually happen on real hardware.

Deliberately left out, same as the plan itself called for: the separate, sharper 32-sprites-
per-scanline hardware limit stays explicitly deferred (flagged twice already, M6/M7) - a
compile-time estimate would need to reason about actors' real-time Y positions during actual
gameplay, which this static compiler pass has no way to know; a loose, often-wrong bound isn't
worth adding over leaving it undocumented-but-honest.

Tests: two new cases in `compileSnesData.test.js` - a small scene (4 actors, 2 tiles/frame,
total 16) confirms no false positive; `snesTarget.maxActors` (19) actors + the player on a
7-tile-per-frame sheet (total 146) confirms the warning fires, names the scene, and reports
the exact real total and the real 128 ceiling. Both built against a synthetic project reusing
`Test_Math`'s own `static.png`/`placeholder.png` fixtures, same pattern every other M9.4 test
this round used. Pure JS-side diagnostic, no engine/C change - no toolchain build or Mesen
pass needed for this step specifically, unlike every other M9.4 step. Full suite green (152
suites, 768 passing, same 3 pre-existing skips).

`docs/sprites.md` updated to describe the warning as real instead of listing it under "what's
not built yet".

**M9.4, and with it the whole M9 milestone, is now fully complete** - a free-form (metasprite)
sprite sheet can be authored, composed, and now genuinely renders in a built ROM, verified on
real hardware, with a real warning if a scene pushes past what the hardware can actually show.
