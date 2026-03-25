import { useEffect, useRef, useState, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useWorkItemStore } from "../../store/workItems";
import { flattenVisibleTree } from "../../lib/tree";
import { getAppendSortOrder, getSortOrderBetween, needsRebalance } from "../../lib/fractional";
import { generateId } from "../../lib/uuid";
import type { WorkItemStatus } from "../../types/workItem";
import TreeItem from "./TreeItem";
import type { DropPosition } from "./TreeItem";
import NotesPanel from "../NotesPanel";
import type { TreeViewHandle } from "../../App";

interface DragState {
  dragId: string;
  targetId: string | null;
  position: DropPosition | null;
}

export default forwardRef<TreeViewHandle>(function TreeView(_props, ref) {
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
    rebalanceSiblings,
  } = useWorkItemStore();

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("tracksy:expanded");
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore corrupt data */ }
    return new Set();
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem("tracksy:selected");
      if (stored) return stored;
    } catch { /* ignore corrupt data */ }
    return null;
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [notesWidth, setNotesWidth] = useState<number>(() => {
    const stored = localStorage.getItem("tracksy:notes-width");
    return stored ? Number(stored) : 350;
  });
  const [isResizing, setIsResizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    localStorage.setItem("tracksy:expanded", JSON.stringify([...expanded]));
  }, [expanded]);

  // Persist notes panel width
  useEffect(() => {
    localStorage.setItem("tracksy:notes-width", String(notesWidth));
  }, [notesWidth]);

  // Auto-select first root item if nothing is selected or selection is stale
  const effectiveSelectedId = selectedId && items.get(selectedId) ? selectedId
    : rootIds.length > 0 ? rootIds[0]
    : null;

  // Sync auto-selected item back to state and localStorage
  useEffect(() => {
    if (effectiveSelectedId && effectiveSelectedId !== selectedId) {
      setSelectedId(effectiveSelectedId);
      localStorage.setItem("tracksy:selected", effectiveSelectedId);
    }
  }, [effectiveSelectedId, selectedId]);

  // Resize handler for the divider
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      setNotesWidth(Math.max(200, Math.min(newWidth, containerRect.width - 200)));
    };
    const handleMouseUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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

  useImperativeHandle(ref, () => ({
    addRootItem: () => { handleAddRoot(); },
  }), [handleAddRoot]);

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

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem("tracksy:selected", id);
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleUpdateNotes = useCallback(
    (id: string, notes: string) => {
      updateWorkItem(id, { notes });
    },
    [updateWorkItem],
  );

  const handleDismissError = useCallback(() => {
    useWorkItemStore.setState({ error: null });
  }, []);

  // --- Drag and drop ---

  const handleDragStart = useCallback((id: string) => {
    setDrag({ dragId: id, targetId: null, position: null });
  }, []);

  const handleDragOver = useCallback(
    (targetId: string, position: DropPosition) => {
      setDrag((prev) => {
        if (!prev) return null;
        // Only allow drops between siblings (same parent_id)
        const dragItem = items.get(prev.dragId);
        const targetItem = items.get(targetId);
        if (!dragItem || !targetItem) return prev;
        if (dragItem.parent_id !== targetItem.parent_id) return prev;
        if (targetId === prev.dragId) return prev;
        return { ...prev, targetId, position };
      });
    },
    [items],
  );

  const handleDragLeave = useCallback(() => {
    // Only clear target, keep dragId
    setDrag((prev) => (prev ? { ...prev, targetId: null, position: null } : null));
  }, []);

  const handleDrop = useCallback(() => {
    if (!drag?.targetId || !drag.position) return;

    const dragItem = items.get(drag.dragId);
    const targetItem = items.get(drag.targetId);
    if (!dragItem || !targetItem) return;

    // Get the ordered sibling list for this parent
    const siblingIds =
      dragItem.parent_id === null
        ? rootIds
        : childrenMap.get(dragItem.parent_id) ?? [];

    // Build the sibling list without the dragged item
    const withoutDrag = siblingIds.filter((id) => id !== drag.dragId);
    const targetIdx = withoutDrag.indexOf(drag.targetId);
    if (targetIdx === -1) return;

    // Compute insertion index
    const insertIdx =
      drag.position === "before" ? targetIdx : targetIdx + 1;

    // Get neighbor sort_orders
    const before =
      insertIdx > 0 ? items.get(withoutDrag[insertIdx - 1])!.sort_order : null;
    const after =
      insertIdx < withoutDrag.length
        ? items.get(withoutDrag[insertIdx])!.sort_order
        : null;

    const newSortOrder = getSortOrderBetween(before, after);

    const parentId = dragItem.parent_id;
    updateWorkItem(drag.dragId, { sortOrder: newSortOrder }).then(() => {
      // Check if adjacent sort_orders are too close and need rebalancing
      if (
        (before !== null && needsRebalance(before, newSortOrder)) ||
        (after !== null && needsRebalance(newSortOrder, after))
      ) {
        rebalanceSiblings(parentId);
      }
    });
    setDrag(null);
  }, [drag, items, rootIds, childrenMap, updateWorkItem, rebalanceSiblings]);

  const handleDragEnd = useCallback(() => {
    setDrag(null);
  }, []);

  // --- Render ---

  if (isLoading && items.size === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  const selectedItem = effectiveSelectedId ? items.get(effectiveSelectedId) : undefined;

  return (
    <div ref={containerRef} className="flex h-full" style={isResizing ? { userSelect: "none" } : undefined}>
      {/* Left: Tree panel */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {error && (
          <div className="flex items-center justify-between px-3 py-2 bg-red-50 text-red-700 text-sm border-b border-red-200">
            <span>{error}</span>
            <button
              data-testid="error-dismiss"
              className="text-red-400 hover:text-red-600 ml-2 text-sm"
              onClick={handleDismissError}
            >
              &times;
            </button>
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

                const isDropTarget = drag?.targetId === node.id;
                const dropIndicator = isDropTarget ? drag.position : null;

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
                      isSelected={effectiveSelectedId === node.id}
                      startEditing={editingId === node.id}
                      dropIndicator={dropIndicator}
                      onToggleExpand={toggleExpand}
                      onSelect={handleSelect}
                      onUpdateTitle={handleUpdateTitle}
                      onUpdateStatus={handleUpdateStatus}
                      onDelete={handleDelete}
                      onAddChild={handleAddChild}
                      onEditingDone={handleEditingDone}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
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

      {/* Right: Notes panel (always visible) with resizable divider */}
      {/* Drag divider */}
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize shrink-0 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />
      <div style={{ width: notesWidth }} className="shrink-0 h-full border-l border-gray-200">
        {selectedItem ? (
          <NotesPanel
            item={selectedItem}
            onUpdateNotes={handleUpdateNotes}
            onClose={handleDeselectAll}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select an item to view notes
          </div>
        )}
      </div>
    </div>
  );
});
