/** Lovert mark: an orange file with a conversion arrow. Decorative next to the wordmark. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        fill="#F25008"
        d="M19 6h20.6c1.7 0 3.3.7 4.4 1.9l10.2 10.9c1.1 1.2 1.8 2.8 1.8 4.4V52c0 3.3-2.7 6-6 6H19c-3.3 0-6-2.7-6-6V12c0-3.3 2.7-6 6-6z"
      />
      <path fill="#fff" d="M40 9.4v8.1c0 1.8 1.4 3.2 3.2 3.2h7.6z" />
      <path
        fill="#fff"
        d="M35 29.2c0-1.1 1.4-1.7 2.2-.9l8.9 8.9c.5.5.5 1.3 0 1.8l-8.9 8.9c-.8.8-2.2.2-2.2-.9V42H23.2c-1.2 0-2.2-1-2.2-2.2v-4.6c0-1.2 1-2.2 2.2-2.2H35z"
      />
    </svg>
  );
}
