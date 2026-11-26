'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * Owns one object URL at a time. Setting a new Blob creates its URL; the previous
 * URL is revoked when it is replaced and the last one on unmount.
 */
export function useObjectUrl(): [string | null, (blob: Blob | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  const set = useCallback((blob: Blob | null) => setUrl(blob ? URL.createObjectURL(blob) : null), []);
  return [url, set];
}
