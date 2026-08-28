import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, loadTheme, nextTheme, resolveTheme } from '../lib/theme';

/** jsdom has no matchMedia; stand one in that reports a fixed scheme. */
function withScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query.includes('dark'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.head.innerHTML =
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="">' +
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="">';
});

describe('cycling', () => {
  it('goes auto to light to dark and back', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});

describe('resolveTheme', () => {
  it('follows the device when on auto', () => {
    withScheme(true);
    expect(resolveTheme('auto')).toBe('dark');
    withScheme(false);
    expect(resolveTheme('auto')).toBe('light');
  });

  it('ignores the device when a theme is forced', () => {
    withScheme(true);
    expect(resolveTheme('light')).toBe('light');
    withScheme(false);
    expect(resolveTheme('dark')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('stamps the attribute the stylesheet keys off', () => {
    withScheme(false);
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('clears the attribute on auto so the media query takes over', () => {
    withScheme(false);
    applyTheme('dark');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('persists a forced theme and forgets auto', () => {
    withScheme(false);
    applyTheme('dark');
    expect(loadTheme()).toBe('dark');
    applyTheme('auto');
    expect(loadTheme()).toBe('auto');
  });

  it('pins both theme-color tags when forced, and restores them on auto', () => {
    withScheme(false);
    const metas = () =>
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content);

    applyTheme('dark');
    // Forced dark: the browser chrome must not keep following the device.
    expect(new Set(metas()).size).toBe(1);
    expect(metas()[0]).toBe('#0a0c1a');

    applyTheme('auto');
    expect(metas()).toEqual(['#f8f9fd', '#0a0c1a']);
  });

  it('survives a blocked localStorage', () => {
    withScheme(false);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    setItem.mockRestore();
  });
});
