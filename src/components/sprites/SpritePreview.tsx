import React, {
  Dispatch,
  FC,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { framesPerDirection } from "../../lib/helpers/gbstudio";
import {
  effectiveFrameSequence,
  isFrameSequenceEligible,
} from "../../lib/helpers/frameSequence";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { Button } from "../ui/buttons/Button";
import { CaretRightIcon, PauseIcon, PlayIcon } from "../ui/icons/Icons";

// Center column, top: a live preview of the sheet's own already-compiled
// animation (direction "down", walking through framesPerDirection() poses).
// Deliberately always shows the sheet's real auto-detected rendering, the
// same one ActorEditor/SpriteSheetSheetSelectButton show elsewhere - the
// animationType override in the right-hand inspector only changes what gets
// compiled, not this shared, widely-reused preview component's own contract.
// See SPRITE_EDITOR_PROGRESS.md.

const PLAY_INTERVAL_MS = 400;

const Wrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

// The playback buttons sit in a toolbar above the preview, like GB Studio
// 3.2's own sprite editor (MetaspriteEditorToolsPanel) - styled as this
// page's Free-form MetaspriteToolbar so both modes share one look.
const Toolbar = styled.div`
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: ${(props) => props.theme.colors.toolbar.background};
  border-bottom: 1px solid ${(props) => props.theme.colors.toolbar.border};
`;

// overflow hidden: a zoomed-in preview larger than the area is clipped
// rather than adding a scrollbar.
const Stage = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 14px;
`;

const CanvasFrame = styled.div<{ canvasSize: number }>`
  flex-shrink: 0;
  width: ${(props) => Math.max(128, props.canvasSize)}px;
  height: ${(props) => Math.max(128, props.canvasSize)}px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-conic-gradient(
      ${(props) => props.theme.colors.input.background} 0% 25%,
      ${(props) => props.theme.colors.document.background} 0% 50%
    )
    50% / 16px 16px;
  border: 1px solid ${(props) => props.theme.colors.sidebar.border};

  canvas {
    width: ${(props) => props.canvasSize}px;
    height: ${(props) => props.canvasSize}px;
    image-rendering: pixelated;
  }
`;

// no dedicated "previous" icon exists in this app's icon set - reuse
// CaretRightIcon flipped, the same trick NavigatorSprites.tsx's own
// animationTypeIcons already uses for reusing one icon in several directions.
const FlippedIcon = styled.span`
  display: inline-flex;
  transform: scaleX(-1);
`;

// frame is owned by SpritesPage and shared with SpriteFramesStrip, so the
// strip's highlight follows the frame being played here (and clicking a
// strip frame shows it here).
interface SpritePreviewProps {
  id: string;
  frame: number;
  onFrameChange: Dispatch<SetStateAction<number>>;
}

export const SpritePreview: FC<SpritePreviewProps> = ({
  id,
  frame,
  onFrameChange: setFrame,
}) => {
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  // User-found: the app toolbar's own zoom button already updates
  // state.editor.zoomSprite when on the Sprites page, but nothing here
  // read it back - the preview was stuck at a fixed 4x (64px) regardless.
  // zoomSprite is a percentage (100 = 1x); 16 is this sheet's own fixed
  // frame size (every sprite frame on this engine is 16x16).
  const zoomSprite = useSelector((state: RootState) => state.editor.zoomSprite);
  const canvasSize = Math.round(16 * (zoomSprite / 100));
  // A static auto-cycle sheet plays its frame list (SpriteSheet.frameSequence,
  // what actually gets compiled) instead of the PNG's raw frame order.
  const sequence =
    sprite && isFrameSequenceEligible(sprite)
      ? effectiveFrameSequence(sprite)
      : null;
  let maxFrame = 0;
  if (sequence) {
    maxFrame = sequence.length - 1;
  } else if (sprite) {
    maxFrame = Math.max(0, framesPerDirection(sprite.type, sprite.numFrames) - 1);
  }
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPlaying(false);
  }, [id]);

  useEffect(() => {
    if (playing && maxFrame > 0) {
      intervalRef.current = setInterval(() => {
        setFrame((f) => (f + 1) % (maxFrame + 1));
      }, PLAY_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [playing, maxFrame, setFrame]);

  const step = (delta: number) => () => {
    setPlaying(false);
    setFrame((f) => (f + delta + maxFrame + 1) % (maxFrame + 1));
  };

  const togglePlay = () => setPlaying((p) => !p);

  if (!sprite) {
    return <Wrapper />;
  }

  return (
    <Wrapper>
      <Toolbar>
        <Button
          size="small"
          variant="transparent"
          onClick={step(-1)}
          disabled={maxFrame === 0}
        >
          <FlippedIcon>
            <CaretRightIcon />
          </FlippedIcon>
        </Button>
        <Button
          size="small"
          variant={playing ? "primary" : "transparent"}
          onClick={togglePlay}
          disabled={maxFrame === 0}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          size="small"
          variant="transparent"
          onClick={step(1)}
          disabled={maxFrame === 0}
        >
          <CaretRightIcon />
        </Button>
      </Toolbar>
      <Stage>
        <CanvasFrame canvasSize={canvasSize}>
          {sequence ? (
            <SpriteSheetCanvas
              spriteSheetId={id}
              rawFrame={sequence[Math.min(frame, maxFrame)]}
            />
          ) : (
            <SpriteSheetCanvas
              spriteSheetId={id}
              direction="down"
              frame={frame}
            />
          )}
        </CanvasFrame>
      </Stage>
    </Wrapper>
  );
};
