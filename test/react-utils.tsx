import React from "react";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { AnyAction, Store } from "@reduxjs/toolkit";
import { RootState } from "../src/store/configureStore";
import ThemeProvider from "../src/components/ui/theme/ThemeProvider";

type RenderParameters = Parameters<typeof render>;

// @types/react-redux's Provider (still typed as a class component here) and
// the @types/react version this fresh install resolved disagree on
// ElementClass's shape ("Property 'refs' is missing") - a known version-drift
// mismatch, not a real behavioural issue. Test-only helper, so a loose cast
// is fine rather than chasing an exact matching pair of type packages.
const TypedProvider = Provider as unknown as React.ComponentType<{
  store: Store<RootState, AnyAction>;
  children?: React.ReactNode;
}>;

const customRender = (
  ui: RenderParameters[0],
  store?: Store<RootState, AnyAction>,
  options?: RenderParameters[1]
) => {
  return render(ui, {
    wrapper: store
      ? ({ children }) => (
          <TypedProvider store={store}>
            <ThemeProvider>{children}</ThemeProvider>
          </TypedProvider>
        )
      : ({ children }) => <ThemeProvider>{children}</ThemeProvider>,
    ...options,
  });
};

// re-export everything
export * from "@testing-library/react";

// override render method
export { customRender as render };
