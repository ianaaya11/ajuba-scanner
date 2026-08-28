export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'ajuba.theme';
export const THEMES: Theme[] = ['auto', 'light', 'dark'];

/** The ground colour of each palette, mirrored from styles.css. */
const CHROME: Record<'light' | 'dark', string> = {
  light: '#f8f9fd',
  dark: '#0a0c1a',
};

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

/** What the page actually renders as, once 'auto' is resolved. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'auto') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies a theme. 'auto' clears the attribute so the media query in the
 * stylesheet takes over again.
 *
 * The two theme-color meta tags are media-scoped for the auto case; when a
 * theme is forced they are both pinned to the chosen ground, otherwise the
 * browser chrome would keep following the device instead of the app.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;

  const resolved = resolveTheme(theme);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // On auto each tag keeps the colour for the scheme it is scoped to; when a
    // theme is forced both are pinned to it.
    // Read the attribute rather than the `media` property: the property is not
    // implemented everywhere, and an undefined there would abort the whole
    // theme change partway through.
    const scheme = (meta.getAttribute('media') ?? '').includes('dark') ? 'dark' : 'light';
    meta.content = CHROME[theme === 'auto' ? scheme : resolved];
  }

  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // A blocked store just means the choice does not survive a reload.
  }
}

export const nextTheme = (theme: Theme): Theme =>
  THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
