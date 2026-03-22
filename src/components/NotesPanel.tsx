import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { WorkItem } from "../types/workItem";

marked.setOptions({ async: false });

interface NotesPanelProps {
  item: WorkItem;
  onUpdateNotes: (id: string, notes: string) => void;
  onClose: () => void;
}

type NotesMode = "edit" | "preview";

export default function NotesPanel({ item, onUpdateNotes, onClose }: NotesPanelProps) {
  const [value, setValue] = useState(item.notes ?? "");
  const [mode, setMode] = useState<NotesMode>(() => {
    return (localStorage.getItem("tracksy:notes-mode") as NotesMode) || "edit";
  });
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset value when item changes
  useEffect(() => {
    setValue(item.notes ?? "");
  }, [item.id, item.notes]);

  // Persist mode preference
  useEffect(() => {
    localStorage.setItem("tracksy:notes-mode", mode);
  }, [mode]);

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
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => saveNotes(text), 500);
    },
    [saveNotes],
  );

  const handleBlur = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveNotes(value);
  }, [value, saveNotes]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const renderedHtml = useMemo(() => {
    if (mode !== "preview" || !value) return "";
    const raw = marked.parse(value, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [mode, value]);

  return (
    <div
      data-testid="notes-panel"
      className="flex flex-col h-full bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 shrink-0">
        <span className="text-xs font-medium text-gray-500 truncate">
          {item.title}
        </span>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <button
            data-testid="notes-mode-edit"
            className={`text-xs px-2 py-0.5 rounded ${
              mode === "edit"
                ? "bg-gray-200 text-gray-800"
                : "text-gray-400 hover:text-gray-600"
            }`}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            data-testid="notes-mode-preview"
            className={`text-xs px-2 py-0.5 rounded ${
              mode === "preview"
                ? "bg-gray-200 text-gray-800"
                : "text-gray-400 hover:text-gray-600"
            }`}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            data-testid="notes-panel-close"
            className="text-gray-400 hover:text-gray-600 text-sm px-1 ml-1"
            onClick={onClose}
            title="Close (Escape)"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "edit" ? (
        <textarea
          data-testid="notes-panel-textarea"
          className="flex-1 px-3 py-2 text-sm text-gray-800 resize-none outline-none bg-white font-mono"
          placeholder="Add notes... (Markdown supported)"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      ) : (
        <div
          data-testid="notes-panel-preview"
          className="flex-1 px-3 py-2 text-sm text-gray-800 overflow-auto prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderedHtml || '<span class="text-gray-400">No notes yet.</span>' }}
        />
      )}
    </div>
  );
}
