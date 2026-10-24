import React, { FC, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled, { css } from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import SpriteSheetCanvas from "../world/SpriteSheetCanvas";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import { Button } from "../ui/buttons/Button";
import l10n from "../../lib/helpers/l10n";
import {
  MAX_SEQUENCE_FRAMES,
  effectiveFrameSequence,
  imageFrameCount,
  isFrameSequenceEligible,
} from "../../lib/helpers/frameSequence";

// Center column, bottom: the sheet's frames. For a static auto-cycle sheet
// (see isFrameSequenceEligible) this is an editable frame list - an ordered
// list of the PNG's own frames, stored as SpriteSheet.frameSequence and
// compiled into the ROM by compileSnesData.js (a frame can repeat, e.g.
// [0, 1, 1]). Directional sheets keep their fixed frame meaning, so for them
// the strip stays a read-only breakdown of the PNG's raw frames (rawFrame
// bypasses the direction-based convention - see SpriteSheetCanvas.worker.ts).
// See SPRITE_EDITOR_PROGRESS.md.

const Wrapper = styled.div`
  flex-shrink: 0;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
  background: ${(props) => props.theme.colors.sidebar.well.background};
`;

const Strip = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 10px;
`;

const Label = styled.div`
  font-size: 11px;
  opacity: 0.7;
  margin-right: 4px;
`;

const LimitMessage = styled.div`
  padding: 0 14px 10px;
  font-size: 11px;
  color: ${(props) => props.theme.colors.highlight};
`;

const Chip = styled.div<{ selected?: boolean; clickable?: boolean }>`
  width: 28px;
  height: 28px;
  border: 1px solid ${(props) => props.theme.colors.sidebar.border};
  ${(props) =>
    props.clickable &&
    css`
      cursor: pointer;
    `}
  ${(props) =>
    props.selected &&
    css`
      border-color: ${props.theme.colors.highlight};
      box-shadow: 0 0 0 1px ${props.theme.colors.highlight};
    `}

  canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
`;

// selected is owned by SpritesPage and shared with SpritePreview: it's the
// frame the preview shows, so the highlight moves while the preview plays.
interface SpriteFramesStripProps {
  id: string;
  selected: number;
  onSelect: (index: number) => void;
}

export const SpriteFramesStrip: FC<SpriteFramesStripProps> = ({
  id,
  selected,
  onSelect: setSelected,
}) => {
  const dispatch = useDispatch();
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );
  // Shown when + / Duplicate is clicked on a full list - the buttons stay
  // clickable so the limit is explained instead of silently greyed out.
  const [limitMessage, setLimitMessage] = useState(false);

  useEffect(() => {
    setLimitMessage(false);
  }, [id]);

  if (!sprite) {
    return null;
  }

  if (!isFrameSequenceEligible(sprite)) {
    const frames = Array.from({ length: sprite.numFrames }, (_, i) => i);
    return (
      <Wrapper>
        <SplitPaneHeader collapsed={false}>
          {l10n("FIELD_SPRITE_FRAMES")}
        </SplitPaneHeader>
        <Strip>
          {frames.map((rawFrame) => (
            // the preview plays the "down" poses, the PNG's first frames
            <Chip key={rawFrame} selected={rawFrame === selected}>
              <SpriteSheetCanvas spriteSheetId={id} rawFrame={rawFrame} />
            </Chip>
          ))}
        </Strip>
      </Wrapper>
    );
  }

  const available = imageFrameCount(sprite);
  const sequence = effectiveFrameSequence(sprite);
  const sel = Math.min(selected, sequence.length - 1);
  const full = sequence.length >= MAX_SEQUENCE_FRAMES;

  const save = (next: number[], nextSelected: number) => {
    setLimitMessage(false);
    dispatch(
      entitiesActions.editSpriteSheet({
        spriteSheetId: id,
        changes: { frameSequence: next },
      })
    );
    setSelected(nextSelected);
  };

  const onAdd = () => {
    if (full) {
      setLimitMessage(true);
      return;
    }
    const last = sequence[sequence.length - 1];
    save([...sequence, (last + 1) % available], sequence.length);
  };

  const onDuplicate = () => {
    if (full) {
      setLimitMessage(true);
      return;
    }
    const next = [...sequence];
    next.splice(sel + 1, 0, sequence[sel]);
    save(next, sel + 1);
  };

  const onRemove = () => {
    const next = sequence.filter((_, i) => i !== sel);
    save(next, Math.max(0, sel - 1));
  };

  const onMove = (delta: number) => () => {
    const to = sel + delta;
    const next = [...sequence];
    [next[sel], next[to]] = [next[to], next[sel]];
    save(next, to);
  };

  const onPick = (rawFrame: number) => () => {
    const next = [...sequence];
    next[sel] = rawFrame;
    save(next, sel);
  };

  const onReset = () => {
    dispatch(
      entitiesActions.editSpriteSheet({
        spriteSheetId: id,
        changes: { frameSequence: undefined },
      })
    );
    setLimitMessage(false);
    setSelected(0);
  };

  return (
    <Wrapper>
      <SplitPaneHeader collapsed={false}>
        {l10n("FIELD_SPRITE_FRAMES")}
      </SplitPaneHeader>
      <Strip>
        {sequence.map((rawFrame, i) => (
          <Chip
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            clickable
            selected={i === sel}
            title={`${i + 1}`}
            onClick={() => setSelected(i)}
          >
            <SpriteSheetCanvas spriteSheetId={id} rawFrame={rawFrame} />
          </Chip>
        ))}
      </Strip>
      <Strip>
        <Button
          size="small"
          onClick={onAdd}
          title={l10n("FIELD_APPEND_FRAME")}
        >
          +
        </Button>
        <Button size="small" onClick={onDuplicate}>
          {l10n("FIELD_DUPLICATE_FRAME")}
        </Button>
        <Button
          size="small"
          onClick={onRemove}
          disabled={sequence.length <= 1}
        >
          {l10n("FIELD_REMOVE_FRAME")}
        </Button>
        <Button
          size="small"
          onClick={onMove(-1)}
          disabled={sel === 0}
          title={l10n("FIELD_MOVE_FRAME_LEFT")}
        >
          ◀
        </Button>
        <Button
          size="small"
          onClick={onMove(1)}
          disabled={sel >= sequence.length - 1}
          title={l10n("FIELD_MOVE_FRAME_RIGHT")}
        >
          ▶
        </Button>
        <Button
          size="small"
          onClick={onReset}
          disabled={!sprite.frameSequence}
        >
          {l10n("FIELD_RESET_FRAMES")}
        </Button>
      </Strip>
      {limitMessage && (
        <LimitMessage>
          {l10n("WARNING_MAX_SEQUENCE_FRAMES", { max: MAX_SEQUENCE_FRAMES })}
        </LimitMessage>
      )}
      {available > 1 && (
        <Strip>
          <Label>{l10n("FIELD_IMAGE_FRAMES")}</Label>
          {Array.from({ length: available }, (_, f) => (
            <Chip
              key={f}
              clickable
              selected={sequence[sel] === f}
              title={`${f + 1}`}
              onClick={onPick(f)}
            >
              <SpriteSheetCanvas spriteSheetId={id} rawFrame={f} />
            </Chip>
          ))}
        </Strip>
      )}
    </Wrapper>
  );
};
