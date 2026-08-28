import { useEffect, useState } from 'react';
import { applyTheme, loadTheme, nextTheme, type Theme } from '../lib/theme';

const LABELS: Record<Theme, { icon: string; text: string }> = {
  auto: { icon: '◐', text: 'Auto' },
  light: { icon: '☀', text: 'Light' },
  dark: { icon: '☾', text: 'Dark' },
};

/** Cycles auto → light → dark. 'Auto' follows the device setting. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // While on auto, the device flipping scheme has to repaint the chrome too.
  useEffect(() => {
    if (theme !== 'auto') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => applyTheme('auto');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const { icon, text } = LABELS[theme];
  return (
    <button
      className="btn sm theme-toggle"
      onClick={() => setTheme(nextTheme(theme))}
      title={`Theme: ${text} — tap for ${LABELS[nextTheme(theme)].text}`}
      aria-label={`Theme: ${text}. Switch to ${LABELS[nextTheme(theme)].text}.`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="theme-label">{text}</span>
    </button>
  );
}
