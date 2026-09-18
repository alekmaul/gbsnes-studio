import reducer, {
  initialState,
  NavigationState,
} from "../../../../src/store/features/navigation/navigationState";
import actions from "../../../../src/store/features/navigation/navigationActions";
import consoleActions from "../../../../src/store/features/console/consoleActions";

test("Should be able to set section", () => {
  const state: NavigationState = {
    ...initialState,
    section: "ui",
  };
  const action = actions.setSection("music");
  expect(state.section).toBe("ui");

  const newState = reducer(state, action);
  expect(newState.section).toBe("music");
});

test("Should be able to set navigation id", () => {
  const state: NavigationState = {
    ...initialState,
    id: "1",
  };
  const action = actions.setNavigationId("2");
  expect(state.id).toBe("1");

  const newState = reducer(state, action);
  expect(newState.id).toBe("2");
});

test("Should switch to build page on any console errors", () => {
  const state: NavigationState = {
    ...initialState,
    section: "world",
  };
  const action = consoleActions.stdErr("Failed to build");

  const newState = reducer(state, action);
  expect(newState.section).toBe("build");
});
