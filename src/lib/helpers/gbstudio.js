/* eslint-disable import/prefer-default-export */
import Path from "path";

export const zoomForSection = (section, editor) => {
  if (section === "world") {
    return editor.zoom;
  }
  if (section === "sprites") {
    return editor.zoomSprite;
  }
  if (section === "backgrounds") {
    return editor.zoomImage;
  }
  if (section === "ui") {
    return editor.zoomUI;
  }
  return 100;
};

export const assetFilename = (projectRoot, assetType, asset) => {
  return (asset.plugin
    ? Path.join(projectRoot, "plugins", asset.plugin, assetType, asset.filename)
    : Path.join(projectRoot, "assets", assetType, asset.filename)
  ).replace(/\\/g, "/");
};
