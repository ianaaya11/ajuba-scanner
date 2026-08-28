import { useEffect, useState } from 'react';
import { isInstalled, isIos, runInstall, watchInstall, type InstallPrompt } from '../lib/install';
import { Overlay } from './components';

/**
 * Offers a home-screen install. On Chromium this replays the deferred prompt;
 * on iOS, which has no such API, it explains the Share-sheet route instead.
 */
export default function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(isInstalled);

  useEffect(() => watchInstall(setPrompt), []);
  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  // Already on the home screen, and nothing to offer on browsers that neither
  // fire the event nor are iOS.
  if (installed) return null;
  const iosRoute = isIos();
  if (!prompt && !iosRoute) return null;

  return (
    <>
      <button
        className="btn sm install-btn"
        onClick={async () => {
          if (iosRoute) return setShowIosHelp(true);
          if (prompt && (await runInstall(prompt))) setInstalled(true);
          // A dismissed prompt cannot be replayed; drop it so the button goes.
          setPrompt(null);
        }}
        title="Add ajuba scanner to your home screen"
      >
        <span aria-hidden="true">↓</span>
        <span className="install-label">Install</span>
      </button>

      {showIosHelp && (
        <Overlay onClose={() => setShowIosHelp(false)}>
          <h2>Add to your Home Screen</h2>
          <p>
            Safari cannot be prompted, so it takes two taps: press{' '}
            <strong>Share</strong> in the toolbar, then <strong>Add to Home Screen</strong>.
          </p>
          <p>
            Worth doing rather than keeping a tab: Safari can clear a website's stored
            data, and scans live only on this device.
          </p>
          <button className="btn primary" style={{ width: '100%' }} onClick={() => setShowIosHelp(false)}>
            Got it
          </button>
        </Overlay>
      )}
    </>
  );
}
