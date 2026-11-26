/**
 * "Love" + "rt": the product name "Lovert", with "Love" in the heart's orange.
 * Rendered as one word so screen readers read "Lovert".
 * The text orange (#BF4A26) is a shade darker than the mark (#E4693D) so it keeps ≥ 4.5:1 contrast on white.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-baseline font-extrabold tracking-[-0.045em]">
      <span className="text-[#BF4A26]">Love</span>
      <span className="text-foreground">rt</span>
    </span>
  );
}
