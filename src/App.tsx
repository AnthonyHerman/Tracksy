import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import TreeView from "./components/Tree/TreeView";

export type TreeViewHandle = {
  addRootItem: () => void;
};

function App() {
  const treeRef = useRef<TreeViewHandle>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "q") {
        e.preventDefault();
        invoke("quit_app");
      }
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        treeRef.current?.addRootItem();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center px-4 py-2 border-b border-gray-200 bg-white">
        <h1 className="text-sm font-semibold text-gray-900">Tracksy</h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <TreeView ref={treeRef} />
      </main>
    </div>
  );
}

export default App;
