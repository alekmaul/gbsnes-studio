import React, { FC, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { RootState } from "../../store/configureStore";
import { spriteSheetSelectors } from "../../store/features/entities/entitiesState";
import entitiesActions from "../../store/features/entities/entitiesActions";
import navigationActions from "../../store/features/navigation/navigationActions";
import { FlatList, FlatListItem } from "../ui/lists/FlatList";
import { SplitPaneHeader } from "../ui/splitpane/SplitPaneHeader";
import { SplitPaneVerticalDivider } from "../ui/splitpane/SplitPaneDivider";
import { Button } from "../ui/buttons/Button";
import { PlusIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";
import useSplitPane from "../ui/hooks/use-split-pane";

// Left sidebar - mirrors GB Studio 3.0.3's own NavigatorSprites.tsx layout
// (two stacked resizable panes: Sprites list, States list), scoped per
// SPRITE_EDITOR_PROGRESS.md: "States" here is this fork's already-shipped
// whole-sheet-swap feature, not GB Studio's own per-frame sub-range states.

const DEFAULT_STATE_ID = "";
const COLLAPSED_SIZE = 30;

const Pane = styled.div`
  overflow: hidden;
`;

interface StateListItem extends FlatListItem {
  removable: boolean;
}

interface SpriteNavigatorProps {
  height: number;
  selectedId: string;
  selectedStateId: string;
  onSelectStateId: (id: string) => void;
}

export const SpriteNavigator: FC<SpriteNavigatorProps> = ({
  height,
  selectedId,
  selectedStateId,
  onSelectStateId,
}) => {
  const dispatch = useDispatch();
  // Fixed starting sizes, not a fraction of `height` - both comfortably over
  // COLLAPSED_SIZE so useSplitPane's own maxTotal-rescale effect treats both
  // panes as "open" and proportionally rescales them to the real available
  // height. A size <= COLLAPSED_SIZE (e.g. 0) is treated as already
  // collapsed and never gets space back - that bug made the States pane
  // disappear and left the Sprites pane filling the whole column.
  const [splitSizes, setSplitSizes] = useState([300, 200]);
  const [onDragStart, togglePane] = useSplitPane({
    sizes: splitSizes,
    setSizes: setSplitSizes,
    minSizes: [COLLAPSED_SIZE, COLLAPSED_SIZE],
    collapsedSize: COLLAPSED_SIZE,
    reopenSize: 200,
    maxTotal: height,
    direction: "vertical",
  });

  const allSprites = useSelector((state: RootState) =>
    spriteSheetSelectors.selectAll(state)
  );
  const selectedSprite = useSelector((state: RootState) =>
    spriteSheetSelectors.selectById(state, selectedId)
  );

  const spriteItems: FlatListItem[] = allSprites.map((sprite, index) => ({
    id: sprite.id,
    name: sprite.name || `Sprite ${index + 1}`,
  }));

  const stateItems: StateListItem[] = [
    { id: DEFAULT_STATE_ID, name: l10n("FIELD_STATE_DEFAULT"), removable: false },
    ...(selectedSprite?.states || []).map((state) => ({
      id: state.id,
      name: state.name || l10n("FIELD_STATE"),
      removable: true,
    })),
  ];

  const setSelectedId = (id: string) => {
    dispatch(navigationActions.setNavigationId(id));
  };

  const addState = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(
      entitiesActions.addSpriteState({
        spriteSheetId: selectedId,
        name: l10n("FIELD_STATE"),
        targetSpriteSheetId: selectedId,
      })
    );
  };

  const removeState = (stateId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(
      entitiesActions.removeSpriteState({
        spriteSheetId: selectedId,
        stateId,
      })
    );
    if (selectedStateId === stateId) {
      onSelectStateId(DEFAULT_STATE_ID);
    }
  };

  return (
    <>
      <Pane style={{ height: splitSizes[0] }}>
        <SplitPaneHeader
          onToggle={() => togglePane(0)}
          collapsed={Math.floor(splitSizes[0]) <= COLLAPSED_SIZE}
        >
          {l10n("FIELD_SPRITES")}
        </SplitPaneHeader>
        <FlatList
          selectedId={selectedId}
          items={spriteItems}
          setSelectedId={setSelectedId}
          height={splitSizes[0] - 30}
        />
      </Pane>
      <SplitPaneVerticalDivider onMouseDown={onDragStart(0)} />
      <Pane style={{ height: splitSizes[1] }}>
        <SplitPaneHeader
          onToggle={() => togglePane(1)}
          collapsed={Math.floor(splitSizes[1]) <= COLLAPSED_SIZE}
          buttons={
            <Button
              variant="transparent"
              size="small"
              title={l10n("FIELD_ADD_STATE")}
              onClick={addState}
            >
              <PlusIcon />
            </Button>
          }
        >
          {l10n("FIELD_STATES")}
        </SplitPaneHeader>
        <FlatList
          selectedId={selectedStateId || DEFAULT_STATE_ID}
          items={stateItems}
          setSelectedId={onSelectStateId}
          height={splitSizes[1] - 30}
        >
          {({ item }) => {
            const stateItem = item as StateListItem;
            return (
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <span style={{ flexGrow: 1 }}>{stateItem.name}</span>
                {stateItem.removable && (
                  <Button
                    variant="transparent"
                    size="small"
                    onClick={removeState(stateItem.id)}
                  >
                    &times;
                  </Button>
                )}
              </div>
            );
          }}
        </FlatList>
      </Pane>
    </>
  );
};
