---
title: Importing a GB Studio project
nav_order: 9
---

# Importing a GB Studio project

If you already have a project made with [GB Studio](https://www.gbstudio.dev/) (the
`.gbsproj` file), you can open it directly in GBSNES Studio and switch it to build for SNES.

{: .important }
> GBSNES Studio is based on **GB Studio 1.2.2**. A `.gbsproj` created or last opened with a
> much newer GB Studio version (3.x/4.x) may use project features or a file format that
> didn't exist yet in 1.2.2, and might not open cleanly, or at all. Projects from GB Studio
> 1.2.2 (or close to it) are the safest bet.

## 1. Open the project

Open the `.gbsproj` file in GBSNES Studio like any other project (File > Open, or drag it
onto the app). The app runs its usual project migration on load, the same way GB Studio
itself upgrades an older project when you open it in a newer version.

## 2. Switch the target to SNES

By default, an imported project still targets Game Boy. Open the `.gbsproj` file (a JSON
file) in a text editor and add, or change, this inside the `settings` object:

```json
"settings": {
  "target": "snes"
}
```

If this field is missing entirely, it's treated as `"gb"`.

See [Migrating a GB project to SNES](migrating-gb-to-snes.html) for what else to check after
switching the target (background sizes, scripting event compatibility).
