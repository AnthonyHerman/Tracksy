import TreeView from "./components/Tree/TreeView";

function App() {
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
