import React, { FC, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import { framesPerDirection } from "../../lib/helpers/gbstudio";
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
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  min-height: 0;
`;

const CanvasFrame = styled.div`
  width: 128px;
  height: 128px;
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
    width: 64px;
    height: 64px;
    image-rendering: pixelated;
  }
`;

const Transport = styled.div`
  display: flex;
  gap: 4px;
`;

// no dedicated "previous" icon exists in this app's icon set - reuse
// CaretRightIcon flipped, the same trick NavigatorSprites.tsx's own
// animationTypeIcons already uses for reusing one icon in several directions.
const FlippedIcon = styled.span`
  display: inline-flex;
  transform: scaleX(-1);
`;

interface SpritePreviewProps {
  id: string;
}

export const SpritePreview: FC<SpritePreviewProps> = ({ id }) => {
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  const maxFrame = sprite
    ? Math.max(0, framesPerDirection(sprite.type, sprite.numFrames) - 1)
    : 0;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setFrame(0);
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
  }, [playing, maxFrame]);

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
      <CanvasFrame>
        <SpriteSheetCanvas spriteSheetId={id} direction="down" frame={frame} />
      </CanvasFrame>
      <Transport>
        <Button size="small" onClick={step(-1)} disabled={maxFrame === 0}>
          <FlippedIcon>
            <CaretRightIcon />
          </FlippedIcon>
        </Button>
        <Button
          size="small"
          variant={playing ? "primary" : "normal"}
          onClick={togglePlay}
          disabled={maxFrame === 0}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button size="small" onClick={step(1)} disabled={maxFrame === 0}>
          <CaretRightIcon />
        </Button>
      </Transport>
    </Wrapper>
  );
};
