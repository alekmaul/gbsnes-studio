import React, { FC } from "react";
import { useSelector } from "react-redux";
import { sfxSelectors } from "../../store/features/entities/entitiesState";
import { RootState } from "../../store/configureStore";

// v4 follow-up: Sound: Play Effect's "custom" type - lists the project's
// own assets/sounds/*.wav assets (SoundEffect entities), encoded to BRR by
// compileSnesSfx.js. Modeled directly on EmoteSelect.tsx (a plain project
// asset list, no preview playback - unlike Music, nothing in this editor
// can currently play back an arbitrary project .wav).
interface SfxAssetSelectProps {
  id?: string;
  value?: string;
  onChange: (e: { currentTarget: { value: string } }) => void;
}

const SfxAssetSelect: FC<SfxAssetSelectProps> = ({ id, value, onChange }) => {
  const soundEffects = useSelector((state: RootState) => sfxSelectors.selectAll(state));

  return (
    <select id={id} value={value} onChange={onChange}>
      {soundEffects.map((sfx) => (
        <option key={sfx.id} value={sfx.id}>
          {sfx.name}
        </option>
      ))}
    </select>
  );
};

SfxAssetSelect.defaultProps = {
  id: undefined,
  value: "",
};

export default SfxAssetSelect;
