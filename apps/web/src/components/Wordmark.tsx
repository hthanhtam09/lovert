/**
 * "Lo" (from local) + "vert" (from convert): the product name "Lovert".
 * Rendered as one word so screen readers read "Lovert".
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-baseline font-extrabold tracking-[-0.045em]">
      <span className="text-foreground">Lo</span>
      <span className="bg-gradient-to-br from-[#f25008] to-[#a63713] bg-clip-text text-transparent">vert</span>
    </span>
  );
}
