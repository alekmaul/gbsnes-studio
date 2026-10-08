import React, { FC } from "react";
import cx from "classnames";
import { FormSectionTitle } from "../ui/form/FormLayout";
import { Button } from "../ui/buttons/Button";
import { PlusIcon } from "../ui/icons/Icons";
import l10n from "../../lib/helpers/l10n";

export interface SpriteAnimation {
  name: string;
  frames: number[];
}

export interface SpriteAnimationGroup {
  // undefined = the implicit "Default" state (this sheet's own animations).
  // A real id = one of SpriteSheet.states[], whose animations belong to
  // whichever *other* sheet that state points at.
  stateId?: string;
  label: string;
  animations: SpriteAnimation[];
}

interface SpriteAnimationsPanelProps {
  groups: SpriteAnimationGroup[];
  selectedStateId?: string;
  selectedAnimationIndex: number;
  onSelectState: (stateId: string | undefined) => void;
  onSelectAnimation: (stateId: string | undefined, animationIndex: number) => void;
  onAddState: () => void;
}

// Left-dock "ANIMATIONS" tree, matching GB Studio 3.2.1's real layout
// exactly (checked NavigatorSprites.tsx directly): one group per sprite
// state, each listing that state's own animations underneath - but a group
// *heading* only appears once a sheet has more than one state. B's own
// reasoning (`tree.length > 1` in NavigatorSprites.tsx) is the same reason
// this fork follows it: the overwhelmingly common case is a sheet with just
// its own implicit "Default" state and nothing else, where a group header
// would be pure, always-present noise ("Default" labelling the only thing
// there could ever be) - so with exactly one group, its animations are
// shown as a plain flat list instead, and only once a second (named,
// user-added) state exists does grouping - and the "Default" label itself -
// appear at all. See SpriteAnimationSettingsPanel.tsx for the matching
// "Animation Settings" panel a selected group/animation drives, and
// SpriteFramesPanel.tsx for the frame thumbnails a selected animation
// drives.
//
// Unlike B, groups are always expanded once shown - no collapse/disclosure
// control. This fork's own state count stays small even in the multi-state
// case (a handful of named alternate-sheet references, not B's arbitrary
// per-state frame authoring), so a collapse/expand interaction wasn't
// judged worth the added complexity here.
const SpriteAnimationsPanel: FC<SpriteAnimationsPanelProps> = ({
  groups,
  selectedStateId,
  selectedAnimationIndex,
  onSelectState,
  onSelectAnimation,
  onAddState,
}) => {
  const showGroupHeadings = groups.length > 1;

  const renderAnimations = (group: SpriteAnimationGroup) =>
    group.animations.map((animation, index) => (
      <div
        key={animation.name}
        onClick={() => onSelectAnimation(group.stateId, index)}
        className={cx("FilesSidebar__ListItem", {
          "FilesSidebar__ListItem--Active":
            group.stateId === selectedStateId &&
            index === selectedAnimationIndex,
        })}
      >
        {animation.name}
      </div>
    ));

  return (
    <div>
      <FormSectionTitle>
        {l10n("FIELD_ANIMATIONS")}
        <Button
          variant="transparent"
          size="small"
          onClick={onAddState}
          title={l10n("FIELD_ADD_STATE")}
        >
          <PlusIcon />
        </Button>
      </FormSectionTitle>
      {!showGroupHeadings && groups[0] && renderAnimations(groups[0])}
      {showGroupHeadings &&
        groups.map((group) => (
          <div className="FilesSidebar__Group" key={group.stateId || "default"}>
            <div
              onClick={() => onSelectState(group.stateId)}
              className={cx(
                "FilesSidebar__GroupHeading",
                "SpriteAnimationsPanel__State",
                {
                  "SpriteAnimationsPanel__State--Active":
                    group.stateId === selectedStateId,
                }
              )}
            >
              {group.label}
            </div>
            {renderAnimations(group)}
          </div>
        ))}
    </div>
  );
};

export default SpriteAnimationsPanel;
