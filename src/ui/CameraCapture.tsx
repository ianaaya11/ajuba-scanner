import { useCallback, useEffect, useRef, useState } from 'react';

type Failure = 'insecure' | 'denied' | 'missing' | 'error';

const MESSAGES: Record<Failure, { title: string; detail: string }> = {
  insecure: {
    title: 'Camera needs a secure connection',
    detail:
      'Browsers only allow camera access over HTTPS or on localhost. Open the site over HTTPS, or import a photo instead.',
  },
  denied: {
    title: 'Camera permission was declined',
    detail:
      'Allow camera access for this site in your browser settings, then try again. You can also import a photo.',
  },
  missing: {
    title: 'No camera found',
    detail: 'This device has no camera available. Import a photo or a PDF instead.',
  },
  error: {
    title: 'Could not start the camera',
    detail: 'Something went wrong opening the camera. Import a photo instead.',
  },
};

/**
 * Live camera preview with a shutter. Used by every browser build; the Android
 * app goes through the platform camera instead.
 */
export default function CameraCapture({
  onCapture,
  onPickFile,
  onCancel,
  guideAspect = null,
  guideLabel,
  children,
}: {
  onCapture: (blob: Blob) => void;
  onPickFile: () => void;
  onCancel: () => void;
  /** Width / height of what is being scanned, for the framing guide. */
  guideAspect?: number | null;
  guideLabel?: string;
  children?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [guideBox, setGuideBox] = useState<{ width: number; height: number } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // getUserMedia is undefined outside a secure context, which is the usual
      // reason the camera "does nothing" when testing over a LAN IP.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setFailure('insecure');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stop();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
        setFailure(null);

        // Only offer the flip control when there is more than one camera.
        // Labels are empty until permission is granted, hence checking here.
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException)?.name;
        setFailure(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'missing'
              : 'error',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facing, stop]);

  // Release the camera when the screen goes away, or the light stays on.
  useEffect(() => stop, [stop]);

  /**
   * Size the framing guide from the picture itself. Doing this in CSS needs a
   * max-height as well as a width, and whichever one clamps first silently
   * distorts the ratio — the guide then shows the wrong shape to frame against.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !guideAspect) {
      setGuideBox(null);
      return;
    }
    const measure = () => {
      const w = frame.clientWidth;
      const h = frame.clientHeight;
      if (!w || !h) return;
      const maxW = w * 0.86;
      const maxH = h * 0.78;
      // Contain: the larger of the two that still fits inside both limits.
      const width = Math.min(maxW, maxH * guideAspect);
      setGuideBox({ width, height: width / guideAspect });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [guideAspect, ready]);

  async function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, 'image/jpeg', 0.95),
      );
      if (blob) {
        stop();
        onCapture(blob);
      }
    } finally {
      setBusy(false);
    }
  }

  if (failure) {
    const { title, detail } = MESSAGES[failure];
    return (
      <>
        <div className="stage">
          <div className="empty">
            <strong>{title}</strong>
            {detail}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            Back
          </button>
          <button className="btn primary" onClick={onPickFile}>
            Import a photo
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="stage">
        {/* The frame shrink-wraps the video so the guides track the picture
            rather than the letterboxed stage around it. */}
        <div className="camera-frame" ref={frameRef}>
          <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
          {ready && (
            <div
              className={`camera-guide${guideBox ? ' shaped' : ''}`}
              style={guideBox ? { width: guideBox.width, height: guideBox.height } : undefined}
              aria-hidden="true"
            />
          )}
          {ready && guideLabel && <div className="camera-caption">{guideLabel}</div>}
        </div>
        {!ready && <div className="empty">Starting camera…</div>}
      </div>
      {children}

      <div className="actions">
        <button className="btn" onClick={onPickFile}>
          Import
        </button>
        <button
          className="btn shutter"
          onClick={shoot}
          disabled={!ready || busy}
          aria-label="Take photo"
        >
          <span />
        </button>
        {canSwitch ? (
          <button
            className="btn"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          >
            Flip
          </button>
        ) : (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </>
  );
}
