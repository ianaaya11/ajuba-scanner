import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { isInstalled, isIos } from '../lib/install';

/** Stands in for the event Chromium hands over when a site is installable. */
function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const setUserAgent = (ua: string) =>
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });

afterEach(() => {
  setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/140');
  vi.unstubAllGlobals();
});

describe('isInstalled', () => {
  it('detects a standalone display mode', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    expect(isInstalled()).toBe(true);
  });

  it('is false in an ordinary tab', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isInstalled()).toBe(false);
  });
});

describe('isIos', () => {
  it('recognises an iPhone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari');
    expect(isIos()).toBe(true);
  });
});

describe('the install button', () => {
  it('stays hidden until the browser says the app is installable', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
  });

  it('appears once the prompt event fires, and replays it when pressed', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    const event = fireInstallPrompt('accepted');
    const button = await screen.findByRole('button', { name: /install/i });

    await act(async () => {
      button.click();
    });
    // The stored event is what actually opens the system dialog.
    expect(event.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: /install/i })).toBeNull());
  });

  it('goes away for good once the app is installed', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    fireInstallPrompt();
    await screen.findByRole('button', { name: /install/i });

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: /install/i })).toBeNull());
  });

  it('offers the Share-sheet route on iOS, which cannot be prompted', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari');
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    // No beforeinstallprompt on iOS — the button must show anyway.
    const button = await screen.findByRole('button', { name: /install/i });
    act(() => {
      button.click();
    });
    expect(await screen.findByText('Add to your Home Screen')).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
  });
});
