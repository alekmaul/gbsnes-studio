/* eslint-disable global-require */
module.exports = {
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "gbsnes_studio",
        exe: "gbsnes-studio.exe",
        loadingGif: "src/assets/app/install.gif",
        setupIcon: "src/assets/app/icon/app_icon.ico",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "win32"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
  packagerConfig: {
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
          "entitlements-inherit": "./entitlements.plist",
        },
  },
  hooks: {
    postPackage: require("./src/hooks/notarize.js"),
  },
  plugins: [
    [
      "@electron-forge/plugin-webpack",
      {
        mainConfig: "./webpack.main.config.js",
        renderer: {
          config: "./webpack.renderer.config.js",
          entryPoints: [
            {
              html: "./src/project.html",
              js: "./src/ProjectRoot.js",
              name: "main_window",
              additionalChunks: [
                "vendor-react",
                "vendor-scriptracker",
                "vendor-hotloader",
                "vendor-lodash",
                "vendor-chokidar",
              ],
            },
            {
              html: "./src/splash.html",
              js: "./src/SplashRoot.js",
              name: "splash_window",
              additionalChunks: [
                "vendor-react",
                "vendor-hotloader",
                "vendor-lodash",
              ],
            },
            {
              html: "./src/preferences.html",
              js: "./src/PreferencesRoot.js",
              name: "preferences_window",
              additionalChunks: [
                "vendor-react",
                "vendor-hotloader",
                "vendor-lodash",
              ],
            },
          ],
        },
      },
    ],
  ],
};
