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

## 7. M4 — les 5 genres de scène du moteur GB 2.0

Lecture ligne à ligne des 5 fichiers `appData/src/gb/src/states/*.c` (969 lignes au total) et du
mécanisme de dispatch commun (`Core_Main.c`), pour fixer l'ordre d'implémentation SNES (M5) et le
contrat partagé entre genres.

### Mécanisme de dispatch (commun aux 5 genres)

`scene_type` (un octet, dans les données de scène compilées) sélectionne le genre. `Core_Main.c`
appelle `startFuncs[scene_type]()` une fois au chargement de la scène et `updateFuncs[scene_type]()`
une fois par frame — deux tables de pointeurs de fonctions bankées, indexées par genre. Rien
d'autre ne dépend du genre dans la boucle principale : `UpdateCamera()`, `UpdateActors()`,
`UpdateProjectiles_b()`, la VM de script, tournent identiquement quel que soit `scene_type`. Pour
le SNES, ça veut dire : une table `stateBanks[]`/fonctions `Start_<Genre>`/`Update_<Genre>` par
genre, brancher `scene_type` dans le blob de scène compilé, et rien à changer dans `game.c`/
`scene.c` au-delà de ce dispatch.

### Par genre

- **Top Down** (168 lignes) — mouvement **verrouillé sur une grille** (8 ou **16px**, nouveau champ
  moteur `topdown_grid` — absent en 1.2.2, c'est ce qui avait cassé le tout premier build M1 avant
  que `engineFields` soit branché). Collision testée sur la case cible avant de bouger
  (`TileAt2x1`/`TileAt2x2` selon la grille). C'est le genre le plus proche du moteur SNES actuel
  (`v1.1.4`) — mouvement tuile-par-tuile déjà implémenté, juste sans le mode grille 16px.
- **Platformer** (299 lignes) — **physique en virgule fixe 4.4** (`<<4`/`>>4`) : gravité, saut,
  échelles, accélération marche/course distinctes, toutes pilotées par des Engine Property Fields
  (`plat_walk_vel`, `plat_run_acc`, `plat_grav`, `plat_jump_vel`, `plat_max_fall_vel`,
  `plat_hold_grav`, `plat_dec`, `plat_min_vel`, `plat_run_vel`). Aucun équivalent SNES aujourd'hui —
  c'est le plus gros morceau de travail C neuf des 5 genres.
- **Adventure** (164 lignes) — mouvement **libre au pixel** (pas verrouillé sur une grille),
  8 directions, collision testée au pixel avec biais gauche/droite pour ne pas glisser sur les
  coins, `player_iframes` (invincibilité temporaire après un coup). Différent de Top Down dans le
  modèle de mouvement (continu vs. par case), mais réutilise les mêmes primitives de collision par
  tuile.
- **Point and Click** (98 lignes) — **surprise de l'audit : ce n'est PAS une variante de Top Down**,
  contrairement à l'hypothèse de départ du roadmap. `player` ici est un **curseur libre sans
  collision du tout** (juste un clamp aux bords d'écran) ; A déclenche le script de l'acteur/trigger
  survolé. C'est le genre le plus simple des 5 — pas de moteur de collision à porter du tout.
- **Shoot Em Up** (190 lignes) — **défilement forcé** (horizontal ou vertical selon la direction du
  joueur au démarrage de la scène), le joueur ne contrôle que l'axe perpendiculaire, la caméra est
  décalée pour anticiper. Pas de code de projectile dans ce fichier — les projectiles sont un
  sous-système partagé (voir ci-dessous), pas propres à ce genre.

### Sous-systèmes partagés (pas propres à un genre)

- **`On Update` par acteur** (remplace `movementType` de la 1.2.0/`v1.1.4`) — en 1.2.2, un acteur
  avait un champ figé (`static` / `randomFace` / `randomWalk`, 2 comportements IA câblés en dur
  dans le moteur). En 2.0.0-beta5, **c'est devenu un vrai script** : `migrateProject.js` convertit
  `randomFace`/`randomWalk` en scripts générés (`generateRandomLookScript()`/
  `generateRandomWalkScript()`) placés dans un nouveau champ `updateScript`, exactement comme
  `startScript`/`hit1Script`/etc. Côté moteur, chaque acteur a un `movement_ptr` (`Actor.h`) lancé
  en **contexte de script d'arrière-plan** (`ScriptStartBg`, le même mécanisme déjà utilisé pour
  `SET_TIMER_SCRIPT`) dès que l'acteur devient actif (`ActivateActor_b`). **Bonne nouvelle pour le
  SNES** : le moteur `v1.1.4` a *déjà* ce mécanisme de contexte de script d'arrière-plan opérationnel
  (`SET_INPUT_SCRIPT`/`SET_TIMER_SCRIPT` "tournent pour de vrai" d'après le README SNES) — ajouter
  `movement_ptr` par acteur devrait être une extension mécanique de ce qui existe déjà, pas un
  sous-système à inventer. `eventActorStopUpdateScript.js` confirme le même patron start/stop que
  les autres scripts d'arrière-plan.
- **Projectiles** (`Projectiles.c` + `Projectiles_b.c`, 309 lignes) — pool de taille fixe
  (`MAX_PROJECTILES`, allocation round-robin), filtré par un système `col_group`/`col_mask` (le
  même `collision_group` déjà lu dans les 5 fichiers `states/*.c`). Deux primitives : `WeaponAttack`
  (coup mêlée épinglé sur un acteur, durée de vie courte fixe) et `ProjectileLaunch` (projectile
  libre avec sa propre direction/vitesse/durée de vie). `UpdateProjectiles_b()` tourne **chaque
  frame, pour tous les genres** (appelé une fois dans `Core_Main.c`, pas dans les fichiers
  `states/*.c`) — `EVENT_LAUNCH_PROJECTILE`/`EVENT_WEAPON_ATTACK` sont des events génériques,
  utilisables depuis n'importe quel genre, pas réservés au Shoot Em Up. Aucun équivalent SNES
  aujourd'hui.
- **`Palette.c`** — non lu en détail ici (pertinent pour M6, pas M4).

### Ordre d'implémentation révisé pour M5

L'ordre proposé par le roadmap (Top Down → Platformer → Adventure/Point and Click → Shoot Em Up)
supposait Point and Click proche de Top Down. Ce n'est pas le cas — c'est en réalité le genre **le
plus simple des 5** (aucune collision à porter). Ordre révisé, du moins risqué au plus risqué :

1. **Top Down** — le plus proche de l'existant `v1.1.4` (mouvement par case déjà implémenté),
   sert de test du contrat commun (dispatch `scene_type`, `On Update`) lui-même.
2. **Point and Click** — trivial une fois Top Down en place (curseur + interaction, zéro collision
   neuve) ; bon deuxième genre pour valider le dispatch sans complexité ajoutée.
3. **Adventure** — variante mouvement-libre-au-pixel de Top Down, réutilise les mêmes primitives
   de collision par tuile.
4. **Platformer** — le vrai morceau : physique virgule fixe neuve de bout en bout (gravité, saut,
   échelles). Fait après avoir le contrat commun bien éprouvé sur 3 genres plus simples.
5. **Shoot Em Up** — fait en dernier : nécessite le sous-système Projectiles (à porter une fois,
   avant ou pendant ce genre puisqu'il est utilisable par tous) et le modèle de défilement forcé,
   le plus éloigné de l'existant.

`On Update` (le mécanisme `movement_ptr`) et **Projectiles** sont tous deux transverses aux 5
genres — à porter une fois, tôt (dès Top Down pour `On Update`, avant Shoot Em Up pour
Projectiles), pas répétés par genre.

### Note pour M5d (Platformer) — le moteur map/objets de PVSnesLib

Référence pointée par l'utilisateur : l'exemple
[`likemario`](https://github.com/alekmaul/pvsneslib/tree/master/snes-examples/systems/games/likemario)
du dépôt PVSnesLib lui-même, qui utilise le **moteur map/objets intégré** de la lib (pas du code
d'exemple isolé — les routines vivent dans `pvsneslib/source/maps.asm` et `objects.asm`, donc
déjà vendorées avec la toolchain actuelle). Ce que ça offre, pertinent pour la physique
plateforme :

- `objCollidMap()` — collision tuile automatique + détection de sol (`obj->tilestand`), à partir
  d'un octet d'attribut par tuile.
- Position/vitesse en virgule fixe par objet (`xpos`/`ypos`/`xvel`/`yvel`) + `objUpdateXY()` pour
  intégrer la vélocité — exactement la même famille de représentation que `Platform.c` (`pl_pos_x`
  en `<<4`/`>>4`, voir section 7 ci-dessus).
- Une petite machine à états par objet (`objInitFunctions(init, update, draw)` + `objUpdateAll()`)
  — une forme d'acteur générique, mais **indépendante de notre modèle de scripts/events**.

**Tension réelle à trancher au moment de M5d, pas maintenant** : `mapLoad()`/`objLoadObjects()`
attendent leurs propres formats binaires (`.m16`/`.o16`/`.b16`/`.t16`), générés par les outils
`tmx2snes`/`gfx4snes` de PVSnesLib à partir d'une carte Tiled — exactement les outils **retirés
volontairement** de notre toolchain vendorée (voir la section "Toolchain" de `CLAUDE.md` : "ce
projet convertit chaque asset lui-même en JS, `snes_rules` n'a jamais de `.tmx`/`.bmp` à leur
donner"). Adopter le moteur map/objets *en entier* impliquerait de réintroduire cette chaîne
d'outils et de réencoder les données de scène GB Studio dans leurs formats — un changement
d'architecture, pas un emprunt ponctuel. Ce qui est probablement récupérable sans ça : la
**démarche** (représentation virgule fixe, ordre collision-puis-déplacement) comme référence pour
écrire notre propre `Platform.c` équivalent, éventuellement `objCollidMap()`/`objUpdateXY()`
directement si leurs structures internes s'avèrent alimentables depuis nos propres données de
tuiles sans passer par `mapLoad()` — à vérifier en lisant `objects.asm`/`maps.asm` au moment de
M5d, pas en le supposant maintenant.

## 9. M5b (Point and Click) — fait, 2026-09-13

Confirme la conclusion clé de la section 7 : Point and Click n'est **pas** une variante de Top
Down mais un curseur flottant, sans collision, qui réutilise le slot acteur 0 (exactement comme
la référence GB réutilise `player` pour son curseur). Implémenté directement dans `scene.c`
(`Start_PointNClick`/`Update_PointNClick`), à côté de la paire Top Down déjà là — voir le
commentaire de `states.h` sur le report délibéré de l'éclatement en fichiers par genre (le
"second genre" qui devait déclencher ce découpage à l'époque de M5a est arrivé, mais le coût
réel du découpage sous 816-tcc — statics/externs inter-fichiers déjà documentés comme source de
bugs — dépasse le bénéfice à seulement 2 genres).

**Découverte importante, corrige un numérotage supposé à tort** : les indices `scene_type` ne
sont pas libres — ils doivent correspondre exactement aux valeurs `scene.type` réelles de
l'éditeur GB Studio 2.0.0-beta5 (`src/components/forms/SceneTypeSelect.tsx` : 0 Top Down,
1 Platformer, 2 Adventure, 3 Shoot Em Up, 4 Point and Click), pas à l'ordre dans lequel M5
construit les genres (Top Down → Point and Click → Adventure → Platformer → Shoot Em Up, voir
section 7). Point and Click est donc à l'**index 4**, pas 1. `states.c`'s `startFuncs[]`/
`updateFuncs[]` sont maintenant dimensionnées à 5 entrées (`NUM_SCENE_TYPES`), les 3 genres pas
encore construits (1/2/3) pointant vers des no-ops explicites plutôt que de rester non remplis
(plantage) ou de pointer vers Top Down par défaut (comportement trompeur).

**Deuxième correction architecturale, trouvée en implémentant, pas supposée** : le déclenchement
des triggers "walk-over" (`SceneCheckTriggers`) tournait sans condition de genre depuis
`SceneUpdate()` — ça marchait par coïncidence quand Top Down était le seul genre (son propre
comportement matchait par hasard), mais ça aurait fait déclencher un trigger "walk-over" par un
simple passage du curseur Point and Click au-dessus, alors que la référence GB
(`states/PointNClick.c`) n'appelle jamais son équivalent `ActivateTriggerAt` du tout. Corrigé en
gardant l'appel existant mais en le conditionnant à `scene_type == SCENE_TYPE_TOPDOWN` à
l'intérieur de `SceneCheckTriggers` elle-même (pas déplacé dans un fichier par genre — même
décision de report que ci-dessus) ; un futur genre qui veut ses propres triggers walk-over
(Adventure/Platformer, probablement) rouvrira cette garde à ce moment-là.

**Fidélité au comportement de référence, avec deux adaptations documentées, pas des écarts
silencieux** :
- Le hover-test GB (`ActorAtTile`/`TriggerAtTile`, `Actor_b.c`/`Trigger_b.c`) est porté tel quel
  (tolérance d'une tuile de chaque côté pour les acteurs, d'une tuile à gauche pour les
  triggers ; test trigger sur `tile_y - 1`, pas la tuile du curseur elle-même — un choix
  d'auteur GB délibéré, gardé tel quel).
- Le garde `events_ptr.bank != 0` de GB (n'affiche le curseur "hover" que sur un acteur/trigger
  qui a un vrai script) n'a pas d'équivalent portable : `BANK_PTR` sur cette cible n'a qu'un
  pointeur brut, pas de champ bank/sentinelle "pas de script" — ce qui n'existera réellement
  qu'avec le compilateur M7. Documenté en commentaire plutôt que deviné ; comme
  `SceneTryInteract` (Top Down) le fait déjà, tout acteur/trigger touché est traité comme
  "hoverable"/interactif pour l'instant.
- `last_hit_trigger` (GB) est déclaré puis jamais réaffecté dans la référence elle-même — la
  comparaison qui s'appuie sur lui est donc toujours vraie en pratique. Pas porté (code mort de
  la référence, pas un comportement à reproduire).
- Le déplacement du curseur est un déplacement pixel direct (pas de `actor_try_move`/
  `can_step`), avec `actors[0].moving` forcé à 0 en permanence : la boucle de pas générique
  (`SceneUpdateActors`, qui déplace aussi bien le joueur Top Down que les PNJ) ne doit jamais
  s'en emparer, sinon le curseur se caler/bloquerait aux limites de tuile de 8px comme un
  acteur qui marche, au lieu de glisser librement — exactement la trouvaille clé de l'audit M4
  ("collision-free floating cursor").
- Caméra : `Start_PointNClick` de GB pose `camera_deadzone = 24` ; notre moteur n'a toujours
  aucune notion de deadzone (`CameraInit` centre toujours durement sur l'acteur 0 - la même
  note que `Start_TopDown` porte déjà). Report délibéré, pas un oubli : le curseur hérite du
  même verrouillage dur que Top Down pour l'instant.

**Vérifié** : build réel `make` (toolchain vendorée, 816-tcc/816-opt/wla-65816/wlalink) propre,
aucune régression (`yarn jest` : 548/550, mêmes 2 échecs pré-existants déboqués depuis M1). Boot
Mesen : (a) les fixtures réelles (`scene_type` 0) tournent 120 frames sans rien changer de
comportement ; (b) un test de démarrage/plantage dédié (scène 1 du générateur de dummy, patchée
temporairement à `scene_type = 4` + position de départ dans cette scène, `git checkout --` avant
le commit) confirme que `startFuncs[4]`/`updateFuncs[4]` s'exécutent sans plantage sur 300
frames, que `scene_type` se relit correctement à 4 en WRAM, et que la position du curseur reste
stable et cohérente (`x=88,y=80`, exactement `tile*8+8` pour le point de départ testé) sans
aucune entrée simulée. **Le comportement piloté par le curseur lui-même (déplacement au d-pad,
hover, A pour interagir) n'est PAS vérifié par un test Mesen automatisé** — décision actée avec
l'utilisateur le 2026-09-13 (voir la mémoire Claude `gbsnes-v2-migration`) après l'échec
confirmé de toute méthode de simulation d'entrée Lua sur ce build de Mesen : la vérification du
comportement piloté par le d-pad pour M5b et la suite repose désormais sur un test interactif
par l'utilisateur, pas sur un script Lua.

## 10. M5c (Adventure) — fait, 2026-09-13

Confirme la description de l'audit M4 : une variante "mouvement libre au pixel" de Top Down —
les deux axes peuvent bouger la même frame (vraie diagonale, contrairement à la priorité
d'un-axe-à-la-fois de Top Down), le joueur n'est plus calé sur la grille de tuiles. Réutilise
l'interaction bouton A existante (`SceneTryInteract`, déjà genre-agnostique dans son
implémentation) et les triggers walk-over, mais **pas** via `SceneCheckTriggers` — voir plus
bas pourquoi.

**Décision de conception centrale, pas empruntée telle quelle à GB** : la référence GB
(`states/Adventure.c`) résout la collision avec une hitbox volontairement **plus étroite** que
le sprite entier, biaisée dans la direction du déplacement (`pos.x + 4 + dir.x`, `pos.y + 7`) —
un choix délibéré, pas un détail accessoire : une hitbox étroite (≤8px) ne peut jamais chevaucher
plus de 2 tuiles par axe, quel que soit l'alignement, ce qui rend un mouvement au pixel près
tractable avec de l'arithmétique de tuile simple. La reconstruction fidèle de la valeur exacte
des biais GB était risquée sans pouvoir la vérifier interactivement cette session (le trou de
simulation d'input) — l'arithmétique de biais de GB suppose en plus une convention de position
différente (coin haut-gauche) de celle de ce moteur (centre-x / bas-pied, voir
`gbs_types.h`/`SceneRenderActors`). Plutôt que de porter les constantes de GB verbatim au
risque d'une erreur de bord non détectable, l'**idée** est reconstruite proprement pour notre
propre convention : un point de test unique, biaisé d'un pixel dans la direction du mouvement,
au niveau de la colonne du centre horizontal (axe X) ou de la ligne juste au-dessus des pieds
(axe Y) — `col_solid()` existant, pas de nouvelle primitive de collision.

**Vrai bug trouvé et corrigé en écrivant le code, pas supposé à l'avance** : la première version
appliquait le déplacement final en testant `dir_x`/`dir_y` directement (`if (dir_x) x += ...`).
Comme `dir_x`/`dir_y` sont la **direction persistante** de l'acteur (relue par le rendu et par
`SceneTryInteract`, jamais remise à 0 juste parce qu'aucune touche n'est tenue), un joueur qui
relâche le d-pad continuait à glisser indéfiniment dans sa dernière direction — un vrai bug de
dérive. Corrigé en calquant exactement GB : le déplacement final est gardé par `actors[0].moving`
(mis à jour tous les frames, reflète uniquement si une touche est *réellement* tenue cette
frame), pas par `dir_x`/`dir_y`. Trouvé et corrigé **avant** commit grâce à la relecture
attentive imposée par l'absence de vérification Mesen comportementale — sans cette relecture, le
bug serait passé inaperçu jusqu'à un test interactif utilisateur.

Autre fidélité portée depuis GB : `backup_dir` — quand un déplacement est totalement bloqué
(les deux axes annulés par collision la même frame), la direction/facing du joueur est restaurée
à ce qu'elle était avant les tests de collision plutôt que de rester à 0,0 — heurter un mur
laisse le joueur visuellement tourné vers lui, seul le mouvement est annulé.

**Deuxième trouvaille architecturale, cette fois pas un bug mais un vrai choix à faire** : la
référence GB appelle `ActivateTriggerAt` **sans condition d'alignement** (chaque frame, quelle
que soit la position exacte) — contrairement à `SceneCheckTriggers` de ce moteur (M5b), qui
n'agit que quand le joueur est exactement calé sur une tuile (`actor_on_tile`), une hypothèse
raisonnable pour Top Down mais qui rendrait les triggers quasiment inopérants pour Adventure
(le joueur est rarement exactement aligné sur les deux axes en mouvement libre/diagonal).
Plutôt que de forcer Adventure à travers la même porte que Top Down, la logique de scan/lancement
de trigger a été extraite dans un nouveau petit primitif partagé, `SceneActivateTriggerAt(tx,
ty)` — mirroir direct du `ActivateTriggerAt` de GB, qui est lui-même déjà une fonction partagée
appelée directement par chaque genre, pas un hook générique caché derrière une seule scène de
mise à jour. `SceneCheckTriggers` (Top Down) l'utilise en gardant exactement son ancien
comportement (`check_triggers`/`actor_on_tile`) ; `Update_Adventure` l'appelle directement,
chaque frame, avec son propre anti-rebond par comparaison de tuile (`adv_last_trigger_tx/ty`,
mirroir du `last_trigger_tx/ty` réel de GB) plutôt que le flag `check_triggers` orienté
mouvement de Top Down.

**Explicitement pas porté, documenté en commentaire plutôt que deviné** : `player_iframes`/
`hit_actor`/`collision_group` (le mécanisme GB "toucher un ennemi, invincibilité temporaire") —
dépend d'un champ `collision_group` que la struct `ACTOR` de ce moteur n'a pas encore, et du
sous-système Projectiles que l'audit M4 place en transverse, construit une fois, autour de M5e —
pas quelque chose à moitié inventer maintenant. Adventure n'a donc pas de dégâts au contact ce
jalon.

**Vérifié** : build `make` réel propre, `yarn jest` 548/550 (mêmes 2 échecs préexistants). Deux
vérifications Mesen en tâche de fond : les fixtures réelles (`scene_type` 0) tournent 120 frames
sans changement ; un test de démarrage/plantage dédié (scène factice basculée temporairement à
`scene_type=2`, `git checkout --` avant commit) confirme 300 frames sans plantage, une lecture
WRAM cohérente de `scene_type=2`, et surtout **une position parfaitement stable sans aucune
entrée tenue** (`x=88,y=80` du début à la fin, `dir_x=0,dir_y=1` conforme au spawn, `moving=0`)
— la preuve concrète que le bug de dérive ci-dessus est bien corrigé, pas juste plausible sur le
papier. Le comportement réellement piloté par le d-pad (diagonale, glissement le long d'un mur,
triggers walk-over en mouvement libre) n'est **pas** vérifié par script Lua, conformément à la
décision actée pour M5b — laissé au test interactif de l'utilisateur.

## 11. M5d (Platformer) — fait, 2026-09-13, avec une vraie correction rétroactive sur M5b/M5c

Le "vrai morceau" annoncé par l'audit M4 : physique virgule fixe neuve de bout en bout
(accélération/décélération marche/course, gravité, saut à hauteur variable via maintien du
bouton B). `Start_Platform`/`Update_Platform` suivent l'échelle de virgule fixe exacte de
`Platform.c` de GB (position en 1/16px, vélocité en 1/4096px/frame, appliquée via `pos += vel
>> 8`) pour que les valeurs par défaut des Engine Fields (copiées telles quelles depuis
`engine.json` - toujours pas de vrai pipeline Engine Field sur cette cible, M7, même raisonnement
que `topdown_grid`) produisent les mêmes vitesses réelles que celles décrites par l'éditeur GB
Studio - une échelle différente rendrait ces nombres arbitraires. Position/vélocité tiennent en
`s16` simple (pas de 32 bits, jamais utilisés ailleurs sur cette cible et donc non éprouvés sous
816-tcc) : la largeur de scène max de cette cible (2040px, 255 tuiles) × 16 = 32640, dans la
plage `s16`.

**Explicitement pas porté cette étape, documenté plutôt qu'à moitié inventé** : les échelles
(`TILE_PROP_LADDER` — nécessiterait un second canal de données par tuile que le bitmap de
collision 1-bit/tuile de ce moteur n'a pas la place d'accueillir, un vrai pipeline M7 le rendrait
possible proprement) ; la collision directionnelle par tuile de GB (`COLLISION_LEFT/RIGHT/TOP/
BOTTOM`, ex. plateformes à sens unique) — le bitmap de collision de ce moteur est un seul bit
plein/vide par tuile depuis M4c, une tuile pleine bloque dans toutes les directions ici, une
simplification documentée, pas un portage partiel de l'octet plus riche de GB ; `player_iframes`/
`hit_actor`/`collision_group`, même dépendance Projectiles/M5e déjà différée en M5c.

### La vraie découverte de cette étape : un bug transverse trouvé, pas supposé

En traçant la chute (gravité) du joueur sans aucune entrée tenue, `plat_vel_y` restait figé à
zéro frame après frame — alors que la gravité aurait dû l'accumuler dès la première frame. Après
une instrumentation fine (compteur d'appels, lecture directe de `script_ptr`/`ui_state`), la
cause réelle est apparue : **`SceneHandleInput()`'s garde "mid-step"** (`if (!ACTOR_ON_TILE(0))
return;`, qui ne laisse tourner `updateFuncs[scene_type]()` que quand le joueur est exactement
calé sur une tuile) **tournait sans condition de genre depuis le début du dispatch M5a** — utile
uniquement pour le mouvement par case de Top Down, mais appliqué sans distinction à **tous les
genres**. Point and Click (le curseur) et Adventure (mouvement libre au pixel) quittent
l'alignement sur tuile dès leur tout premier vrai pas de mouvement - une fois quitté, cette garde
les aurait **gelés définitivement** : `updateFuncs[scene_type]()` (et les scripts d'input,
`SET_INPUT_SCRIPT`, gardés par le même test) ne se relance plus jamais pour le reste de la scène.

Corrigé en conditionnant la garde à `scene_type == SCENE_TYPE_TOPDOWN` - Point and Click,
Adventure et désormais Platformer tournent chaque frame sans condition d'alignement, comme leur
mouvement continu l'exige. Effet de bord positif, pas du scope creep : `SET_INPUT_SCRIPT`
fonctionne maintenant aussi dans ces genres, alors qu'il était accidentellement restreint à Top
Down par le même bug.

**Portée rétroactive réelle, pas seulement théorique** : ce bug était déjà livré dans les commits
M5b (`f8f280c`) et M5c (`fd1212d`) - le curseur Point and Click et le mouvement Adventure
auraient été **cassés en jeu réel** dès la première pression de touche du joueur. Les
vérifications Mesen "300 frames sans dérive" de ces deux commits n'étaient, avec le recul, pas
fausses mais **incomplètes de la même façon que l'incident `1e0cfb2` de M5a** : sans entrée
simulée, la position ne bougeait de toute façon jamais, donc "pas de dérive" restait vrai que le
gate ait été cassé ou non - ces tests ne prouvaient PAS que `Update_PointNClick`/`Update_Adventure`
tournaient de façon répétée sur de vraies frames. Une re-vérification ciblée après correction
(scène factice avec script neutralisé à `END` pour lever le blocage `script_ptr` du script
d'ouverture réel de la scène 1, qui ne se termine jamais sans une pression A - un piège de test
distinct découvert au passage) a produit une preuve non tautologique cette fois : un compteur
d'appels temporaire dans `Update_Adventure` montre une croissance quasi 1:1 avec les frames
réelles (34 à la frame 50, 134 à la frame 150, 284 à la frame 300) - `Update_Adventure` tourne
bien à chaque frame désormais, avec une position toujours stable sans entrée. Le compteur a été
retiré avant commit.

**Vérifié pour M5d lui-même** : build `make` réel propre, `yarn jest` 548/550. Boot Mesen (scène
factice basculée temporairement à `scene_type=1`, `git checkout --` avant commit) : `plat_vel_y`
grimpe correctement 0→1792→3584→...→20000 (le plafond exact de `plat_max_fall_vel`) sur les
frames 14-25 puis reste plafonné - la chute libre et son plafonnement fonctionnent tels que
conçus. Le comportement réellement piloté par le d-pad (marche/course, saut, collision murs/
plafond) reste laissé au test interactif de l'utilisateur, comme pour M5b/M5c.

**Leçon méthodologique retenue pour M5e** : toujours neutraliser le script d'ouverture de la
scène de test factice à `END` avant un test multi-frames sans entrée (sinon `script_ptr` reste
non nul et `SceneHandleInput()` ne tourne jamais, quel que soit le genre) ; toujours tuer le
process Mesen juste après avoir lu le résultat d'un test, pas seulement en fin de session -
`emu.stop(0)` n'arrête que l'émulation, pas le process, et un process laissé vivant peut
ré-écraser le fichier de résultat d'un test suivant avec des données périmées (source d'une
fausse alerte pendant cette étape même).

## 12. M5e (Shoot Em Up) — fait, 2026-09-13 — les 5 genres sont maintenant en place

Le dernier des 5 genres, le plus éloigné de l'existant selon l'audit M4 : un défilement forcé
sur un axe (décidé une fois, à `Start_Shmup`, depuis la direction initiale du joueur - reproduit
GB exactement), l'entrée du joueur ne pilotant que l'axe **perpendiculaire**. Une fois le bord
défilable de la scène atteint, l'axe de défilement se **fige** définitivement - reproduit
`Update_Shmup` de GB au plus près : passé `shooter_reached_end`, la position sur l'axe principal
n'est plus jamais touchée (ni auto-défilée, ni pilotée par le joueur), seul l'axe perpendiculaire
continue de bouger - par exemple pour qu'un vaisseau se verrouille horizontalement dans une
arène de boss tout en pouvant encore esquiver verticalement.

**Explicitement pas porté cette étape, même dépendance déjà différée en M5c/M5d** : la vraie
réaction "combat" au contact d'un ennemi (`player_iframes`/`collision_group`/`hit_actor` de GB,
qui lance le script de l'ennemi au contact) — nécessite un champ `collision_group` sur `ACTOR`
que ce moteur n'a pas, et le sous-système Projectiles (`EVENT_LAUNCH_PROJECTILE`/
`EVENT_WEAPON_ATTACK`, un pool de projectiles) que l'audit M4 place en transverse, construit une
fois, pas quelque chose à moitié inventer en fin de séquence M5. Les 5 genres partagent
maintenant cette seule dépendance restante — le prochain gros morceau naturel une fois M5
terminé. Une scène Shoot Em Up à ce stade défile, esquive, et peut atteindre une sortie
déclenchée par trigger — mais rien ne tire ni ne fait de dégâts encore.

La collision réutilise le même test à point unique biaisé par direction qu'Adventure a déjà
établi, plutôt que les biais par direction de GB (asymétriques d'un côté à l'autre, réglés sur
une convention de hitbox que ce moteur ne partage pas) - cohérent avec le style déjà établi de
ce moteur, pas une supposition sur l'intention exacte de GB. Le seuil "bord atteint" est dérivé
du vrai clamp caméra de ce moteur (formule `cam_max_x`/`cam_max_y` de `game.c`, redupliquée ici
car ces fonctions sont statiques au fichier) plutôt que des constantes GB réglées pour son propre
système de décalage caméra, que cette cible n'a pas.

**Vérifié, et cette fois sans avoir besoin de simuler la moindre entrée** : le défilement forcé
étant inconditionnel (pas piloté par le joueur), un test sans aucune touche tenue observe déjà
le comportement réel du genre. Build `make` réel propre, `yarn jest` 548/550. Boot Mesen (scène
factice basculée temporairement à `scene_type=3`, script neutralisé, `git checkout --` avant
commit) : sens gauche→droite (`START_DIR=4`) - `x` grimpe régulièrement de 88 à 128px, exactement
1px/frame, atteint le seuil (`SHMUP_SCREEN_W_HALF`, 128, cohérent avec `cam_max_x=0` pour cette
scène étroite de 20 tuiles), `reached_end` passe à 1 pile à ce moment, puis `x` reste figé à 128
jusqu'à la frame 250 - le verrouillage fonctionne comme conçu. Sens droite→gauche (`START_DIR=2`)
- vérifié séparément : `x` démarre déjà sous le seuil (88 ≤ 128), donc `reached_end=1` dès la
première frame et la position ne bouge jamais, `dir_x` confirmé forcé à `1` (le vaisseau fait
face à droite malgré le défilement vers la gauche, exactement comme le commentaire de GB
l'explique). Un faux résultat identique au test précédent a été intercepté en cours de route
(process Mesen laissé vivant, résultat périmé réécrit) - re-testé après avoir tué le process,
confirmé frais. Le comportement piloté par le d-pad (esquive perpendiculaire) reste laissé au
test interactif de l'utilisateur, comme pour M5b-d.

## 13. M6 (couleur, palettes multiples par scène) — fait, 2026-09-13

Objectif de l'artefact de roadmap : le moteur SNES expose 6 palettes BG par scène comme le
nouveau modèle couleur de GB Studio 2.0 (`Palette.c` de GB : un blob de 48 octets, 6 régions de
8 couleurs DMG-packées, sélectionnées par tuile via un octet d'attribut VRAM banque 1), au lieu
d'une seule palette BG globale.

**Trouvaille de conception, pas devinée** : le format de tuilemap 16 bits de ce moteur
(`snesgfx.js` : `tile | pal<<10 | prio<<13 | xflip<<14 | yflip<<15`) porte **déjà** le sélecteur
de palette par tuile équivalent — une vraie capacité matérielle SNES (jusqu'à 8 palettes BG 4bpp
adressables), pas quelque chose à ajouter. Le format de tuile n'avait donc besoin d'aucun
changement ; seul le nombre de créneaux CGRAM réellement remplis par `SceneInit` à partir des
données de scène devait passer de 1 à jusqu'à 6.

**Contrainte réelle trouvée en traçant l'utilisation actuelle de la CGRAM, pas supposée** : le
créneau physique 1 (couleurs 16-31) n'est **pas libre** — `ui.c` y charge déjà sa propre palette
de dialogue (`ui_pal`, BG3) aux couleurs 16-19, chargée juste après l'appel de palette de scène
à chaque chargement de scène. Une tuile BG 4bpp échantillonne toujours ses 16 couleurs
complètes ; laisser une palette de scène atterrir dans le créneau 1 aurait fait écraser
silencieusement ses propres index de couleur 0-3 par les couleurs d'encre de l'UI quelques
instants plus tard — pas un cas limite à corriger, une corruption garantie pour tout art
utilisant réellement cette région. Les 6 régions logiques sont donc mappées vers les créneaux
physiques `{0, 2, 3, 4, 5, 6}` (créneau 1 sauté, créneau 7 laissé libre).

**Implémentation** : `SceneUploadBgPalette()` (nouvelle fonction, `scene.c`) remplace l'unique
`dmaCopyCGram` de M6-v1 par une boucle de jusqu'à 6 appels, chacun vers le créneau physique
correct. Rétrocompatible par construction : `bg_pals_len[bg_index]` peut toujours couvrir moins
de 6 régions complètes (même une dernière région partielle) — les fixtures factices actuelles
(32 et 28 octets, une seule région) sont uploadées à l'identique, octet pour octet, vers le
créneau 0 uniquement, sans aucun changement de comportement.

**Vérifié avec un vrai test CGRAM, pas juste "ça compile"** : build `make` réel propre, `yarn
jest` 548/550 (mêmes 2 échecs préexistants). Boot Mesen des fixtures réelles inchangé (120
frames). Test dédié (patch jetable donnant à `bg0` 4 régions aux motifs d'octets distincts
`0x22`/`0x33`/`0x44`, `bg_pals_len[0]` porté à 128, `git checkout --` avant commit) : lecture
directe de la CGRAM réelle dans Mesen (`emu.memType.snesCgRam`) confirme que la région 0
(inchangée) atterrit toujours au créneau 0 octet pour octet identique aux données d'origine, et
que les régions 1/2/3 atterrissent exactement aux créneaux physiques 2/3/4 attendus (`0x22`,
`0x33`, `0x44` relus tels quels) — la palette UI (couleur 16) confirmée intacte et inchangée par
le nouvel upload multi-région. Le rendu réel par tuile (le bit `pal<<10` du tuilemap
sélectionnant effectivement la bonne région pour une vraie tuile peinte) n'a pas été testé
séparément — c'est une capacité matérielle SNES déjà existante et déjà exercée côté sprites
(palettes OBJ par acteur), pas du nouveau code de ce jalon ; seul l'upload CGRAM multi-région
(le vrai changement) avait besoin d'être prouvé.

## 14. M7 (compilateur de données SNES sur la nouvelle base) — fait, 2026-09-13

Le vrai objectif de l'utilisateur pour ce chantier : pouvoir enfin tester un vrai projet sur
SNES, pas seulement la fixture factice. `compileSnesData.js`, `snesgfx.js`,
`snesFixedAssets.js` sont réintégrés (portés depuis `main`/v1.1.4), et une découverte
importante a précédé le portage lui-même : le tout début de ce jalon a servi à investiguer
(agent dédié) précisément ce qui a changé dans l'API du compilateur partagé entre 1.2.2 et
2.0.0-beta5 avant d'écrire la moindre ligne — voir le rapport complet dans l'historique de
conversation, résumé ci-dessous.

### Trouvaille majeure : `scriptBuilder.js` avait perdu toute conscience de cible SNES

L'import en bloc de GB Studio 2.0.0-beta5 (M1) a remplacé `scriptBuilder.js`/`helpers.js` dans
leur intégralité — silencieusement supprimant trois comportements SNES que v1.1.4 avait
construits, sans que rien ne le remarque avant M7 (rien n'exerçait `scriptBuilder.js` pour SNES
entre M1 et M7) :
- `KEY_BITS` (`helpers.js`) avait perdu les bits X/Y/L/R propres au SNES.
- `inputMask()` avait disparu — `IF_INPUT`/`AWAIT_INPUT`/`SET_INPUT_SCRIPT`/
  `REMOVE_INPUT_SCRIPT` poussaient tous inconditionnellement l'octet unique de `inputDec()`.
  Le moteur SNES (déjà vérifié fonctionnel depuis M5) attend un masque de **2 octets**
  little-endian pour ces quatre opcodes précisément — sans ce correctif, le compilateur aurait
  silencieusement émis un masque d'1 octet que le moteur lit comme 2, corrompant tout le reste
  du script.
- `scaleOverlayRow()` avait disparu — la ligne d'`OVERLAY_SHOW`/`OVERLAY_MOVE_TO` était émise
  telle quelle (0-18), sans mise à l'échelle pour l'écran SNES plus haut.
- Le clamp aux bords de scène de `cameraMoveTo` était figé à l'écran GB (20x18 tuiles) quelle
  que soit la cible.

Restauré en reportant le code équivalent de v1.1.4, ré-appliqué à la main contre le
`scriptBuilder.js` de v2 (significativement divergé entretemps — palettes, armes, engine
fields, octets `persist` ajoutés) plutôt que patché en aveugle. `target` non défini reste `"gb"`
partout, donc la sortie compilée de Game Boy est prouvée inchangée — suite `scriptBuilder.test.js`
(116 tests) et suite jest complète toutes deux au vert. Commit `9b5d619`, séparé du port de
`compileSnesData.js` lui-même car c'est un vrai correctif de régression autonome, pas une
étape du portage.

### Décisions de périmètre réelles, pas devinées

- **Scène `scene_type`** : un vrai champ string ("0".."4") sur chaque scène dénormalisée,
  numérotation réelle de l'éditeur GB Studio 2.0 (déjà confirmée en M5b). Inséré comme octet 6
  du blob de scène (après la hauteur, avant la table [24] des slots sprite) - décale tous les
  offsets qui suivaient la hauteur dans l'ancien format v1.1.4 de +1.
- **`actor.spriteType`** : un vrai champ explicite en 2.0 (`static`/`actor`/`actor_animated`/
  `animated`), indépendant du `movementType` — remplace l'heuristique v1.1.4 (`moveDec(movementType)
  === 1 ? SPRITE_STATIC : ...`) par le même helper partagé `spriteTypeDec()` que Game Boy utilise
  désormais lui-même. Un acteur peut maintenant se déplacer tout en gardant un sprite décoratif à
  cycle automatique, ce que l'ancienne heuristique ne pouvait pas exprimer.
- **Palettes multi-régions (6 par scène, cf. M6)** : PAS câblées ici. GB Studio 2.0 calcule
  désormais des données de palette par scène bien plus riches (`precompilePalettes` dans
  `compileData.js` — jusqu'à 6 régions BG + 7 palettes acteur par scène, dédupliquées) mais
  `snesgfx.js` n'extrait toujours qu'**une seule** palette par image, comme avant. Câbler la
  vraie fonctionnalité "peinture de palette" de l'éditeur dans `snesgfx.js` est un vrai chantier
  séparé, pas fait ici. Un projet qui n'utilise pas la peinture de palette (couleurs naturelles
  du fond) compile et joue correctement quand même — le support multi-région du moteur (M6) est
  simplement inutilisé tant qu'aucun compilateur n'émet plus d'une région.
- **Engine Fields** (`topdown_grid`, les constantes physiques du Platformer) : PAS câblées non
  plus. `appData/src/snes/` n'a toujours pas d'`engine.json` ni de page Settings pour en éditer
  par projet (c'est plutôt le territoire de M9) — le moteur garde ses globals à valeur par
  défaut codée en dur (héritage de M5). Le vrai pipeline Engine Field de GB Studio 2.0
  (`precompileEngineFields`/`compileEngineFields`, `engineFieldValues`) est un vrai chantier de
  conception séparé, pas quelque chose à moitié câbler ici.
- **Armes/projectiles, groupes de collision, scripts `updateScript`/`hit1-3Script`, palettes
  par acteur** : tous des concepts 2.0.0-beta5 entièrement nouveaux sans équivalent 1.2.2,
  identifiés par l'agent de recherche mais délibérément pas portés — la scène/l'acteur SNES
  garde son format v1.1.4 pour ces aspects. Cohérent avec le sous-système Projectiles déjà
  différé plusieurs fois dans M5.

### Deux vrais bugs d'environnement trouvés en testant, pas du code cassé

En portant `snesFixedAssets.js` et en écrivant `compileSnesData.js`, deux échecs sont apparus
qui n'avaient **rien à voir** avec la logique portée elle-même — une différence de cible
babel/polyfill entre l'environnement où v1.1.4 avait été écrit et celui de v2 :

1. `[...seen.values()]` (spread d'un itérateur de `Map`) plantait avec `RangeError: Invalid
   array length` dans `snesFixedAssets.js`. Cause : le helper `__spreadArrays` que le babel de
   ce projet génère pour le spread de tableau suppose que chaque source à étaler a une vraie
   propriété `.length` (vrai pour un tableau, faux pour un itérateur de `Map` - `.length` vaut
   `undefined`, la somme accumulée devient `NaN`, `Array(NaN)` lève l'erreur). Corrigé avec
   `Array.from(seen.values())`, qui consomme n'importe quel itérable directement sans passer
   par ce helper.
2. **Bien plus insidieux** : `for (const id of aSet)` où `aSet` est un `Set` construit à la
   volée n'exécutait **jamais le corps de la boucle**, sans la moindre erreur — `spriteConv`
   restait vide après la boucle, provoquant un plantage plus loin (`conv is undefined`) dont la
   vraie cause n'avait aucun rapport visible. Trouvé uniquement en ajoutant des `console.error`
   temporaires ligne par ligne jusqu'à isoler que le corps de boucle ne s'exécutait tout
   simplement pas. Corrigé en convertissant en tableau d'abord
   (`Array.from(new Set(...))`) et en itérant avec une boucle `for` indexée classique plutôt
   qu'un `for...of` sur le `Set` directement. Même classe de piège que le bug précédent
   (itérables "exotiques" non sûrs dans cet environnement), mais silencieux plutôt qu'une
   exception claire - bien plus dangereux. Audité tout le reste des trois fichiers portés pour
   le même motif (`for...of`/spread sur autre chose qu'un tableau brut) : aucune autre occurrence.

### Vérifié de bout en bout, avec un vrai projet, pas seulement une fixture synthétique

`yarn jest` : 559/561 (mêmes 2 échecs préexistants et différés, 11 nouveaux tests pour
`compileSnesData.js` — fixture réelle `Test_Math`, byte du `scene_type` aux 5 valeurs de genre,
`actor.spriteType` indépendant du mouvement).

**La preuve la plus forte** : le vrai projet `test/projects/Test_Math` a été compilé par le
nouveau `compileSnesData.js`, sa sortie écrite dans l'arbre réel du moteur (`appData/src/snes/src/
{assets.c,assets.h,data/*}`, remplaçant temporairement la fixture factice committée), puis
buildé avec la vraie toolchain autonome (`816-tcc`/`816-opt`/`wla-65816`/`wlalink`, pas de
mock) — lien réussi, ROM produite. Démarré dans Mesen (process tué avant et après, résultat
non périmé confirmé) : boot propre 120 frames sans plantage, et surtout — lecture directe de
`script_variables[]` en WRAM confirme `v1=10, v2=25, v3=50, v4=100`, exactement la séquence
`SET_VALUE` du script réel du projet. Preuve de bout en bout, pas juste "ça compile" :
projet réel → JS → bytecode → assemblage/édition de liens réels → exécution réelle correcte.
Arbre moteur remis à l'état committé (`git checkout --`) avant ce commit.

**Pas encore possible malgré M7** : créer ce projet de test depuis l'app elle-même. Il n'y a
toujours aucun template SNES (`snesblank`/`sneshtml` de v1.1.4 pas encore réintégrés) ni
sélecteur de cible dans la page Settings (territoire M9) sur `v2` — pour l'instant, tester un
projet réel suppose soit un `.gbsproj` édité à la main avec `"target": "snes"`, soit ce genre de
vérification directe via jest. Et sans `buildSnesRom.js` (M8), il n'y a encore aucun bouton
"Build ROM" fonctionnel dans l'app pour la cible SNES — M7 fournit le compilateur, pas encore
le chemin utilisateur complet.

## 15. M8 (build ROM SNES sous webpack) — fait, 2026-09-13

Objectif : rendre `buildSnesRom.js`/`compileSnesMusic.js`/`mod2it.js` exécutables depuis
`buildProject()` (le point d'entrée que `buildGame.js`/le webpack build appellent), pour
produire un vrai `.sfc` bootable depuis l'app — pas seulement depuis un test jest qui écrit
directement dans l'arbre du moteur (la méthode utilisée pour vérifier M7).

### Ce qui a été porté

Les trois fichiers (`buildSnesRom.js`, `compileSnesMusic.js`, `mod2it.js`) sont repris de la
version mature v1.1.4 (branche `main`) **quasi verbatim** — contrairement à `compileSnesData.js`
(M7), ils n'ont aucune dépendance sur quoi que ce soit qui a changé dans le passage à
2.0.0-beta5 :

- **`buildSnesRom.js`** — orchestration pure JS (pas de `make`/shell) : `816-tcc → 816-opt →
  wla-65816` par fichier `.c`, `wla-65816` par `.asm`, `linkfile` (+ objets `pvsneslib/lib/
  LoROM_FastROM/*.obj`), `wlalink → build/rom/game.sfc`. LoROM + FastROM, SRAM 8 Ko, header
  généré depuis `devkitsnes/include/hdr.asm.in`.
  Les correctifs asar `resolvePvsHome()` (v1.1.2/v1.1.3 sur `main` — extraction hors
  `app.asar` avant tout `spawn`, cf. la longue note dans CLAUDE.md) s'appliquent tels quels :
  `helpers/fsCopy.js` a déjà `pathExists()` (asar-safe, `fs.lstat` pas `fs.access`) sur `v2`
  depuis M2, réimporté précisément en prévision de ce portage.
- **`compileSnesMusic.js`** — `.mod` du projet → `.it` (via `mod2it.js`) → `smconv -s`
  construit un soundbank à partir du module d'effets vendored (`res/effectssfx.it`, toujours
  module 0) puis des morceaux du projet (modules 1..N). Un morceau illisible/inconvertible
  retombe sur le module d'effets (silencieux, averti) plutôt que de décaler les index suivants.
  Sans musique projet → no-op, l'arbre gardé le soundbank de preuve-de-concept committé.
- **`mod2it.js`** — convertisseur pur `.mod` ProTracker 4 canaux → `.it` Impulse Tracker minimal
  (un instrument passe-plat par échantillon, patterns IT compressés). Zéro dépendance sur le
  reste du compilateur — copié tel quel.

### Câblage dans `buildProject.js`

`resolveTarget()`/`buildProjectSnes()` réintroduits exactement sur le modèle du chemin GB déjà
en place : eject `appData/src/snes` → `compileSnesData` (M7) → écriture `src/assets.{c,h}` +
`src/data/*` (suppression du `assets_spr.asm` périmé) → `compileSnesMusic` → `buildSnesRom`.
Pas d'export web player pour l'instant (`snesEmulatorRoot`/`appData/snes-js-emulator` n'existent
pas encore sur cette branche — territoire M10) ; `buildType` est supposé `"rom"`.

### Une vraie divergence 2.0-only trouvée en testant

`ejectBuild.js` lit **sans filet** `<engineDir>/engine.json`.`version` juste après avoir copié
le moteur (`readEngineVersion`, pas dans un try/catch) — un besoin qui n'existe que depuis
2.0.0-beta5 (les Engine Fields n'existaient pas en 1.2.2, donc `appData/src/snes/engine.json`
n'a jamais existé, même dans la version mature v1.1.4). Sans ce fichier, tout build SNES aurait
planté à l'éjection. Corrigé en ajoutant un `engine.json` minimal (`{"version": "2.0.0-e1",
"fields": []}`) — `fields: []` car le pipeline Engine Fields n'est toujours pas câblé côté SNES
(déferral explicite de M7, territoire M9).

### Vérifié de bout en bout, deux façons

1. **`yarn jest`** : les nouveaux `buildSnesRom.test.js`/`compileSnesMusic.test.js` (gated sur
   la présence de la toolchain vendored, comme `compileSnesData.test.js`) tournent **pour de
   vrai** (pas skip) : `buildSnesRom` seul construit un `.sfc` LoROM/FastROM 8 banques bootable
   depuis le squelette moteur nu ; `compileSnesMusic` + `buildProject()` reconstruisent un
   soundbank réel à partir de la musique `.mod` du projet `Test_SoundEffects` (2 banques,
   `MUSIC_SET_BANKS()` généré) et produisent un `.sfc` bootable. Suite complète : 566/568
   (mêmes 2 échecs préexistants et sans rapport, `entitiesState.test.ts`).
2. **La preuve la plus forte** : un vrai projet (`test/projects/Test_ActorInvoke`, `target:
   "snes"`) construit **par `buildProject()` lui-même** — pas le contournement jest-écrit-dans-
   l'arbre-moteur utilisé pour vérifier M7 — jusqu'à un `.sfc` de 262144 octets (8×32 Ko).
   Démarré dans Mesen (processus tué avant et après le lancement, résultat non périmé) : le
   compteur de tick de la boucle principale (`time`, WRAM) a avancé sur 90 frames
   (235 à la frame 30, débordement 8-bit attendu vers 64 à la frame 120 — confirme une boucle
   qui tourne en continu, pas bloquée) et `scene_index` valait 0, la première scène du projet,
   sans plantage ni gel.

**Ce que ça débloque réellement** : "Build ROM" pour la cible SNES fonctionne maintenant de
bout en bout à travers le vrai point d'entrée `buildProject()` de l'app, la même fonction que
`buildGame.js`/le middleware appellent. Ce qui manque encore pour que l'utilisateur puisse
créer et builder un projet SNES **entièrement depuis l'UI** (sans éditer un `.gbsproj` à la
main) : un template SNES (`snesblank`/`sneshtml` de v1.1.4 pas encore réintégrés) et un
sélecteur de cible dans la page Settings — territoire M9, pas encore commencé.

## 16. M9 (événements — audit des SNES-aware events) — fait, 2026-09-13

Objectif du roadmap : chaque event SNES-aware existant retrouve son comportement
target-aware sous la nouvelle forme des events (types union) de GB Studio 2.0.0-beta5.
Trois étapes précises listées dans la feuille de route.

### Étape 1 — `eventTextDialogue.js`

Le pré-wrap éditeur (ce que l'éditeur découpe en lignes pendant que l'utilisateur tape)
était câblé sur des littéraux GB purs (`maxPerLine = args.avatarId ? 16 : 18`,
`maxTotal = args.avatarId ? 48 : 52`) — aucune notion de cible. Rendu target-aware via
`getTarget(target)`, avec deux nouveaux champs sur `targets/{gb,snes}.js` :
`maxTextTotalChars`/`maxTextTotalCharsWithAvatar` (le budget de caractères combiné sur
toute la boîte, une notion introduite par GB Studio 2.0 — 1.2.2 ne wrappait qu'au niveau
de chaque ligne). La valeur SNES (78/69) est dérivée proportionnellement des nombres
GB déjà réglés par l'équipe GB Studio (52/18, 48/16) faute de constante moteur
équivalente à en dériver directement — même classe de valeur "provisoire mais
documentée" que les autres champs encore non révisés de `targets/snes.js`.

`target` est maintenant propagé depuis Redux (`settings.target`) via
`ScriptEventFormInput`/`ScriptEditorEvent` (tous deux déjà connectés à Redux pour
d'autres besoins — étendus plutôt qu'un nouveau pattern introduit) jusqu'aux appels
`updateFn`/`postUpdate` du champ. `target` non défini retombe sur `"gb"` (comportement
par défaut de `getTarget`), donc tout projet GB existant est inchangé au bit près.
`DialoguePreview.tsx` (le nouvel aperçu live de 2.0) dimensionne maintenant son canvas
sur la vraie largeur d'écran de la cible au lieu d'un `20` codé en dur.

`settings.target` n'est pas encore un vrai réglage Redux migré/éditable dans l'UI (ça,
c'est M10/M11) — ajouté seulement le champ TS `target?: string` à `SettingsState`
maintenant (peuplé aujourd'hui uniquement via le spread JSON brut de `loadProject`) pour
que ce code type-check ; la vraie migration/UI des réglages SNES reste le travail de
M10/M11.

### Étape 2 — `eventCameraMoveTo.js` / `eventOverlayShow.js` / `eventOverlayMoveTo.js`

Vérifié, aucun changement de code nécessaire. Aucun des champs x/y de ces trois events
n'a été fusionné dans les nouveaux champs de type union de GB Studio 2.0 sur cette build
(toujours de simples champs `"number"`) — le clamp target-aware `cameraMoveTo` et le
`scaleOverlayRow` de `scriptBuilder.js` (tous deux du M7) reçoivent donc toujours des
nombres déjà résolus exactement comme avant. Le risque redouté par la feuille de route
("après la fusion en types union") ne s'est pas matérialisé sur cette version bêta.

### Étape 3 — Les 4 events X/Y/L/R

Le chemin de compilation fonctionnait déjà correctement (masque d'input SNES 2 octets
du M7) — le vrai manque était que `InputPicker.js` (le sélecteur de boutons de
l'éditeur) n'avait tout simplement **aucune entrée** pour X/Y/L/R : un auteur de projet
SNES ne pouvait jamais les sélectionner du tout, peu importe la cible. Ajouté une
troisième rangée de boutons (X/Y/L/R, correspondant aux bits `KEY_BITS` de
`compiler/helpers.js`), affichée uniquement quand `settings.target === "snes"`,
réutilisant la logique multi-sélection déjà générique du picker (déjà assez générale
pour le nouveau modèle d'input de GB Studio 2.0 — "attacher un script à plusieurs
boutons à la fois").

### Un vrai bug préexistant trouvé en écrivant le premier test qui exerçait réellement le code

`const trimlines = require("../helpers/trimlines");` (sans `.default`) — `trimlines.js`
exporte sa fonction en `export default`, donc ce `require()` brut renvoyait l'objet de
module entier (`{ default: fn, varRegex, ... }`), pas la fonction elle-même. Résultat :
`updateFn`/`postUpdate` plantaient avec `TypeError: trimlines is not a function` pour
**tout projet, y compris GB**, dès qu'un utilisateur tapait dans la zone de texte d'un
event `TEXT` ou basculait son avatar. Aucun test existant n'appelait jamais ces
fonctions directement (seul `compile()` était couvert) — le bug était invisible jusqu'à
ce que mes propres nouveaux tests l'exercent. Même bug exact, même correctif, dans
`eventMenu.js` et `eventTextChoice.js` (motif de `require` identique).

### Un vrai obstacle d'architecture découvert et résolu

Les fichiers d'event sont chargés dans un bac à sable `vm2` `NodeVM`
(`src/lib/events/index.js`) avec une liste blanche de `require()` autorisés (pour
isoler le code des plugins/events tiers). Importer `targets/index.js` depuis un fichier
d'event exige de l'ajouter à cette liste (`mock: { "../compiler/targets":
compilerTargets }`), comme les 6 autres modules partagés déjà câblés là.

### Vérifié

`yarn jest` : **570/572** (mêmes 2 échecs préexistants et sans rapport, +4 nouveaux
tests couvrant les largeurs de wrap gb/snes/target-indéfini et `postUpdate`).
`electron-forge package` compile et empaquette proprement (webpack + TS, y compris le
chargeur d'events sandboxé). Aucun harnais de test de composant React n'existe dans ce
projet (précédent établi) — les changements sur `InputPicker.js`/`ScriptEditorEvent.js`
sont vérifiés par la compilation complète + la couverture de test déjà existante de la
logique côté compilateur qu'ils appellent, pas par un nouveau test de composant.

## 17. M10 (schéma projet & migrations) — fait, 2026-09-13

Objectif du roadmap : un projet `.gbsproj` SNES sauvegardé en `v1.1.4` s'ouvre et migre
proprement vers le nouveau format 2.0.0. Trois étapes précises.

### Étape 1 — réintégrer les settings SNES dans `migrateProject.js`

Rien à réintégrer, une fois vérifié : `migrateProject.js` ne lit/réécrit jamais
`settings` champ par champ — ses deux migrations qui touchent `settings` (le correctif
`startMoveSpeed`/`startAnimSpeed`, la migration `defaultFadeStyle` →
`engineFieldValues`) font toutes les deux `{ ...data.settings, <champs connus> }`. Tout
réglage non reconnu — SNES ou non — survit donc déjà intact toute la chaîne
`1.0.0`→`2.0.0`→`200r6`. Fixé par un nouveau test dans `migrateProject.test.js`
(`target`/`snesRegion`/`snesSramSize`/`customControlsX-Y-L-R` tous présents inchangés
après migration).

### Étape 2 — écrire l'étape `1.1.x → 2.0.0` pour un projet SNES

Rien à écrire non plus : la chaîne de migration GB existante gère déjà correctement un
vrai projet SNES. Vérifié contre `appData/templates/sneshtml` (un vrai projet SNES
`v1.1.4` déjà committé, toujours à sa forme d'origine `"1.2.0"`/pas de `_release` —
`createProject.js` copie les templates tels quels, seul `loadProjectData.js` migre à
l'ouverture, donc ce fichier n'était en réalité jamais passé par `migrateProject`
auparavant). A spécifiquement exercé la migration "Movement Type → On Update" (sneshtml
a de vrais acteurs `randomWalk`/`faceInteraction`) : `migrateFrom120To200Actors` est
additive (`...actor` avant d'ajouter `updateScript`/`spriteType`), donc l'ancien
`movementType` survit à côté du nouveau champ `updateScript` (inutilisé côté SNES —
cf. l'investigation "On Update" du M5, le moteur n'a toujours pas de mécanisme de
contextes de script parallèles). Aucune régression comportementale : l'IA legacy par
hash par-frame du moteur SNES (`scene.c` `SceneUpdateAi`) lit toujours le `movementType`
préservé, exactement comme avant.

### Étape 3 — fixture de test réelle

`appData/templates/sneshtml` EST déjà cette fixture (le projet d'exemple SNES) —
`test/migrate/migrateSnesProject.test.js` l'utilise directement plutôt que de committer
une deuxième copie des mêmes données : vérifie la forme pré-migration, la version/
release post-migration, la survie des settings SNES, la coexistence
`updateScript`/`movementType`, et une recompilation complète via `compileSnesData()`
sans le moindre avertissement sur les 8 scènes.

### Vérifié au-delà des tests committés

Buildé `sneshtml` (migré) via le vrai point d'entrée `buildProject()` jusqu'à un
`.sfc` réel de 262144 octets, démarré dans Mesen (processus tué avant et après) : le
compteur de tick de la boucle principale avance régulièrement sur 90 frames et
`scene_index` vaut 4 à la frame 120 (la chaîne `SWITCH_SCENE` scriptée de l'intro
tourne réellement, pas juste un boot inerte) — la preuve la plus forte possible qu'un
projet réel migré ne régresse pas.

`yarn jest` : **576/578** (mêmes 2 échecs préexistants et sans rapport, +6 nouveaux
tests).

## 18. M11 (éditeur — Settings, Controls, Navigator) — fait, 2026-09-13

Objectif du roadmap : la page Settings (Target Platform, SNES Options), le pad SNES
dans Controls, et les avertissements target-aware retrouvent leur place dans la
nouvelle UI. Trois étapes.

### Étape 1 — `SettingsPage.tsx`

Nouveau composant `TargetPicker.js` (calqué sur `CartPicker.js` déjà existant) : un
select gb/snes qui écrit dans `settings.target` (le champ TS ajouté en M9 — c'est la
première UI qui l'écrit réellement). Choisir SNES fait apparaître une carte "SNES
Options" (région NTSC/PAL, taille de SRAM — deux réglages que `buildSnesRom.js` lit
déjà avec des valeurs par défaut sensées depuis le M8, juste sans UI) plus un `Alert`
listant les vrais manques actuels côté SNES (peinture de palette, Engine Fields,
armes/projectiles, budget de 8 feuilles de sprites par scène, pas encore de lecteur
web) pour ne pas laisser l'auteur du projet deviner. Choisir SNES masque aussi les
cartes/menus "GB Color Options" et "Cartridge Type" (concepts GB/MBC sans signification
SNES), même pattern que le portage v1.1.4 mature. Nouvelles clés l10n ajoutées
uniquement dans `en.json` — le mécanisme de repli de `l10n.js` (la table `translations`
itère sur les clés d'`en.json` lui-même) fait retomber automatiquement toute autre
locale sur l'anglais pour elles ; pas de mise à jour des 13 locales tentée ici.

### Étape 2 — `CustomControlsPicker.js`

Quatrième rangée de champs de touches pour X/Y/L/R (`compiler/helpers.js` `KEY_BITS`),
affichée uniquement quand `settings.target === "snes"`, réutilisant la logique
existante de liste à plat/multi-touches sans changement. `GBControlsPreview.js` s'est
avéré être du code mort sur cette branche (jamais référencé nulle part) — pas de
"SNESControlsPreview" inventé en écho ; l'UI Controls de cette build est une simple
liste de bindings, pas le widget grille+aperçu du v1.1.4 mature.

### Étape 3 — deux vrais points GB-codés-en-dur trouvés et rendus target-aware

- **`SceneInfo.js`** (les badges de budget acteur/sprite/trigger par scène) lisait
  directement les constantes GB-only de `consts.js` — lit maintenant
  `getTarget(settings.target)`. `maxActorsSmall` est `null` côté SNES (pas de
  distinction petite/grande scène sur ce moteur), géré explicitement plutôt que de
  produire un NaN silencieux. Le badge "nombre de frames" devient un badge "nombre de
  feuilles" sur SNES (`maxSpriteFrames` `null` là-bas vs `maxSpriteSheets: 8`) — le
  budget VRAM par frame de GB n'a pas d'équivalent SNES, mais le budget fixe de 8
  feuilles par scène du moteur SNES (`compileSnesData.js` `SPRITE_SLOTS`) en a un, et
  `usedSpriteSheets` était déjà collecté de toute façon.
- **`EventHelper.js`** (le rectangle de viewport affiché sur l'événement Camera:MoveTo)
  était codé en dur à la taille d'écran GB (160×144px, CSS) — dimensionné maintenant en
  ligne depuis `getTarget(target).screenTileWidth/Height`, `target` propagé depuis
  `Scene.js` (qui calculait déjà `settings` localement pour d'autres champs, juste pas
  encore exposé comme prop). La règle sœur `.EventHelper__OverlayPos` reste intacte —
  confirmée toujours morte/non référencée sur cette branche aussi, et sa boîte fixe
  256×256 couvre déjà confortablement les deux tailles d'écran réelles de toute façon.

`target` non défini retombe partout sur `"gb"` (comportement par défaut de
`getTarget`), donc l'UI de tout projet GB existant est inchangée.

### Vérifié

`yarn jest` : **576/578** (mêmes 2 échecs préexistants et sans rapport, aucune
régression — pas de nouveau test de composant, aucun harnais de ce type n'existe sur
ce projet, même précédent que les changements `InputPicker`/`ScriptEditorEvent` du
M9). `electron-forge package` compile proprement (webpack + TS). Un vrai lancement
`yarn start` (compilé, webpack buildé, fenêtre app lancée sans erreur de rendu dans le
journal) confirme qu'il ne plante pas au démarrage ; arrêté proprement ensuite. eslint
sur chaque fichier touché : zéro nouveau problème (le seul avertissement introduit en
chemin, une destructuration `scene` inutilisée dans `SceneInfo.js`, trouvé et corrigé
avant le commit).

### M11 — addendum, 2026-09-14 (trouvé par l'utilisateur en testant l'app réelle)

L'écran "New Project" (`Splash.tsx`) ne proposait que 3 templates (gbs2/gbhtml/blank) —
aucun moyen de créer un projet SNES depuis l'UI de l'app, alors que
`appData/templates/{sneshtml,snesblank}` existent sur cette branche depuis avant le M2
(déjà confirmés empaquetés dans `app.asar` à l'époque) et que tout le chemin
`createProject()`→`migrateProject()`→`compileSnesData()` était déjà vérifié bout en
bout contre eux (M10). Aucun des 14 jalons ne nommait explicitement cette liste UI —
jamais touchée jusqu'ici. Corrigé en ajoutant deux entrées à `Splash.tsx` (id
`sneshtml`/`snesblank` — `createProject()` résout déjà un id directement vers son
dossier `appData/templates/<id>`, rien d'autre à câbler). Images d'aperçu : `snesblank`
réutilise son propre fond `placeholder.png` (comme le "blank" GB dont l'aperçu est déjà
son propre canevas vide, pas une capture) ; `sneshtml` utilise son art `outside.png`.
Une vraie capture Mesen a été tentée en premier (ROM buildée, `emu.takeScreenshot()`)
mais l'intro Logo/Titre du jeu de démo exige un appui Start pour atteindre une scène
avec du vrai art de jeu, et l'investigation de cette session (déjà close) sur la
simulation d'input Lua dans Mesen a établi que ce n'est pas fiable ici — une image de
fond statique est honnête et rend mieux qu'une capture "TITLE SCREEN" noire de toute
façon. Nouveau test (aucune couverture `createProject` n'existait avant du tout sur
cette branche) : `test/data/project/createSnesProject.test.js`. `yarn jest` :
**578/580** (mêmes 2 échecs préexistants, +2 nouveaux tests).

### M11 — addendum 2, 2026-09-14 (même jour, trouvé en testant l'ajout ci-dessus)

`SplashTemplateSelectOptions` était une seule rangée flex sans `flex-wrap` — les 5
tuiles (3 GB + 2 SNES) débordaient hors de l'écran au lieu de passer à la ligne (capture
d'écran de l'utilisateur montrant la 5e tuile coupée au bord de la fenêtre). Corrigé :
`Template`/`TemplateInfo` gagnent un champ optionnel `group` ; `SplashTemplateSelect`
rend maintenant une rangée par groupe distinct (ordre de première apparition), avec un
petit label au-dessus de chaque rangée dès qu'il y a plus d'un groupe — "Game Boy" et
"Super Nintendo" sur deux rangées bien séparées au lieu d'une bande qui déborde. Une
liste à un seul groupe (ou sans `group`) reste rendue exactement comme avant — additif,
pas une refonte. `flex-wrap` ajouté aussi à la rangée elle-même en filet de sécurité
indépendant pour une fenêtre étroite. Vérifié : `electron-forge package` compile
proprement, `yarn jest` toujours 578/580, `yarn start` démarre sans erreur.

### M11 — addendum 3, 2026-09-14 (même jour, signalé par l'utilisateur)

Deux symptômes rapportés ensemble, même cause : "on ne voit plus l'explication en
cliquant sur un template" + "il faut que la fenêtre soit plus haute, on ne voit pas la
fin pour la SNES". La fenêtre Splash (`main.ts`) est une `BrowserWindow` fixe
640×400, non redimensionnable, et rien dans son contenu ne scrolle — dimensionnée à
l'origine pour exactement une rangée de tuiles sans label. Avec la rangée SNES
labellisée ajoutée en dessous (addendum 2), le contenu dépasse les 400px et le bas
de la fenêtre (2e rangée + description du template sélectionné) est purement coupé
par le bord de la fenêtre OS. Corrigé : `height: 400` → `560`. Vérifié :
`electron-forge package` compile, `yarn jest` toujours 578/580, `yarn start` démarre
sans erreur.

## 19. Portage des correctifs d'exécution Linux/macOS depuis `main` (tag `v1.1.5`)

Pendant une pause sur `v2`, trois bugs d'exécution SNES sur `main` (Linux/macOS) ont
été trouvés et corrigés par l'utilisateur en conditions réelles, aboutissant à la
release `v1.1.5` : (1) le toolchain PVSnesLib extrait de `app.asar` perdait son bit
exécutable au runtime (`fsCopy.js` `copyFile()` n'appliquait jamais de `chmod`) —
"spawn .../smconv EACCES" ; (2) le toolchain macOS vendoré sous
`buildTools/darwin-x64/pvsneslib/` contenait en réalité des binaires **arm64**
(compilés par la CI sur des runners macOS arm64-only), mal étiquetés — inoffensif sur
Apple Silicon réel (Rosetta), mais aurait cassé net sur un vrai Mac Intel ; (3) le
toolchain Linux vendoré exigeait une glibc trop récente (`GLIBC_2.38`, compilé sur le
runner `ubuntu-latest` de PVSnesLib, plus récent que l'Ubuntu réel de l'utilisateur).

Audit de `v2` : les bugs (1) et (2) étaient **identiques** ici — `fsCopy.js` et
`resolvePvsHome()` (`buildSnesRom.js`) sur `v2` correspondaient à l'état de `main`
*avant* ces correctifs (le port SNES de M2/M8 avait recopié la logique de l'époque,
avant que `main` ne les corrige plus tard sur ses propres utilisateurs réels). Le bug
(3) ne s'applique pas : le toolchain Linux vendoré sur `v2` a un plancher glibc déjà
bas (`GLIBC_2.4`/`2.7`, vérifié en scannant les binaires) — aucune reconstruction
nécessaire.

Correctifs (1) et (2) portés tels quels (adaptés au contexte `v2`, pas un simple
copier-coller de diff, le fichier `fsCopy.js` d'ici ayant divergé) :
- `src/lib/helpers/fsCopy.js` — `copyFile()` force et vérifie désormais le mode du
  fichier de destination (`fs.chmod` explicite après écriture, `mode` fourni gagne
  toujours sur le mode de la source) ; corrige aussi une vraie race déjà présente
  (la promesse se résolvait sur l'évènement `'end'` du flux d'entrée au lieu de
  `'finish'` sur le flux de sortie). Nouveau test `test/helpers/fsCopy.test.js`
  (aucune couverture n'existait ici avant), porté depuis `main`.
- `src/consts.js` (+ `src/__mocks__/consts.js`) — nouvel helper
  `pvsneslibVendorDir()` qui résout toujours vers `darwin-arm64` sur macOS, quel que
  soit `process.arch` (qui rapporte toujours `"x64"` sous Rosetta).
- `buildTools/darwin-x64/pvsneslib/` → `buildTools/darwin-arm64/pvsneslib/` (déplacé
  par `git mv`, contenu inchangé) ; `gbdk`/`mod2gbt` restent sous `darwin-x64`,
  réellement x64.
- `src/lib/compiler/buildSnesRom.js` `resolvePvsHome()` — utilise
  `pvsneslibVendorDir()`, force `mode: 0o755` sur l'extraction hors `app.asar`, et
  ajoute un marqueur `.extracted-ok` (protège contre une extraction interrompue
  laissant un cache à moitié copié).
- `src/lib/compiler/makeBuild.js` — même `mode: 0o755` explicite sur sa propre copie
  du toolchain GBDK (`ensureBuildTools.js`, ici, l'avait déjà — pas touché).
- `after-copy.js` (hook `afterCopy` d'electron-packager) — copie désormais deux
  dossiers `buildTools/` sur macOS (`darwin-x64` + `darwin-arm64`) au lieu d'un seul,
  sinon le toolchain SNES packagé disparaîtrait purement et simplement une fois
  déplacé hors de `darwin-x64`.
- `appData/src/snes/tools/gen-sfx.js` (script développeur autonome, hors chemin de
  build) — même correction de chemin `darwin-arm64`, portée depuis `main`.
- `test/data/compiler/buildSnesRom.test.js` / `compileSnesMusic.test.js` —
  reconstruisaient chacun le chemin `${platform}-${arch}/pvsneslib` en dur ; utilisent
  maintenant `pvsneslibVendorDir()`.

Vérifié : `yarn jest fsCopy buildSnesRom compileSnesMusic` → 10 passés, 3 skip
(Windows, tests de bit exécutable POSIX). `yarn test` complet → 581/586 (mêmes 2
échecs préexistants et sans rapport dans `entitiesState.test.ts`, confirmés
indépendants de ce portage en rejouant le même test sur l'arbre non modifié via
`git stash`). Pas de test macOS/Linux réel possible depuis ce poste Windows — la
correction du mode d'exécution reproduit exactement la logique déjà validée en
conditions réelles sur `main`/`v1.1.5`.

## 20. M12, partie 1 — web player SNES / bouton Play (fait, 2026-09-16)

`appData/snes-js-emulator/` était déjà présent sur `v2` (M2) et **strictement
identique** à la version déjà entièrement peaufinée de `main` (`git diff main --
appData/snes-js-emulator` vide : start-gate, pad tactile, persistance SRAM,
CSS compatible vieux Chromium — tout y était déjà). Ce qui manquait, c'était le
branchement : `buildProjectSnes()` (`buildProject.js`) ignorait purement et
simplement `buildType` et ne savait produire qu'une ROM, jamais un export "web"
— commentaire du code lui-même : "No web-player export yet on this branch (M10
territory)".

Porté depuis `main` (adapté, pas un copier-coller — `buildProjectSnes` d'ici a
une signature et des détails différents, `profile`/`engineFields` notamment) :
- `buildProject.js` — extrait la logique web (déjà dupliquée dans le chemin GB)
  dans un helper partagé `buildWebPlayer()`, réutilisé par les deux chemins
  GB et SNES ; `customControls` inclut maintenant `x`/`y`/`l`/`r` (ignorés par
  le player GB, lus par le player SNES).
- `consts.js` (+ mock) — nouvel export `snesEmulatorRoot`.
- `buildGameMiddleware.ts` — calcule `target`/`romName` (`game.sfc` vs
  `game.gb`) comme le faisait déjà `main`'s `buildGame.js`, et transmet
  `target` au 2e argument de l'IPC `open-play` (avant : juste l'URL, aucune
  information de plateforme).
- `main.ts` `createPlay()` — devient target-aware : fenêtre `560×600` pour
  SNES au lieu de la taille GB (`494×471`/`480×454`), avec `minWidth`/
  `minHeight`. Sans ça, le bouton Play SNES aurait ouvert une fenêtre trop
  petite pour le canevas 512×480 du player (bug déjà rencontré et corrigé sur
  `main`, "the game just showed the black boot frame").
- Nouveau test `test/data/compiler/snesWebPlayer.test.js` (porté tel quel
  depuis `main`), y compris la partie gated par le toolchain (build web réel).

**Vérifié en conditions réelles, pas seulement par les tests** — `yarn start`,
sélection du template "Sample Project (SNES)" (screenshot : templates GB/SNES
sur deux rangées distinctes, confirmant que le fix M11 du splash tient
toujours), migration `1.2.0 → 2.0.0` acceptée, les 8 scènes de l'exemple
s'affichent normalement (tailles SNES 256×224). Clic sur le bouton Play de la
barre d'outils : log de build affiché en direct (`816-tcc`/`wla-65816`/
`wlalink` réels, `Soundbank built`, `ROM ready (LoROM FastROM, 8 banks)`,
`Build Time: 4160ms`), fenêtre Play ouverte à la taille SNES attendue avec
l'overlay de démarrage ("▶ Play"), et après clic sur ce bouton **le jeu tourne
réellement** — "YOUR LOGO" (scène Logo) s'affiche, barre de statut du player :
`Loaded LoROM rom: "SANS TITRE"; Banks: 8; Sram size: $2000`. Pas d'écran noir,
pas d'erreur de rendu. `yarn jest snesWebPlayer buildProject` → 4/4 (dont le
test toolchain-gated, exécuté pour de vrai avec le toolchain `win32-x64`
vendoré) ; `yarn test` complet toujours 584/589 (mêmes 2 échecs préexistants).
