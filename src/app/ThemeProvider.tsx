import { useEffect, type ReactNode } from 'react';
import { useFeed } from '../data/useLive';
import { applyTheme } from '../ui/theme';
import { useAppData } from './appDataContext';

/**
 * Puts the stored appearance and accent on the page once settings are read, and again on every
 * change from this tab or another. Only `<html>` attributes change: everything drawn reads CSS
 * variables, so nothing below is remounted. Until settings load, the defaults `main.tsx`
 * applied stay.
 */
export function ThemeProvider({ children }: { readonly children?: ReactNode }) {
  const settings = useFeed(useAppData().settings.feed);
  const loaded = settings.status === 'ready' ? settings.value : null;
  const appearance = loaded?.['display.appearance'];
  const accent = loaded?.['display.accent'];

  useEffect(() => {
    if (appearance === undefined || accent === undefined) return;
    // The stop function ends System's OS listener when the choice changes or the app unmounts.
    return applyTheme({ appearance, accent });
  }, [appearance, accent]);

  return children;
}
