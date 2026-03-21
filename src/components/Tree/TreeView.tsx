import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useWorkItemStore } from "../../store/workItems";
import { flattenVisibleTree } from "../../lib/tree";
import { getAppendSortOrder } from "../../lib/fractional";
import { generateId } from "../../lib/uuid";
import type { WorkItemStatus } from "../../types/workItem";
import TreeItem from "./TreeItem";

export default function TreeView() {
  const {
    items,
    rootIds,
    childrenMap,
    isLoading,
    error,
    loadTree,
    createWorkItem,
    updateWorkItem,
    deleteWorkItem,
  } = useWorkItemStore();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const flatNodes = useMemo(
    () => flattenVisibleTree(rootIds, childrenMap, expanded),
    [rootIds, childrenMap, expanded],
  );

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAddRoot = useCallback(async () => {
    const siblings = rootIds.map((id) => items.get(id)!);
    const sortOrder = getAppendSortOrder(siblings);
    const id = generateId();
    await createWorkItem({ id, title: "New item", sortOrder });
    setEditingId(id);
  }, [rootIds, items, createWorkItem]);

  const handleAddChild = useCallback(
    async (parentId: string) => {
      const childIds = childrenMap.get(parentId) ?? [];
      const siblings = childIds.map((id) => items.get(id)!);
      const sortOrder = getAppendSortOrder(siblings);
      const id = generateId();
      await createWorkItem({ id, title: "New item", parentId, sortOrder });
      setExpanded((prev) => new Set(prev).add(parentId));
      setEditingId(id);
    },
    [childrenMap, items, createWorkItem],
  );

  const handleUpdateTitle = useCallback(
    (id: string, title: string) => {
      updateWorkItem(id, { title });
    },
    [updateWorkItem],
  );

  const handleUpdateStatus = useCallback(
    (id: string, status: WorkItemStatus) => {
      updateWorkItem(id, { status });
    },
    [updateWorkItem],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteWorkItem(id);
    },
    [deleteWorkItem],
  );

  const handleEditingDone = useCallback(() => {
    setEditingId(null);
  }, []);

  if (isLoading && items.size === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="px-3 py-2 bg-red-50 text-red-700 text-sm border-b border-red-200">
          {error}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        {flatNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-3 py-12">
            <p>No work items yet.</p>
            <button
              data-testid="root-add-item-button"
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              onClick={handleAddRoot}
            >
              Add first item
            </button>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const node = flatNodes[virtualItem.index];
              const item = items.get(node.id);
              if (!item) return null;
              const childIds = childrenMap.get(node.id);
              const hasChildren = !!childIds && childIds.length > 0;

              return (
                <div
                  key={node.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TreeItem
                    item={item}
                    depth={node.depth}
                    hasChildren={hasChildren}
                    isExpanded={expanded.has(node.id)}
                    startEditing={editingId === node.id}
                    onToggleExpand={toggleExpand}
                    onUpdateTitle={handleUpdateTitle}
                    onUpdateStatus={handleUpdateStatus}
                    onDelete={handleDelete}
                    onAddChild={handleAddChild}
                    onEditingDone={handleEditingDone}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {flatNodes.length > 0 && (
        <div className="border-t border-gray-200 px-3 py-2">
          <button
            data-testid="root-add-item-button"
            className="text-sm text-gray-500 hover:text-blue-600"
            onClick={handleAddRoot}
          >
            + Add item
          </button>
        </div>
      )}
    </div>
  );
}
