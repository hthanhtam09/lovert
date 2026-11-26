import { useId } from 'react';

/**
 * Lovert mark: an orange heart (love) with a folded page corner (a file) and a conversion arrow cut out of it.
 * The arrow is a hole (even-odd fill), so the background shows through, as in the reference artwork. Decorative next to the wordmark.
 */
export function Logo({ size = 32 }: { size?: number }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        {/* Cuts the heart's top-right lobe along the fold line, like a turned-down page corner. */}
        <clipPath id={clip}>
          <path d="M0 0h42.4L64 21.6V64H0z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path
          fill="#E4693D"
          fillRule="evenodd"
          d="M32 15.6C35 11.1 39.6 8.5 44.6 8.5 52.1 8.5 58 14.6 58 22.1c0 3.9-1.5 7.4-4.1 10L35.3 50.8c-1.8 1.8-4.8 1.8-6.6 0L10.1 32.1C7.5 29.5 6 26 6 22.1 6 14.6 11.9 8.5 19.4 8.5c5 0 9.6 2.6 12.6 7.1zM22 27.7h11.4V25c0-1.2 1.4-1.7 2.2-.9l5.4 5.4c.7.6.7 1.6 0 2.2l-5.4 5.4c-.8.8-2.2.3-2.2-.9v-2.6H22c-.8 0-1.4-.6-1.4-1.4v-3.2c0-.8.6-1.4 1.4-1.4z"
        />
      </g>
      <path fill="#FAC4A5" d="M42.4 12.6 53.8 24h-7.9c-1.9 0-3.5-1.6-3.5-3.5z" />
    </svg>
  );
}
