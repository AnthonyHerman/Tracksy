import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import TreeView from "./components/Tree/TreeView";

function App() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "q") {
        e.preventDefault();
        invoke("quit_app");
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
        <TreeView />
      </main>
    </div>
  );
}

export default App;
