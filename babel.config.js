module.exports = {
  presets: [
    [
      "env",
      {
        targets: {
          node: "current"
        }
      }
    ]
  ],
  plugins: [
    "transform-class-properties",
    "transform-async-to-generator",
    "transform-object-rest-spread",
    "transform-es2015-classes"
  ]
};
