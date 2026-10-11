import React, { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled, { ThemeContext } from "styled-components";
import useResizable from "../../components/ui/hooks/use-resizable";
import useWindowSize from "../../components/ui/hooks/use-window-size";
import { SplitPaneHorizontalDivider } from "../../components/ui/splitpane/SplitPaneDivider";
import { SpriteNavigator } from "../../components/sprites/SpriteNavigator";
import { SpritePreview } from "../../components/sprites/SpritePreview";
import { SpriteSheetPanel } from "../../components/sprites/SpriteSheetPanel";
import { SpriteFramesStrip } from "../../components/sprites/SpriteFramesStrip";
import { SpriteInspector } from "../../components/sprites/SpriteInspector";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import navigationActions from "../../store/features/navigation/navigationActions";
import electronActions from "../../store/features/electron/electronActions";
import { Button } from "../../components/ui/buttons/Button";
import { HelpIcon } from "../../components/ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

// Sprites page - 3-column layout mirroring GB Studio 3.0.3's own SpritesPage
// (left: Sprites/States navigator, center: preview/sheet/frames, right:
// inspector), scoped to this engine's real capabilities per
// SPRITE_EDITOR_PROGRESS.md. Replaces the previous plain ImageViewer +
// FilesSidebar file-browser page.

const Wrapper = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
`;

const CenterColumn = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 10px;
  color: ${(props) => props.theme.colors.secondaryText};
`;

const SpritesPage = () => {
  const dispatch = useDispatch();
  const themeContext = useContext(ThemeContext);
  const windowSize = useWindowSize();
  const windowWidth = windowSize.width || 0;
  const windowHeight = windowSize.height || 0;

  const allSprites = useSelector((state) =>
    spriteSheetSelectors.selectAll(state)
  );
  const navigationId = useSelector((state) => state.navigation.id);

  const selectedSprite =
    allSprites.find((s) => s.id === navigationId) || allSprites[0];
  const selectedId = selectedSprite?.id || "";

  const [selectedStateId, setSelectedStateId] = useState("");

  useEffect(() => {
    setSelectedStateId("");
  }, [selectedId]);

  const [leftPaneWidth, , startLeftPaneResize] = useResizable({
    initialSize: 220,
    direction: "right",
    minSize: 150,
    maxSize: Math.max(151, windowWidth - 300),
  });
  const [rightPaneWidth, , startRightPaneResize] = useResizable({
    initialSize: 230,
    direction: "left",
    minSize: 200,
    maxSize: Math.max(201, windowWidth - 300),
  });

  const openHelp = () => {
    dispatch(electronActions.openHelp("sprites"));
  };

  if (allSprites.length === 0) {
    return (
      <EmptyState>
        <span>{l10n("FIELD_SPRITES")}</span>
        <Button onClick={openHelp} title={l10n("MENU_DOCUMENTATION")}>
          <HelpIcon />
        </Button>
      </EmptyState>
    );
  }

  return (
    <Wrapper>
      <div
        style={{
          width: leftPaneWidth,
          background: themeContext.colors.sidebar.background,
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <SpriteNavigator
          height={windowHeight - 38}
          selectedId={selectedId}
          selectedStateId={selectedStateId}
          onSelectStateId={setSelectedStateId}
        />
      </div>
      <SplitPaneHorizontalDivider onMouseDown={startLeftPaneResize} />
      <CenterColumn
        style={{
          background: themeContext.colors.document.background,
          color: themeContext.colors.text,
          height: windowHeight - 38,
        }}
      >
        <SpritePreview id={selectedId} />
        <SpriteSheetPanel id={selectedId} />
        <SpriteFramesStrip id={selectedId} />
      </CenterColumn>
      <SplitPaneHorizontalDivider onMouseDown={startRightPaneResize} />
      <div
        style={{
          width: rightPaneWidth,
          background: themeContext.colors.sidebar.background,
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <SpriteInspector id={selectedId} selectedStateId={selectedStateId} />
      </div>
    </Wrapper>
  );
};

export default SpritesPage;
