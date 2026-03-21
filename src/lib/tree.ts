export interface FlattenedNode {
  id: string;
  depth: number;
}

/**
 * Walk the tree and produce a flat list of visible nodes for virtualized rendering.
 * Only children of expanded nodes are included.
 */
export function flattenVisibleTree(
  rootIds: string[],
  childrenMap: Map<string, string[]>,
  expanded: Set<string>,
): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  function walk(ids: string[], depth: number) {
    for (const id of ids) {
      result.push({ id, depth });
      if (expanded.has(id)) {
        const children = childrenMap.get(id) ?? [];
        walk(children, depth + 1);
      }
    }
  }

  walk(rootIds, 0);
  return result;
}
