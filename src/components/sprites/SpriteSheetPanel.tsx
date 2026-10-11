import React, { FC } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import electronActions from "../../store/features/electron/electronActions";
import { assetFilename } from "../../lib/helpers/gbstudio";
import { Button } from "../ui/buttons/Button";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import l10n from "../../lib/helpers/l10n";

// Center column, middle: the full raw sprite sheet PNG + an "Edit..." button,
// same mechanism src/components/assets/ImageViewer.js already uses for
// Backgrounds (electronActions.openFile opens the project's default external
// image editor). See SPRITE_EDITOR_PROGRESS.md.

const Wrapper = styled.div`
  flex-shrink: 0;
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
`;

const Body = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
`;

const Strip = styled.div`
  flex-shrink: 0;
  max-height: 48px;
  overflow: hidden;
  border: 1px solid ${(props) => props.theme.colors.sidebar.border};

  img {
    display: block;
    height: 32px;
    image-rendering: pixelated;
  }
`;

const Name = styled.div`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: ${(props) => props.theme.colors.secondaryText};
`;

interface SpriteSheetPanelProps {
  id: string;
}

export const SpriteSheetPanel: FC<SpriteSheetPanelProps> = ({ id }) => {
  const dispatch = useDispatch();
  const projectRoot = useSelector(
    (state: RootState) => state.document?.root || ""
  );
  const sprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, id)
  );

  if (!sprite) {
    return null;
  }

  const onEdit = () => {
    dispatch(
      electronActions.openFile({
        filename: assetFilename(projectRoot, "sprites", sprite),
        type: "image",
      })
    );
  };

  return (
    <Wrapper>
      <SplitPaneHeader collapsed={false}>
        {l10n("FIELD_SPRITE_SHEET")}
      </SplitPaneHeader>
      <Body>
        <Strip>
          <img
            alt=""
            src={`file://${assetFilename(projectRoot, "sprites", sprite)}?_v=${
              sprite._v || 0
            }`}
          />
        </Strip>
        <Name>
          {sprite.filename} &mdash; {sprite.numFrames}{" "}
          {l10n("FIELD_SPRITE_FRAMES")}
        </Name>
        <Button size="small" onClick={onEdit}>
          {l10n("ASSET_EDIT")}
        </Button>
      </Body>
    </Wrapper>
  );
};
