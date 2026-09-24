# Documentation

Source for the documentation published at https://alekmaul.github.io/gbsnes-studio/, built by
the `.github/workflows/build-docs.yml` workflow (job **BuildDocs**) on every push to `main`
that touches this folder.

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

## Custom styling

`_includes/head_custom.html` is just-the-docs' documented custom-`<head>` injection point -
included unconditionally at the end of the theme's own `head.html`. Currently holds a
`<style>` block giving every in-page image (`.main-content img`) a drop shadow. (A Sass
override at `_sass/custom/custom.scss` - the theme's *other* documented customization point -
was tried first and didn't take effect: the theme gem ships its own placeholder file at that
same relative path, and it won over the site's copy in Jekyll's Sass load-path order.)

## Required GitHub Pages configuration (one-time)

Repo Settings → Pages → Source = **"GitHub Actions"** (not "Deploy from a branch" - the
BuildDocs workflow handles deployment itself).
