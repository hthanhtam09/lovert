/** Feature detection that is safe to import from server-rendered components. */
export function canvasSupported(): boolean {
  return typeof document !== 'undefined' && !!document.createElement('canvas').getContext;
}
