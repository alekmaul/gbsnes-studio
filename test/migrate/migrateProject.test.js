import migrateProject from "../../src/lib/project/migrateProject";

test("should migrate conditional events from 1.0.0 to 2.0.0", () => {
  const oldProject = {
    _version: "1",
    settings: {},
    scenes: [
      {
        actors: [],
        triggers: [],
        collisions: [],
        script: [
          {
            command: "EVENT_IF_TRUE",
            true: [
              {
                command: "EVENT_TEXT",
                args: {
                  text: "Hello"
                }
              }
            ],
            false: [
              {
                command: "EVENT_TEXT",
                args: {
                  text: "World"
                }
              }
            ]
          }
        ]
      }
    ],
    backgrounds: [],
  };
  const newProject = JSON.parse(JSON.stringify(migrateProject(oldProject)));
  expect(newProject).toEqual({
    _version: "2.0.0",
    _release: "7",
    settings: {
      startMoveSpeed: 1,
      startAnimSpeed: 3,
    },
    scenes: [
      {
        symbol: "scene_1",
        width: 32,
        height: 32,
        actors: [],
        triggers: [],
        collisions: [],
        script: [
          {
            command: "EVENT_IF_TRUE",
            children: {
              true: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "Hello"
                  }
                }
              ],
              false: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "World"
                  }
                }
              ]
            },

          }
        ],
        playerHit1Script: [],
        playerHit2Script: [],
        playerHit3Script: []
      },
    ],
    backgrounds: [],
    customEvents: [],
    variables: [],
    engineFieldValues: [{
      id: "fade_style",
      value: 0
    }],
  });
});

test("should carry SNES-only settings through the 1.2.0 -> 2.0.0 migration unchanged (M10)", () => {
  // target/snesRegion/snesSramSize/customControlsX-Y-L-R aren't real
  // SettingsState fields on v2 yet (no migration-specific handling, no
  // Settings UI - M10/M11), but migrateProject.js never explicitly reads
  // or rewrites `settings` field-by-field either (its two settings-
  // touching migrations only spread-and-add specific known keys), so any
  // unrecognised setting - SNES-only or otherwise - already survives the
  // whole chain untouched. This pins that behaviour down explicitly.
  const oldProject = {
    _version: "1.2.0",
    settings: {
      target: "snes",
      snesRegion: "ntsc",
      snesSramSize: "03",
      customControlsX: "i",
      customControlsY: "u",
      customControlsL: "o",
      customControlsR: "p",
    },
    scenes: [],
    backgrounds: [],
  };
  const newProject = migrateProject(oldProject);
  expect(newProject.settings).toMatchObject({
    target: "snes",
    snesRegion: "ntsc",
    snesSramSize: "03",
    customControlsX: "i",
    customControlsY: "u",
    customControlsL: "o",
    customControlsR: "p",
  });
  expect(newProject._version).toBe("2.0.0");
  expect(newProject._release).toBe("7");
});

test("should migrate conditional events from 1.2.0 to 2.0.0", () => {
  const oldProject = {
    _version: "1.2.0",
    settings: {},
    scenes: [
      {
        actors: [],
        triggers: [],
        collisions: [],
        script: [
          {
            command: "EVENT_IF_TRUE",
            children: {
              true: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "Hello"
                  }
                }
              ],
              false: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "World"
                  }
                }
              ]
            }
          }
        ],
      }
    ],
    backgrounds: []
  };
  const newProject = JSON.parse(JSON.stringify(migrateProject(oldProject)));
  expect(newProject).toEqual({
    _version: "2.0.0",
    _release: "7",
    settings: {
      startMoveSpeed: 1,
      startAnimSpeed: 3,
    },
    scenes: [
      {
        symbol: "scene_1",
        width: 32,
        height: 32,
        actors: [],
        triggers: [],
        collisions: [],
        script: [
          {
            command: "EVENT_IF_TRUE",
            children: {
              true: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "Hello"
                  }
                }
              ],
              false: [
                {
                  command: "EVENT_TEXT",
                  args: {
                    text: "World"
                  }
                }
              ]
            }
          }
        ],
        playerHit1Script: [],
        playerHit2Script: [],
        playerHit3Script: []
      }
    ],
    backgrounds: [],
    customEvents: [],
    variables: [],
    engineFieldValues: [{
      id: "fade_style",
      value: 0
    }],
  });
});
