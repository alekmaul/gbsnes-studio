/* eslint-disable global-require */
module.exports = {
  make_targets: {
    win32: ["squirrel", "zip"],
    darwin: ["zip"],
    linux: ["deb", "rpm"]
  },
  electronPackagerConfig: {
    name: "GBSNES Studio",
    executableName: "gbsnes-studio",
    packageManager: "yarn",
    icon: "src/assets/app/icon/app_icon",
    darwinDarkModeSupport: true,
    extendInfo: "src/assets/app/Info.plist",
    extraResource: ["src/assets/app/icon/gbsproj.icns"],
    afterCopy: ["./after-copy"],
    asar: true,
    appBundleId: "dev.gbstudio.gbstudio",
    // Code-sign the .app locally, but skip it on CI (no Apple identity there —
    // electron-osx-sign would fail trying to auto-discover one). CI produces an
    // unsigned build; the notarize hook already no-ops without APPLE_ID.
    osxSign: process.env.CI
      ? false
      : {
          "hardened-runtime": true,
          "gatekeeper-assess": false,
          entitlements: "./entitlements.plist",
          "entitlements-inherit": "./entitlements.plist"
        },
    ignore: [
      "/.vscode($|/)",
      "/coverage($|/)",
      "/test($|/)",
      "/appData($|/)",
      "/buildTools($|/)"
    ]
  },
  electronWinstallerConfig: {
    name: "gbsnes_studio",
    exe: "gbsnes-studio.exe",
    loadingGif: "src/assets/app/install.gif"
  },
  electronInstallerDebian: {},
  electronInstallerRedhat: {},
  github_repository: {
    owner: "",
    name: ""
  },
  electronInstallerDMG: {
    background: "src/assets/app/dmg/background.tiff",
    format: "ULFO"
  },
  windowsStoreConfig: {
    packageName: "",
    name: "gbsnesstudio"
  },
  hooks: {
    postPackage: require("./src/hooks/notarize.js")
  }
};
