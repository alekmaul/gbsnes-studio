import "jest-extended";
import Path from "path";
import middleware from "../../../../src/store/features/engine/engineMiddleware";
import actions from "../../../../src/store/features/engine/engineActions";
import { RootState } from "../../../../src/store/configureStore";
import { MiddlewareAPI, Dispatch, AnyAction } from "@reduxjs/toolkit";

jest.mock("electron");

test("Should be able to scan ejected engine for new fields", async () => {
  const dispatch = jest.fn();
  const store = ({
    getState: () => ({
      project: {
        present: {
          entities: {
            customEvents: {
              entities: {},
              ids: [],
            },
            variables: {
              entities: {},
              ids: [],
            },
          },
        },
      },
    }),
    dispatch,
  } as unknown) as MiddlewareAPI<Dispatch<AnyAction>, RootState>;

  const next = jest.fn();
  const action = actions.scanEngine(
    Path.resolve(
      `${__dirname}/../../../data/projects/Test_Eject/Test_Eject.gbsproj`
    )
  );

  await middleware(store)(next)(action);

  expect(next).toHaveBeenCalledWith(action);
  expect(dispatch).toHaveBeenCalledWith({
    payload: [
      {
        cType: "WORD",
        defaultValue: 304,
        group: "GAMETYPE_PLATFORMER",
        key: "test_field_1",
        label: "FIELD_MIN_VEL",
        max: 16384,
        min: 0,
        type: "slider",
      },
      {
        cType: "UBYTE",
        defaultValue: 8,
        group: "GAMETYPE_TOP_DOWN",
        key: "test_field_2",
        label: "FIELD_GRID_SIZE",
        options: [
          [8, "FIELD_GRID_8PX"],
          [16, "FIELD_GRID_16PX"],
        ],
        type: "select",
      },
    ],
    type: "engine/setEngineFields",
  });
});

test("Should get default fields when engine not ejected", async () => {
  const dispatch = jest.fn();
  const store = ({
    getState: () => ({
      project: {
        present: {
          entities: {
            customEvents: {
              entities: {},
              ids: [],
            },
            variables: {
              entities: {},
              ids: [],
            },
          },
        },
      },
    }),
    dispatch,
  } as unknown) as MiddlewareAPI<Dispatch<AnyAction>, RootState>;

  const next = jest.fn();
  const action = actions.scanEngine(
    Path.resolve(
      `${__dirname}/../../../data/projects/BlankProject/BlankProject.gbsproj`
    )
  );

  await middleware(store)(next)(action);

  expect(next).toHaveBeenCalledWith(action);
  expect(dispatch).toHaveBeenCalled();
  expect(dispatch.mock.calls[0][0].type).toBe("engine/setEngineFields");
  // v4: appData/src/snes/engine.json is now populated (topdown_grid, the
  // Platformer physics constants, Shmup's shooter_scroll_speed) - was an
  // empty "fields": [] stub until this milestone. Check shape/count rather
  // than the full 12-entry array, so this test doesn't need updating every
  // time a field's min/max/defaultValue is tuned.
  const fields = dispatch.mock.calls[0][0].payload;
  expect(fields).toHaveLength(12);
  expect(fields.map((f: { key: string }) => f.key)).toEqual(
    expect.arrayContaining(["topdown_grid", "plat_jump_vel", "shooter_scroll_speed"])
  );
});
