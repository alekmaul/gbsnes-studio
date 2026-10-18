import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import entitiesActions from "../../store/features/entities/entitiesActions";
import editorActions from "../../store/features/editor/editorActions";
import { Button } from "../ui/buttons/Button";
import { SelectIcon, EraserIcon } from "../ui/icons/Icons";
import { FlexGrow } from "../ui/spacing/Spacing";
import l10n from "../../lib/helpers/l10n";

// M9 (SPRITE_EDITOR_PROGRESS.md) - the metasprite canvas's own toolbar
// (select/erase tool + flip/reorder for the current selection), per the
// signed-off wireframe. "Place" isn't a button here - it's entered
// automatically by picking a tile in MetaspriteTilePalette (setSpriteTileSelection),
// matching the wireframe's own "stamp" interaction.

const Wrapper = styled.div`
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: ${(props) => props.theme.colors.toolbar.background};
  border-bottom: 1px solid ${(props) => props.theme.colors.toolbar.border};
`;

const Divider = styled.div`
  width: 1px;
  height: 20px;
  background: ${(props) => props.theme.colors.toolbar.border};
  margin: 0 4px;
`;

interface MetaspriteToolbarProps {
  id: string;
  animStateId?: string;
  frameIndex: number;
}

export const MetaspriteToolbar: FC<MetaspriteToolbarProps> = ({
  id,
  animStateId,
  frameIndex,
}) => {
  const dispatch = useDispatch();
  const metaspriteTool = useSelector(
    (state: RootState) => state.editor.metaspriteTool
  );
  const selectedTileIds = useSelector(
    (state: RootState) => state.editor.selectedMetaspriteTileIds
  );
  const hasSelection = selectedTileIds.length > 0;

  const setTool = (tool: "select" | "erase") => () => {
    dispatch(editorActions.setMetaspriteTool(tool));
  };

  const onFlipX = () => {
    dispatch(
      entitiesActions.flipXMetaspriteTiles({
        spriteSheetId: id,
        animStateId,
        metaspriteTileIds: selectedTileIds,
      })
    );
  };

  const onFlipY = () => {
    dispatch(
      entitiesActions.flipYMetaspriteTiles({
        spriteSheetId: id,
        animStateId,
        metaspriteTileIds: selectedTileIds,
      })
    );
  };

  const onToFront = () => {
    dispatch(
      entitiesActions.sendMetaspriteTilesToFront({
        spriteSheetId: id,
        animStateId,
        metaspriteTileIds: selectedTileIds,
        frameIndex,
      })
    );
  };

  const onToBack = () => {
    dispatch(
      entitiesActions.sendMetaspriteTilesToBack({
        spriteSheetId: id,
        animStateId,
        metaspriteTileIds: selectedTileIds,
        frameIndex,
      })
    );
  };

  const onDelete = () => {
    dispatch(
      entitiesActions.removeMetaspriteTiles({
        spriteSheetId: id,
        animStateId,
        metaspriteTileIds: selectedTileIds,
        frameIndex,
      })
    );
  };

  return (
    <Wrapper>
      <Button
        size="small"
        variant={metaspriteTool === "select" ? "primary" : "transparent"}
        onClick={setTool("select")}
        title={l10n("TOOL_METASPRITE_SELECT_LABEL")}
      >
        <SelectIcon />
      </Button>
      <Button
        size="small"
        variant={metaspriteTool === "erase" ? "primary" : "transparent"}
        onClick={setTool("erase")}
        title={l10n("TOOL_ERASER_LABEL")}
      >
        <EraserIcon />
      </Button>
      <Divider />
      <Button
        size="small"
        variant="transparent"
        disabled={!hasSelection}
        onClick={onFlipX}
        title={l10n("FIELD_FLIP_HORIZONTAL")}
      >
        ⇋
      </Button>
      <Button
        size="small"
        variant="transparent"
        disabled={!hasSelection}
        onClick={onFlipY}
        title={l10n("FIELD_FLIP_VERTICAL")}
      >
        ⇅
      </Button>
      <Divider />
      <Button
        size="small"
        variant="transparent"
        disabled={!hasSelection}
        onClick={onToFront}
        title={l10n("FIELD_BRING_TO_FRONT")}
      >
        ▣
      </Button>
      <Button
        size="small"
        variant="transparent"
        disabled={!hasSelection}
        onClick={onToBack}
        title={l10n("FIELD_SEND_TO_BACK")}
      >
        ▢
      </Button>
      <FlexGrow />
      <Button
        size="small"
        variant="transparent"
        disabled={!hasSelection}
        onClick={onDelete}
      >
        {l10n("DIALOG_DELETE")}
      </Button>
    </Wrapper>
  );
};
