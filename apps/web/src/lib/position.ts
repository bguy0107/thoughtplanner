/**
 * Fractional index placed between two neighbors for drag-and-drop reordering.
 * Pass `undefined` for a neighbor that doesn't exist (start/end of the list).
 */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}
