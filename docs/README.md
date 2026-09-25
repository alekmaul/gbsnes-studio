# Documentation

Source for this branch's documentation. **Not currently deployed** - `.github/workflows/
build-docs.yml` (job **BuildDocs**) was removed from `v4` on purpose: `main`'s own copy of
that workflow is the only one allowed to publish to https://alekmaul.github.io/gbsnes-studio/
(the repo's single GitHub Pages site). Both branches deploying there was tried briefly and
reverted - whichever branch pushed to `docs/**` last silently won, overwriting the other's
site, which isn't an acceptable state long-term. This `docs/` tree stays as source (and can
still be previewed locally, see below) until the two docs sites are properly reconciled into
one deployed site.

Built with Jekyll + the [just-the-docs](https://github.com/just-the-docs/just-the-docs) theme,
declared as a real gem in `Gemfile` (not `remote_theme` - kept for when BuildDocs is
reinstated here, since Actions-based builds don't need the workaround `remote_theme` provides
for GitHub Pages' native builder, and Bundler resolves the theme's own dependencies
automatically).

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
was tried first on `main` and didn't take effect: the theme gem ships its own placeholder file
at that same relative path, and it won over the site's copy in Jekyll's Sass load-path order.)
