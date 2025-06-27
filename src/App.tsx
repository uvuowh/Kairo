import "./App.css";
import WorkspacePicker from './components/WorkspacePicker';
import EditorLayout from "./layouts/EditorLayout";
import { WorkspaceProvider, useWorkspaceContext } from "./contexts/WorkspaceContext";

const AppContent = () => {
  const { 
    isWorkspaceLoading, 
    workspacePath, 
    handleWorkspaceSet 
  } = useWorkspaceContext();

  if (isWorkspaceLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!workspacePath) {
    return <WorkspacePicker onWorkspaceSet={handleWorkspaceSet} />;
  }

  return <EditorLayout />;
}

function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
    </WorkspaceProvider>
  );
}

export default App;