import React, { FC } from "react";
import { useSelector } from "react-redux";
import { emoteSelectors } from "../../store/features/entities/entitiesState";
import { RootState } from "../../store/configureStore";

// M5 (v4): Emote is a real project entity (assets/emotes/*.png) instead of
// a fixed 8-name list - this now lists whatever the project actually has.
// A pre-M5 project with no Emote entities yet (still on the legacy fixed
// assets/ui/emotes.png grid) shows an empty list here until it gains some -
// see snesFixedAssets.js / actorEmote() (scriptBuilder.js) for how an
// already-saved numeric emoteId keeps working in that case.
interface EmoteSelectProps {
  id?: string;
  value?: string;
  onChange: (e: { currentTarget: { value: string } }) => void;
}

const EmoteSelect: FC<EmoteSelectProps> = ({ id, value, onChange }) => {
  const emotes = useSelector((state: RootState) => emoteSelectors.selectAll(state));

  return (
    <select id={id} value={value} onChange={onChange}>
      {emotes.map((emote) => (
        <option key={emote.id} value={emote.id}>
          {emote.name}
        </option>
      ))}
    </select>
  );
};

EmoteSelect.defaultProps = {
  id: undefined,
  value: "",
};

export default EmoteSelect;
