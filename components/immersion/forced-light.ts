import type { CSSProperties } from "react";

/**
 * Forces Compass's own palette to its light values regardless of the app's
 * current theme, for the result-panel tabs that preview what a client sees
 * (the diagram tabs already do this with Refactrd's own brand colors;
 * BottlenecksView and SolutionsView are Compass's own chrome, not the brand
 * one, but need the same forcing): a real dry run in dark mode found these
 * were the tabs that still flipped dark, reading as visually inconsistent
 * next to the diagram tabs either side of them.
 *
 * The `--c-*` custom properties are only ever redefined on `:root`
 * (app/globals.css), so a nested `data-theme` attribute here would do
 * nothing; redeclaring them directly on a wrapper works because custom
 * properties cascade normally to descendants, unlike that root-scoped
 * selector.
 */
export const FORCED_LIGHT_VARS = {
  "--c-ink": "#1c1c1e",
  "--c-ink-muted": "#45464a",
  "--c-canvas": "#faf9f6",
  "--c-surface": "#ffffff",
  "--c-surface-sunken": "#f4f2ed",
  "--c-slate": "#6e7076",
  "--c-slate-light": "#9b9ba1",
  "--c-border": "#e4e1da",
  "--c-border-strong": "#cfcbc1",
  "--c-brass": "#b08d57",
  "--c-brass-strong": "#8a6d3f",
  "--c-brass-tint": "#f3ede2",
  "--c-danger": "#a03d33",
  "--c-danger-tint": "#f7ece9",
} as CSSProperties;
