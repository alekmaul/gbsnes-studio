# Migration v2 — audit du diff 1.2.2 → 2.0.0-beta5 (M0)

Référence pour toute la suite du chantier `v2` (voir le milestone artifact — lien dans la mémoire
Claude `gbsnes-v2-migration`). Base comparée : notre fork (`gbsnes-studio`, dérivé de GB Studio
1.2.2) contre les sources fournies dans `C:\svgexterne\vboxshared\DropboxSvnClient\snes\gb-studio-2.0.0-beta5`
(arbre en lecture seule, pas un dépôt git qu'on manipule).

Méthode : diff de listing de fichiers (`comm`) par répertoire clé, pas un diff textuel ligne à
ligne (le volume de changements le rend peu utile — presque tout a bougé). Chaque section liste
ce qui est strictement identique en nom (portable tel quel, à re-vérifier au contenu), ce qui a
été renommé/scindé (mapping connu), et ce qui est entièrement nouveau (aucun équivalent SNES
existant).

## 1. `src/lib/compiler` — très portable

Tous nos fichiers communs avec GB existent encore sous le même nom en 2.0.0-beta5
(`bankedData.js`, `buildProject.js`, `compileData.js`, `compileEntityEvents.js`,
`compileImages.js`, `compileMusic.js`, `ejectBuild.js`, `ensureBuildTools.js`, `eventTypes.js`,
`ggbgfx.js`, `helpers.js`, `makeBuild.js`, `scriptBuilder.js`) — **zéro renommage/suppression**
parmi les fichiers qu'on ne modifie pas nous-mêmes.

Renommé : `buildMakeBat.js` → `buildMakeScript.js` (généralisation Windows `.bat`/Unix `.sh`,
correspond au changelog beta4 "Removed dependency of XCode/Command Line Tools... no longer using
GNU Make").

Nouveau (aucun équivalent 1.2.2) : `compileAvatars.js` + `compileSprites.js` (éclatés hors de
`compileData.js`), `objCache.js` (cache de build incrémental — nouveau, à évaluer pour la cible
SNES en M7/M8).

**Nos 8 fichiers SNES-only** (additions pures, aucune collision de nom avec GB, donc rien à
merger — juste à recopier puis adapter aux nouvelles signatures partagées) :
`buildSnesRom.js`, `compileSnesData.js`, `compileSnesMusic.js`, `mod2it.js`, `snesFixedAssets.js`,
`snesgfx.js`, `targets/{gb,snes}.js`. (`buildMakeBat.js` n'est pas dans cette liste — c'est un
fichier GB qu'on ne modifie pas, juste renommé upstream.)

## 2. `src/lib/events` — 84 → 97, aucune suppression

`comm -23` (fichiers présents chez nous mais absents en 2.0.0-beta5) est **vide** — les 84
fichiers qu'on a existent tous encore, sous le même nom, en 2.0.0-beta5. Les "types union" du
changelog (fusion visuelle de paires comme *Move To* / *Move To Using Variables*) n'ont donc **pas**
fait disparaître de fichiers — probablement géré en gardant chaque fichier mais en changeant la
forme de son objet `fields` (un champ peut désormais accepter valeur fixe **ou** variable **ou**
propriété). À vérifier fichier par fichier au moment de M9, pas supposé ici.

13 fichiers nouveaux : `eventActorSetAnimate.js`, `eventActorSetSprite.js`,
`eventActorStopUpdateScript.js`, `eventEngineFieldSet.js`, `eventEngineFieldStore.js`,
`eventIfActorRelativeToActor.js`, `eventIfColorSupported.js`, `eventLaunchProjectile.js`,
`eventPaletteSetBackground.js`, `eventPaletteSetUI.js`, `eventPlayerBounce.js`,
`eventWeaponAttack.js`, + `index.d.ts` (déclaration TypeScript, pas un event).

Nos events SNES-aware actuels (à ré-auditer en M9, tous présents sous le même nom en 2.0.0-beta5) :
`eventTextDialogue.js`, `eventCameraMoveTo.js`, `eventOverlayShow.js`, `eventOverlayMoveTo.js`,
les 4 events X/Y/L/R.

## 3. État global — restructuration complète (Redux Toolkit)

`src/reducers/*.js` (13 fichiers) + `src/actions/{actionTypes,index}.js` + `src/store/configureStore.js`
+ `src/middleware/*.js` (5 fichiers) deviennent **`src/store/features/<domaine>/`**, un dossier
par domaine fonctionnel, chacun avec `<domaine>State.ts` (= l'ancien reducer) +
`<domaine>Actions.ts` (= les action creators, avant éclatés dans `actionTypes.js`) et
optionnellement `<domaine>Middleware.ts` (= l'ancien fichier `src/middleware/*.js`).

Mapping ancien → nouveau (confirmé par le contenu des dossiers, pas juste le nom) :

| Ancien | Nouveau |
| --- | --- |
| `reducers/entitiesReducer.js` | `store/features/entities/` (+ `entitiesHelpers.ts`, `entitiesTypes.ts`) |
| `reducers/documentReducer.js` | `store/features/document/` |
| `reducers/editorReducer.js` | `store/features/editor/` |
| `reducers/errorReducer.js` | `store/features/error/` |
| `reducers/musicReducer.js` | `store/features/music/` (+ `musicMiddleware.ts` = notre `middleware/music.js`) |
| `reducers/navigationReducer.js` | `store/features/navigation/` |
| `reducers/projectReducer.js` | `store/features/project/` |
| `reducers/settingsReducer.js` | `store/features/settings/` — **c'est ici que vivent `target`/`snesRegion`/`snesSramSize`/`customControlsX/Y/L/R` à réintégrer (M10-M11)** |
| `reducers/toolsReducer.js` | probablement fondu dans `store/features/editor/` (à confirmer) |
| `reducers/consoleReducer.js` | `store/features/console/` |
| `middleware/buildGame.js` | `store/features/buildGame/buildGameMiddleware.ts` |
| `middleware/soundfx.js` | `store/features/soundfx/soundfxMiddleware.ts` |
| `middleware/electron.js` | `store/features/electron/electronMiddleware.ts` |
| `middleware/logger.js` | probablement fondu dans `store/features/console/` |
| `actions/actionTypes.js` | éclaté : chaque `<domaine>Actions.ts` porte les siennes |

Domaines entièrement nouveaux, aucun équivalent 1.2.2 : `clipboard`, `engine` (le nouveau
`Engine.json`/Engine Property Fields), `undo`, `warnings`, `metadata`.

## 4. Moteur GB (`appData/src/gb`) — 33 → 71 fichiers, découpage par genre confirmé

Architecture confirmée par répertoire (pas supposée) :

- **`src/states/` + `include/states/`** — exactement **5 fichiers**, un par genre de scène :
  `TopDown.c`, `Platform.c`, `Adventure.c`, `PointNClick.c`, `Shmup.c`. Chacun implémente
  vraisemblablement la logique de déplacement/collision propre à son genre, branchée sur un cœur
  partagé — confirme la structure `M5a-d` du milestone.
- **`src/core/`** — 32 fichiers, le moteur partagé entre tous les genres. Correspondances directes
  avec notre moteur SNES actuel :

  | `core/` (2.0.0-beta5) | équivalent SNES actuel (`appData/src/snes/src/`) |
  | --- | --- |
  | `Core_Main.c` | `game.c` (boucle principale) |
  | `ScriptRunner.c` + `ScriptRunner_b.c` | `script_runner.c` + `script_cmds.c` |
  | `UI.c` + `UI_a.s` + `UI_b.c` | `ui.c` |
  | `FadeManager.c` + `FadeManager_b.c` | `fade.c` |
  | `MusicManager.c` + `gbt_player*.s` | `music.c` |
  | `Actor.c` + `Actor_b.c` + `Actor_a.s` | portions acteurs de `scene.c` |
  | `Collision.c` | portions collision de `scene.c` |
  | `Trigger.c` + `Trigger_b.c` | portions trigger de `scene.c` |
  | `Camera.c` + `Camera_a.s` | portions caméra de `game.c` |
  | `Sprite.c` + `Sprite_b.c` | rendu sprite dans `scene.c` |
  | `Scroll.c` + `Scroll_a.s` + `Scroll_b.c` | scroll BG dans `game.c` (notre fix "camera shear" v1 s'applique conceptuellement ici) |
  | `Input.c` | lecture pad dans `game.c` |
  | `BankData.c` / `BankManager.c` | pas d'équivalent direct (SNES utilise des pointeurs `far`, pas de banking manuel) |

  Sans équivalent SNES aujourd'hui — travail réellement nouveau :
  - **`Projectiles.c` + `Projectiles_b.c`** — système de projectiles/armes (events
    `eventLaunchProjectile.js`/`eventWeaponAttack.js`), nécessaire dès qu'on couvre Shmup/Platformer.
  - **`Palette.c`** — gestionnaire multi-palettes par scène (6 BG + 7 sprite) ; le SNES a déjà la
    couleur nativement mais pas ce modèle de données à plusieurs régions adressables (M6).
  - **`DataManager.c`** — à lire en détail, probablement le chargement de scène/streaming d'assets
    (notre `SceneInit`/`data_ptrs` actuels en sont l'équivalent fonctionnel, forme à comparer).

## 5. Migration de projet — chaîne de version confirmée

`src/lib/project/*.js` reste identique nom pour nom (zéro renommage), plus deux nouveaux fichiers
pour la fonctionnalité "Eject Engine" (exposée en UI depuis la 2.0, on ne l'avait qu'en interne) :
`ejectEngineToDir.js` + `ejectEngineChangelog.ts`.

Chaîne de version confirmée par lecture directe de `migrateProject.js` :

- **Nous** : `"1"` → `"1.0.0"` → `"1.1.0"`, `LATEST_PROJECT_VERSION = "1.2.0"` (dernier palier
  déjà nommé mais migration détaillée non lue en entier ici).
- **2.0.0-beta5** : `"1"` → `"1.0.0"` → `"1.1.0"` → `"1.2.0"` → `"2.0.0"`, puis en interne
  `"200r1"` → `"200r2"` → ... → `"200r6"` (révisions de schéma internes aux beta1..beta5).

Donc le point de greffe pour la migration d'un projet SNES `v1.1.4` est exactement `"1.2.0" →
"2.0.0"` (+ les 6 révisions `200rN`) — chaîne à écrire en M10, pas à inventer : le trajet complet
existe déjà côté GB pur, il faut juste y insérer la migration de nos champs `settings.target`/etc.

## 6. Ce qui reste non couvert par cet audit (volontairement, hors scope M0)

- Contenu ligne à ligne de `core/Actor.c` etc. — lu en détail au moment de M5, pas ici.
- `src/components`/`src/containers` (éditeur UI — Navigator sidebar, Settings page, Splash) —
  pertinent pour M11/M12, pas pour la faisabilité du portage moteur/compilateur.
- `webpack.*.config.js` / `tsconfig.json` — à lire en détail en M1 (bring-up), pas ici.

## Décision M0 — sort de `appData/src/snes/`

**Le moteur C SNES actuel (`appData/src/snes/src/`) sert de référence de comportement, pas de
base de code à copier telle quelle.** Le moteur GB de référence a changé de forme (découpage
`core/`+`states/` bien plus granulaire que notre `scene.c` monolithique actuel) — reconstruire en
suivant cette même granularité (fichiers séparés par responsabilité) plutôt que de forcer le
nouveau contrat dans l'ancienne organisation en un seul `scene.c`. Détail dans le milestone M5.
