/**
 * Opt-in analytics. Disabled unless NEXT_PUBLIC_ANALYTICS_ENDPOINT is set at build time.
 * Only these events and fields exist. Never file content, names, previews or paths.
 * download_clicked does NOT prove another site accepted the file.
 */
import { sizeBucket, type ErrorCode } from '@lovert/core';

export type AnalyticsEvent = 'tool_started' | 'conversion_completed' | 'conversion_failed' | 'download_clicked';

export interface AnalyticsProps {
  slug: string;
  code?: ErrorCode | 'OVER_LIMIT';
  sizeBytes?: number;
}

const ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;

export function track(event: AnalyticsEvent, props: AnalyticsProps): void {
  if (!ENDPOINT || typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  const payload = {
    event,
    slug: props.slug,
    ...(props.code ? { code: props.code } : {}),
    ...(props.sizeBytes !== undefined ? { size: sizeBucket(props.sizeBytes) } : {}),
  };
  navigator.sendBeacon(ENDPOINT, JSON.stringify(payload));
}
