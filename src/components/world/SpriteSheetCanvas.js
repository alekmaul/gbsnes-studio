import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import debounce from "lodash/debounce";
import { assetFilename } from "../../lib/helpers/gbstudio";
// eslint-disable-next-line import/no-unresolved
import SpriteSheetCanasWorker from "./SpriteSheetCanvas.worker";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import {
  effectiveFrameSequence,
  isFrameSequenceEligible,
} from "../../lib/helpers/frameSequence";

const workerPool = [];
for(let i=0; i<navigator.hardwareConcurrency; i++) {
  workerPool.push(new SpriteSheetCanasWorker())
}

let id = 0;

const SPRITE_SIZE = 16;

class SpriteSheetCanvas extends Component {
  constructor(props) {
    super(props);
    this.canvas = React.createRef();
    this.image = null;
    this.offscreen = false;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("bitmaprenderer");    
    this.id = id++;
    this.worker = workerPool[Math.floor(workerPool.length * Math.random())];    
    this.debouncedDraw = debounce(this.draw, 16);
  }

  componentDidMount() {
    this.debouncedDraw();
    this.worker.addEventListener("message", this.onWorkerComplete);
  }

  shouldComponentUpdate(nextProps) {
    const { direction, frame, rawFrame, spriteSheet } = this.props;
    return (
      nextProps.direction !== direction ||
      nextProps.frame !== frame ||
      nextProps.rawFrame !== rawFrame ||
      spriteSheet !== nextProps.spriteSheet
    );
  }

  componentDidUpdate(prevProps) {
    const { direction, frame, rawFrame } = prevProps;
    const {
      projectRoot,
      spriteSheet,
      direction: nextDirection,
      frame: nextFrame,
      rawFrame: nextRawFrame,
    } = this.props;
    const newSrc = this.imageSrc(projectRoot, spriteSheet);
    if (
      newSrc !== this.src ||
      direction !== nextDirection ||
      frame !== nextFrame ||
      rawFrame !== nextRawFrame
    ) {
      this.debouncedDraw();
    }
  }

  componentWillUnmount() {
    this.worker.removeEventListener("message", this.onWorkerComplete);
  }

  draw = () => {
    const { projectRoot, spriteSheet = {}, direction = "down", frame } = this.props;
    let { rawFrame } = this.props;
    if (this.canvas && this.canvas.current && spriteSheet) {
      // A static sheet with an edited frame list: frame N is the list's N-th
      // entry (a PNG frame index), the same frame the compiled ROM shows.
      if (
        rawFrame === undefined &&
        spriteSheet.frameSequence &&
        isFrameSequenceEligible(spriteSheet)
      ) {
        const seq = effectiveFrameSequence(spriteSheet);
        rawFrame = seq[(frame || 0) % seq.length];
      }
      // M9.4 follow-up (user-found: a Free-form actor placed on a scene
      // still showed as a plain 16x16 sprite) - this worker drew a flat,
      // single-16x16-frame crop with no knowledge of metaspriteMode at
      // all. Pass the real composed canvas size + placed-tile data through
      // when it's set, so the worker can draw the actor's real shape
      // instead of always assuming 16x16.
      const width = spriteSheet.metaspriteMode ? spriteSheet.canvasWidth || SPRITE_SIZE : SPRITE_SIZE;
      const height = spriteSheet.metaspriteMode ? spriteSheet.canvasHeight || SPRITE_SIZE : SPRITE_SIZE;
      if (this.canvas.current.width !== width || this.canvas.current.height !== height) {
        this.canvas.current.width = width;
        this.canvas.current.height = height;
      }
      this.worker.postMessage({
        src: this.imageSrc(projectRoot, spriteSheet),
        width,
        height,
        id: this.id,
        numFrames: spriteSheet.numFrames,
        type: spriteSheet.type,
        direction,
        frame,
        rawFrame,
        metaspriteMode: spriteSheet.metaspriteMode,
        animationType: spriteSheet.animationType,
        metasprites: spriteSheet.metasprites,
        metaspriteTiles: spriteSheet.metaspriteTiles,
      });
    }
  };

  onWorkerComplete = (e, a, b) => {
    if (this.offscreenCanvas && this.offscreenCtx && e.data.id === this.id) {
      const ctx = this.canvas.current.getContext("2d");
      this.offscreenCtx.transferFromImageBitmap(e.data.canvasImage);
      // Clear the canvas element's own real size, not a fixed SPRITE_SIZE -
      // a metaspriteMode sheet's canvas can be taller/wider than 16x16 (see
      // draw() above).
      ctx.clearRect(0, 0, this.canvas.current.width, this.canvas.current.height);
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
  };

  imageSrc = (projectRoot, spriteSheet) => {
    return (
      spriteSheet &&
      `file://${assetFilename(projectRoot, "sprites", spriteSheet)}?_v=${
        spriteSheet._v
      }`
    );
  };

  render() {
    const { spriteSheet, style } = this.props;
    const width =
      (spriteSheet && spriteSheet.metaspriteMode && spriteSheet.canvasWidth) ||
      SPRITE_SIZE;
    const height =
      (spriteSheet && spriteSheet.metaspriteMode && spriteSheet.canvasHeight) ||
      SPRITE_SIZE;
    return (
      <canvas ref={this.canvas} width={width} height={height} style={style} />
    );
  }
}

// SpriteSheetCanvas.propTypes = {
//   spriteSheetId: PropTypes.string.isRequired,
//   projectRoot: PropTypes.string.isRequired,
//   direction: PropTypes.string,
//   frame: PropTypes.number,
//   spriteSheet: PropTypes.shape({
//     filename: PropTypes.string.isRequired,
//     type: PropTypes.string.isRequired,
//     _v: PropTypes.number
//   }),
// };

SpriteSheetCanvas.defaultProps = {
  direction: "down",
  frame: 0,
  spriteSheet: null,
  // Undefined by default - legacy consumers keep relying purely on CSS
  // (e.g. `.Actor canvas { top: -8px }`, which assumes a 16x16 sprite).
  // Actor.js passes a real override for a metaspriteMode sheet, whose
  // composed size that fixed CSS can't account for - an inline style wins
  // the cascade over a class rule, so this cleanly overrides it only when
  // actually needed.
  style: undefined,
};

function mapStateToProps(state, props) {
  const spriteSheet = spriteSheetSelectors.selectById(state, props.spriteSheetId);
  return {
    spriteSheet,
    projectRoot: state.document && state.document.root
  };
}

export default connect(mapStateToProps)(SpriteSheetCanvas);
