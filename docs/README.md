# Documentation

Source for the documentation published at https://alekmaul.github.io/gbsnes-studio/, built by
the `.github/workflows/build-docs.yml` workflow (job **BuildDocs**) on every push to `v4`
that touches this folder.

> This same GitHub Pages deployment is also targeted by `main`'s own BuildDocs workflow
> (a separate, still-GBSNES-Studio-branded `docs/`) - a known, accepted risk of both
> branches sharing one repo's Pages site. Whichever branch pushes to `docs/**` last wins
> until the two docs sites are actually reconciled.

Built with Jekyll + the [just-the-docs](https://github.com/just-the-docs/just-the-docs) theme,
declared as a real gem in `Gemfile` (not `remote_theme` - BuildDocs does its own build via
Actions, so none of the workaround `remote_theme` provides for GitHub Pages' native builder is
needed, and Bundler resolves the theme's own dependencies automatically).

## Local preview

```bash
cd docs
gem install bundler
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000/gbsnes-studio/

## Adding a page

Each page is a `.md` file with YAML frontmatter that drives navigation:

```markdown
---
title: Page title
nav_order: 10
---
```

For a page with sub-pages, add `has_children: true` to the parent page, and on each child:

```markdown
---
title: Sub-page
parent: Parent page title
nav_order: 1
---
```

Colored callout boxes (see `_config.yml`'s `callouts:`) are available in any page:

```markdown
{: .warning }
> This is a warning callout.
```

## Required GitHub Pages configuration (one-time)

Repo Settings → Pages → Source = **"GitHub Actions"** (not "Deploy from a branch" - the
BuildDocs workflow handles deployment itself).
