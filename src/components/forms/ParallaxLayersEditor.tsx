import React, { FC, useEffect, useState } from "react";
import styled from "styled-components";
import l10n from "../../lib/helpers/l10n";
import { CoordinateInput } from "../ui/form/CoordinateInput";
import { FormField } from "../ui/form/FormLayout";
import { Select } from "../ui/form/Select";
import { ParallaxSpeedSelect } from "./ParallaxSpeedSelect";
import { SceneParallaxLayer } from "../../store/features/entities/entitiesTypes";

// M6 (v4): banded X-axis parallax, ported onto the SNES's own HDMA-driven
// setParallaxScrolling() (appData/src/snes/src/parallax.c) instead of a
// second BG layer - matches GB Studio 3.x's real model (N stacked bands on
// the same background, each with its own scroll speed), not the "BG2 second
// layer at a constant rate" the roadmap first assumed. height is in tiles,
// stacked top-to-bottom; the last band always fills the rest of the screen
// (compileSnesData.js auto-extends it regardless of the stored height, so
// its field below is shown but disabled, same as B). speed is a signed
// shift: 1 = half speed (background, farther away), 2 = quarter speed, -1 =
// double speed (foreground) - see ParallaxSpeedSelect.tsx.
interface ParallaxOption {
  value: number;
  label: string;
}

const options: ParallaxOption[] = [
  { value: 0, label: `${l10n("FIELD_PARALLAX_NONE")}` },
  { value: 1, label: `1 ${l10n("FIELD_LAYER")}` },
  { value: 2, label: `2 ${l10n("FIELD_LAYERS")}` },
  { value: 3, label: `3 ${l10n("FIELD_LAYERS")}` },
];

interface ParallaxLayersEditorProps {
  name: string;
  sceneHeight: number;
  value?: SceneParallaxLayer[];
  onChange: (newValue: SceneParallaxLayer[] | undefined) => void;
}

const LayersWrapper = styled.div`
  background: ${(props) => props.theme.colors.sidebar.well.background};
  border-top: 1px solid ${(props) => props.theme.colors.sidebar.border};
  margin-left: -10px;
  margin-right: -10px;
  margin-top: 10px;
  margin-bottom: -10px;
  padding-bottom: 0;
  box-shadow: ${(props) => props.theme.colors.sidebar.well.boxShadow};
`;

const LayerIndex = styled.div`
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: ${(props) => props.theme.colors.sidebar.well.hoverBackground};
  font-weight: bold;
  border-radius: 4px;
  text-align: center;
  line-height: 28px;
`;

const LayerRow = styled.div`
  display: flex;
  padding: 0 10px;
  padding-top: 10px;
  margin-bottom: -5px;

  & > * {
    margin-right: 10px;
    margin-bottom: 10px;
  }

  & > *:last-child {
    margin-right: 0px;
  }

  :hover {
    background: ${(props) => props.theme.colors.sidebar.well.hoverBackground};
    ${LayerIndex} {
      background: ${(props) => props.theme.colors.sidebar.well.background};
    }
  }
`;

export const defaultValues: SceneParallaxLayer[] = [
  { height: 3, speed: 2 },
  { height: 3, speed: 1 },
  { height: 0, speed: 0 },
];

// The SNES's own real screen height (targets/snes.js screenTileHeight) minus
// 1 tile of safety margin, mirroring B's own MAX_PARALLAX_HEIGHT (its GB
// screen height minus 1) - not load-bearing for the compiled ROM either way
// (compileSnesData.js clips/auto-extends the real bands regardless of what's
// authored here), just keeps the editor's own numbers sane.
const MAX_PARALLAX_HEIGHT = 27;

const sliceLayers = (
  value: SceneParallaxLayer[] | undefined,
  length: number
) => {
  const slicedDefaults = defaultValues.slice(-length);
  if (!value) {
    return slicedDefaults;
  }
  const heightDiff = slicedDefaults.length - value.length;
  let heightTotal = 0;
  return slicedDefaults.map((layer, layerIndex) => {
    const prev = value[layerIndex - heightDiff];
    let newLayer = layer;
    if (prev) {
      newLayer = prev;
    }
    if (heightTotal + newLayer.height > MAX_PARALLAX_HEIGHT) {
      newLayer = {
        ...newLayer,
        height: Math.max(1, MAX_PARALLAX_HEIGHT - heightTotal),
      };
    }
    heightTotal += newLayer.height;
    return newLayer;
  });
};

const updateParallaxHeight = (
  value: SceneParallaxLayer[],
  layerIndex: number,
  height: number
) => {
  const maxLayerHeight = MAX_PARALLAX_HEIGHT - Math.max(0, value.length - 2);

  const newValue = value.map((v, i) =>
    i === layerIndex ? { ...v, height: Math.min(maxLayerHeight, height) } : v
  );

  const layersHeight = newValue.reduce((memo, layer, i) => {
    if (i < newValue.length - 1) {
      return memo + layer.height;
    }
    return memo;
  }, 0);

  let heightOverflow = layersHeight - MAX_PARALLAX_HEIGHT;
  if (heightOverflow > 0) {
    return newValue.map((v, i) => {
      if (i === layerIndex) {
        return v;
      }
      const newHeight = Math.max(1, v.height - heightOverflow);
      heightOverflow -= v.height - newHeight;
      return { ...v, height: newHeight };
    });
  }

  return newValue;
};

const updateParallaxSpeed = (
  value: SceneParallaxLayer[],
  layerIndex: number,
  speed: number
) => value.map((v, i) => (i === layerIndex ? { ...v, speed } : v));

export const ParallaxLayersEditor: FC<ParallaxLayersEditorProps> = ({
  name,
  value,
  sceneHeight,
  onChange,
}) => {
  const [selectValue, setSelectValue] = useState<ParallaxOption>(options[0]);

  useEffect(() => {
    if (!value) {
      setSelectValue(options[0]);
    } else {
      setSelectValue(
        options.find((o) => o.value === value.length) || options[0]
      );
    }
  }, [value]);

  return (
    <div id={name}>
      <Select
        name={name}
        value={selectValue}
        options={options}
        onChange={(newValue: ParallaxOption) => {
          if (newValue.value > 0) {
            onChange(sliceLayers(value, newValue.value));
          } else {
            onChange(undefined);
          }
        }}
      />
      {value && (
        <LayersWrapper>
          {value.map((layer, layerIndex) => (
            // eslint-disable-next-line react/no-array-index-key
            <LayerRow key={layerIndex}>
              <LayerIndex>{layerIndex + 1}</LayerIndex>
              <CoordinateInput
                name={`${name}_height_${layerIndex}`}
                coordinate="h"
                min={1}
                value={
                  layerIndex === value.length - 1
                    ? sceneHeight
                    : layer.height || undefined
                }
                placeholder="1"
                disabled={layerIndex === value.length - 1}
                onChange={(e) => {
                  const height = Number(e.currentTarget.value);
                  onChange(updateParallaxHeight(value, layerIndex, height));
                }}
              />
              {/* Unlike B, the last layer's speed is never force-disabled
                  here: compileSnesData.js always emits its real speed byte
                  (no "always matches camera" special case for a 3rd layer),
                  so it stays meaningful and editable on this engine. */}
              <FormField name={`${name}_speed_${layerIndex}`}>
                <ParallaxSpeedSelect
                  name={`${name}_speed_${layerIndex}`}
                  value={layer.speed}
                  onChange={(speed) => {
                    onChange(updateParallaxSpeed(value, layerIndex, speed));
                  }}
                />
              </FormField>
            </LayerRow>
          ))}
        </LayersWrapper>
      )}
    </div>
  );
};

ParallaxLayersEditor.defaultProps = {
  value: undefined,
};
