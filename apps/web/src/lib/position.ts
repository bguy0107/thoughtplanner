/**
 * Fractional index placed between two neighbors for drag-and-drop reordering.
 * Pass `undefined` for a neighbor that doesn't exist (start/end of the list).
 *
 * Returns `null` once `before`/`after` are too close together for float64 to
 * represent a distinct midpoint — repeated inserts at the same slot (e.g.
 * always dropping onto the same row) halve the remaining gap every time and
 * eventually exhaust it, at which point `(before + after) / 2` rounds back
 * to `before` or `after` and silently produces a duplicate position. Callers
 * must treat `null` as "rebalance the sibling list" (see `resolveInsertPosition`).
 */
export function positionBetween(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  const mid = (before + after) / 2
  if (mid <= before || mid >= after) return null
  return mid
}

export interface Positioned {
  id: string
  position: number
}

/**
 * Computes the position for an item inserted at `index` within `siblings`
 * (already sorted by position, NOT including the item being placed).
 *
 * When the target gap has no room left, every sibling is reassigned fresh,
 * evenly-spaced integer positions — restoring room for future inserts — and
 * returned as `rebalanced`. The caller MUST persist those alongside its own
 * write (they invalidate every sibling's previously-known position), then
 * use the returned `position` for the moved item.
 */
export function resolveInsertPosition(siblings: Positioned[], index: number): { position: number; rebalanced?: Positioned[] } {
  const before = siblings[index - 1]?.position
  const after = siblings[index]?.position
  const position = positionBetween(before, after)
  if (position !== null) return { position }

  const rebalanced = siblings.map((s, i) => ({ id: s.id, position: i }))
  const rebalancedBefore = index > 0 ? rebalanced[index - 1].position : undefined
  const rebalancedAfter = index < rebalanced.length ? rebalanced[index].position : undefined
  // Adjacent integers always have room for a midpoint, so this can't be null.
  return { position: positionBetween(rebalancedBefore, rebalancedAfter)!, rebalanced }
}
