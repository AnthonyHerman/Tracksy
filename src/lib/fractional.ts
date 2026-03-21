/**
 * Compute sort_order for inserting between two neighbors.
 * - Both null: first item → 1.0
 * - before null: inserting at start → half of after
 * - after null: inserting at end → before + 1.0
 * - Both present: midpoint
 */
export function getSortOrderBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return 1.0;
  if (before === null) return after! / 2;
  if (after === null) return before + 1.0;
  return (before + after) / 2;
}

/**
 * Compute sort_order for appending after the last sibling.
 */
export function getAppendSortOrder(
  siblings: { sort_order: number }[],
): number {
  if (siblings.length === 0) return 1.0;
  return siblings[siblings.length - 1].sort_order + 1.0;
}

/**
 * Returns true if two adjacent sort_orders are too close and a rebalance
 * is needed. Threshold per SPEC.md § 5.2: 1e-10.
 */
export function needsRebalance(a: number, b: number): boolean {
  return Math.abs(b - a) < 1e-10;
}
