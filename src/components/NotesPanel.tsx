import { useState, useEffect, useRef, useCallback } from "react";
import type { WorkItem } from "../types/workItem";

interface NotesPanelProps {
  item: WorkItem;
  onUpdateNotes: (id: string, notes: string) => void;
  onClose: () => void;
}

export default function NotesPanel({ item, onUpdateNotes, onClose }: NotesPanelProps) {
  const [value, setValue] = useState(item.notes ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset value when item changes
  useEffect(() => {
    setValue(item.notes ?? "");
  }, [item.id, item.notes]);

  const saveNotes = useCallback(
    (text: string) => {
      const normalized = text.trim() || "";
      if (normalized !== (item.notes ?? "")) {
        onUpdateNotes(item.id, normalized);
      }
    },
    [item.id, item.notes, onUpdateNotes],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setValue(text);
      // Auto-save after 500ms of inactivity
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveNotes(text), 500);
    },
    [saveNotes],
  );

  const handleBlur = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveNotes(value);
  }, [value, saveNotes]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return (
    <div
      data-testid="notes-panel"
      className="border-t border-gray-200 bg-white flex flex-col"
      style={{ height: "200px" }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500 truncate">
          Notes — {item.title}
        </span>
        <button
          data-testid="notes-panel-close"
          className="text-gray-400 hover:text-gray-600 text-sm px-1"
          onClick={onClose}
          title="Close (Escape)"
        >
          &times;
        </button>
      </div>
      <textarea
        ref={textareaRef}
        data-testid="notes-panel-textarea"
        className="flex-1 px-3 py-2 text-sm text-gray-800 resize-none outline-none bg-white"
        placeholder="Add notes..."
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}
