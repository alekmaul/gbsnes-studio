# Documentation

Source de la documentation publiée sur https://alekmaul.github.io/gbsnes-studio/,
construite par le workflow `.github/workflows/build-docs.yml` (job **BuildDocs**) à chaque
push sur `main` qui touche ce dossier.

Basée sur Jekyll + le thème [just-the-docs](https://github.com/just-the-docs/just-the-docs)
(déclaré comme une vraie gem dans le `Gemfile`, pas en "remote theme" - BuildDocs fait son
propre build via Actions, donc pas besoin du contournement que `remote_theme` fournit pour le
builder natif de GitHub Pages).

## Aperçu local

```bash
cd docs
gem install bundler
bundle install
bundle exec jekyll serve
```

Puis ouvrir http://localhost:4000/gbsnes-studio/

## Ajouter une page

Chaque page est un fichier `.md` avec un frontmatter YAML qui pilote la navigation :

```markdown
---
title: Titre de la page
nav_order: 10
---
```

Pour une page avec des sous-pages, ajouter `has_children: true` sur la page parente, et sur
chaque enfant :

```markdown
---
title: Sous-page
parent: Titre de la page parente
nav_order: 1
---
```

## Configuration GitHub Pages requise (une fois)

Repo Settings → Pages → Source = **"GitHub Actions"** (pas "Deploy from a branch" - le
workflow BuildDocs gère le déploiement lui-même).
