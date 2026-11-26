/**
 * Latest-wins job guard. When the user changes files while a job runs,
 * results of the old job are discarded.
 */
export function createJobGuard() {
  let current = 0;
  return {
    start(): number {
      return ++current;
    },
    isCurrent(id: number): boolean {
      return id === current;
    },
    cancel(): void {
      current++;
    },
  };
}
