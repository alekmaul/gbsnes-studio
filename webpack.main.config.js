const Path = require("path");
const plugins = require("./webpack.plugins");
const CopyPlugin = require("copy-webpack-plugin");

const mainPlugins = [].concat(
  plugins,
  new CopyPlugin([
    { from: "node_modules/about-window", to: "node_modules/about-window" }
  ]) 
);

module.exports = {
  target: "electron-main",
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: "./src/main.ts",
  // Put your normal webpack config below here
  module: {
    rules: require("./webpack.rules")
  },
  plugins: mainPlugins,
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
    alias: {
      store: Path.resolve(__dirname, "src/store"),
      lib: Path.resolve(__dirname, "src/lib"),
      ui: Path.resolve(__dirname, "src/components/ui"),
      components: Path.resolve(__dirname, "src/components"),
    }
  },
  externals: {
    "about-window": "about-window"
  }
};
