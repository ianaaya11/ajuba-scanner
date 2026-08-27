import { useEffect, useState } from 'react';
import { getBlob } from '../lib/db';
import { objectUrl } from '../lib/image';

/** Resolves a stored blob key to a cached object URL for <img src>. */
export function useBlobUrl(key: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      setUrl(undefined);
      return;
    }
    getBlob(key).then((blob) => {
      if (!cancelled && blob) setUrl(objectUrl(key, blob));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return url;
}
