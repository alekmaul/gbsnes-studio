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
