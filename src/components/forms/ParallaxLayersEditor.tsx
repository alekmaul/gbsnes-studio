import React, { FC } from "react";
import styled from "styled-components";
import l10n from "../../lib/helpers/l10n";
import { NumberField } from "../ui/form/NumberField";
import { Button } from "../ui/buttons/Button";
import { PlusIcon, CloseIcon } from "../ui/icons/Icons";
import { FlexGrow, FixedSpacer } from "../ui/spacing/Spacing";
import { SceneParallaxLayer } from "../../store/features/entities/entitiesTypes";

// M6 (v4): banded X-axis parallax, ported onto the SNES's own HDMA-driven
// setParallaxScrolling() (appData/src/snes/src/parallax.c) instead of a
// second BG layer - matches GB Studio 3.x's real model (N stacked bands on
// the same background, each with its own scroll speed), not the "BG2 second
// layer at a constant rate" the roadmap first assumed. height is in tiles,
// stacked top-to-bottom; the last band always fills the rest of the screen.
// speed is a signed shift: 1 = half speed (background, farther away), 2 =
// quarter speed, -1 = double speed (foreground), 0 = matches the camera
// exactly (same as no parallax for that band).
interface ParallaxLayersEditorProps {
  name: string;
  value?: SceneParallaxLayer[];
  onChange: (newValue: SceneParallaxLayer[]) => void;
}

const Row = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 5px;
  margin-bottom: 5px;
`;

export const ParallaxLayersEditor: FC<ParallaxLayersEditorProps> = ({
  name,
  value,
  onChange,
}) => {
  const layers = value || [];

  const onChangeLayer = (index: number, changes: Partial<SceneParallaxLayer>) => {
    onChange(
      layers.map((layer, i) => (i === index ? { ...layer, ...changes } : layer))
    );
  };

  const onAddLayer = () => {
    onChange([...layers, { height: 4, speed: 1 }]);
  };

  const onRemoveLayer = (index: number) => {
    onChange(layers.filter((_, i) => i !== index));
  };

  return (
    <div id={name}>
      {layers.map((layer, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Row key={index}>
          <NumberField
            name={`${name}_height_${index}`}
            label={index === 0 ? l10n("FIELD_PARALLAX_HEIGHT") : undefined}
            value={layer.height}
            min={1}
            onChange={(e) =>
              onChangeLayer(index, { height: parseInt(e.currentTarget.value, 10) || 1 })
            }
          />
          <NumberField
            name={`${name}_speed_${index}`}
            label={index === 0 ? l10n("FIELD_PARALLAX_SPEED") : undefined}
            value={layer.speed}
            onChange={(e) =>
              onChangeLayer(index, { speed: parseInt(e.currentTarget.value, 10) || 0 })
            }
          />
          <Button onClick={() => onRemoveLayer(index)} title={l10n("FIELD_REMOVE")}>
            <CloseIcon />
          </Button>
        </Row>
      ))}
      <Row>
        <Button onClick={onAddLayer}>
          <PlusIcon />
          <FixedSpacer width={5} />
          {l10n("FIELD_PARALLAX_ADD_LAYER")}
        </Button>
        <FlexGrow />
      </Row>
    </div>
  );
};

ParallaxLayersEditor.defaultProps = {
  value: [],
};
