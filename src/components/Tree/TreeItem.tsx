import { useState, useRef, useEffect, useCallback } from "react";
import type { WorkItem, WorkItemStatus } from "../../types/workItem";
import { WORK_ITEM_STATUSES } from "../../types/workItem";

interface TreeItemProps {
  item: WorkItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  startEditing: boolean;
  onToggleExpand: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateStatus: (id: string, status: WorkItemStatus) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEditingDone: () => void;
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  todo: "Todo",
  active: "Active",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export default function TreeItem({
  item,
  depth,
  hasChildren,
  isExpanded,
  startEditing,
  onToggleExpand,
  onUpdateTitle,
  onUpdateStatus,
  onDelete,
  onAddChild,
  onEditingDone,
}: TreeItemProps) {
  const [isEditing, setIsEditing] = useState(startEditing);
  const [editValue, setEditValue] = useState(item.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startEditing && !isEditing) {
      setIsEditing(true);
      setEditValue(item.title);
    }
  }, [startEditing, isEditing, item.title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== item.title) {
      onUpdateTitle(item.id, trimmed);
    }
    setIsEditing(false);
    onEditingDone();
  }, [editValue, item.title, item.id, onUpdateTitle, onEditingDone]);

  const cancelEdit = useCallback(() => {
    setEditValue(item.title);
    setIsEditing(false);
    onEditingDone();
  }, [item.title, onEditingDone]);

  const isDone = item.status === "done" || item.status === "cancelled";

  return (
    <div
      data-testid={`tree-item-${item.id}`}
      className="flex items-center gap-1.5 px-2 py-1 hover:bg-gray-100 rounded group"
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
    >
      {/* Expand/collapse toggle */}
      <button
        data-testid="tree-item-expand-toggle"
        className={`w-5 h-5 flex items-center justify-center text-gray-400 rounded hover:bg-gray-200 text-xs ${
          hasChildren ? "visible" : "invisible"
        }`}
        onClick={() => onToggleExpand(item.id)}
      >
        {isExpanded ? "\u25BE" : "\u25B8"}
      </button>

      {/* Title */}
      {isEditing ? (
        <input
          ref={inputRef}
          data-testid="tree-item-title"
          className="flex-1 min-w-0 px-1.5 py-0.5 text-sm border border-blue-400 rounded outline-none bg-white"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
        />
      ) : (
        <span
          data-testid="tree-item-title"
          className={`flex-1 min-w-0 truncate text-sm cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-200 ${
            isDone ? "line-through text-gray-400" : "text-gray-900"
          }`}
          onDoubleClick={() => {
            setEditValue(item.title);
            setIsEditing(true);
          }}
        >
          {item.title}
        </span>
      )}

      {/* Status select */}
      <select
        data-testid="tree-item-status-select"
        className={`text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-white cursor-pointer ${
          isDone ? "text-gray-400" : "text-gray-700"
        }`}
        value={item.status}
        onChange={(e) =>
          onUpdateStatus(item.id, e.target.value as WorkItemStatus)
        }
      >
        {WORK_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          data-testid="tree-item-add-child-button"
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded text-sm"
          onClick={() => onAddChild(item.id)}
          title="Add child"
        >
          +
        </button>
        <button
          data-testid="tree-item-delete-button"
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded text-sm"
          onClick={() => onDelete(item.id)}
          title="Delete"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
