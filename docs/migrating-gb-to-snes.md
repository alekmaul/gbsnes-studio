---
title: Migrer un projet GB vers SNES
nav_order: 9
---

# Migrer un projet Game Boy vers SNES

GBSNES Studio se concentre désormais sur la cible SNES. Si vous avez un ancien projet
ciblant Game Boy, voici comment le faire pointer vers SNES.

## Changer la cible

Ouvrez le fichier `.gbsproj` du projet (un fichier JSON) et ajoutez, ou modifiez, dans
l'objet `settings` :

```json
"settings": {
  "target": "snes"
}
```

L'absence de ce champ équivaut à `"gb"` (comportement par défaut historique).

Les réglages spécifiques à SNES (`snesRegion`, `snesSramSize`, `snesRomBanks`) sont
optionnels — des valeurs par défaut raisonnables sont appliquées si absents, et ils
apparaissent dans Settings une fois le projet rouvert avec la cible SNES.

## Ce qui ne se convertit pas automatiquement

Changer ce seul champ permet de *tenter* la compilation en SNES, mais ne garantit pas un
résultat visuel ou fonctionnel identique sans retouche :

- **Taille des fonds** — la Game Boy affiche en 160×144px, la SNES attend au minimum
  256×224px. Un fond trop petit compile toujours (juste un avertissement dans l'éditeur),
  mais s'affichera plus petit que l'écran SNES.
- **Compatibilité des événements de script** — certains événements Game Boy n'ont pas
  d'équivalent, ou sont inertes, sur SNES. Voir la liste complète (à jour) dans le dépôt du
  moteur : `appData/src/snes/EVENTS.md`.

<!-- TODO: étoffer avec des captures d'écran / exemples concrets -->
