/**
 * Home-screen install.
 *
 * Chromium fires `beforeinstallprompt` when a site passes its install checks,
 * and hands over an event that can be replayed later from a real user gesture.
 * Safari has no such API, so iOS is told what to do by hand instead.
 */

export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** True when the app is already running from the home screen. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS reports it here rather than through display-mode.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iOS cannot be prompted; it needs the Share sheet. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Watches for the install prompt and for the app being installed.
 * Returns an unsubscribe function.
 */
export function watchInstall(
  onChange: (prompt: InstallPrompt | null) => void,
): () => void {
  const onBefore = (e: Event) => {
    // Chrome shows its own mini-infobar otherwise, and the event is then spent.
    e.preventDefault();
    onChange(e as InstallPrompt);
  };
  const onInstalled = () => onChange(null);

  window.addEventListener('beforeinstallprompt', onBefore);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onBefore);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Replays a stored prompt. Returns whether the user accepted. */
export async function runInstall(prompt: InstallPrompt): Promise<boolean> {
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}
