import { useLayoutEffect, type ReactNode } from 'react';
import { applyTheme, DEFAULT_THEME, type SchemeQuery } from '../ui/theme';
import { useShellSettings } from './ports';

export interface ThemeProviderProps {
  readonly children?: ReactNode;
  /** The element the theme attributes go on (default `<html>`). */
  readonly root?: HTMLElement;
  /** The device's dark-scheme query (default the browser's; `null` when there is none). */
  readonly media?: SchemeQuery | null;
}

/**
 * Keeps the page's theme in step with the appearance and accent settings. The children are
 * rendered as they are and never remounted: everything reads the colour tokens, so a change
 * repaints in place. Until the settings are read the default choice is shown.
 */
export function ThemeProvider({ children, root, media }: ThemeProviderProps) {
  const settings = useShellSettings();
  const appearance = settings?.appearance ?? DEFAULT_THEME.appearance;
  const accent = settings?.accent ?? DEFAULT_THEME.accent;

  // The returned stop drops the device listener before the next choice is applied.
  useLayoutEffect(
    () => applyTheme({ appearance, accent }, root, media),
    [appearance, accent, root, media],
  );

  return children;
}
