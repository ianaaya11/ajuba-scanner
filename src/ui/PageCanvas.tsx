import { useEffect, useRef, useState } from 'react';
import type { Page } from '../types';
import { getBlob } from '../lib/db';
import { blobToImageData, imageDataToCanvas, rotateCanvas } from '../lib/image';

/**
 * Draws a page with its rotation already baked into the pixels.
 *
 * Rotating with a CSS transform happens after layout, so a quarter-turned page
 * overflows the box that was sized for its unrotated shape. Painting the
 * rotated bitmap instead means plain `max-width/height: 100%` fits it, and the
 * annotation overlay can share the element's box one-to-one.
 */
export default function PageCanvas({
  page,
  className,
  maxSide,
  onReady,
}: {
  page: Page;
  className?: string;
  /** Downscale cap — thumbnails do not need full resolution. */
  maxSide?: number;
  onReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const blob = await getBlob(page.imageKey);
      const canvas = ref.current;
      if (!blob || !canvas || cancelled) {
        if (!blob) setFailed(true);
        return;
      }

      let source = imageDataToCanvas(await blobToImageData(blob));
      source = rotateCanvas(source, page.rotation);

      const scale = maxSide ? Math.min(1, maxSide / Math.max(source.width, source.height)) : 1;
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      if (cancelled) return;

      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      onReady?.(canvas);
    })();

    return () => {
      cancelled = true;
    };
    // onReady is intentionally excluded; callers pass inline callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.imageKey, page.rotation, maxSide]);

  if (failed) return <div className={className} />;
  return <canvas ref={ref} className={className} />;
}
