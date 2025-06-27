import React, { createContext, useContext, ReactNode } from 'react';
import { useWorkspace } from '../hooks/useWorkspace';
import { CanvasState } from '../types';

type WorkspaceContextType = {
    workspacePath: string | null;
    isWorkspaceLoading: boolean;
    currentFilePath: string | null;
    canvasState: CanvasState;
    handleWorkspaceSet: (path: string) => void;
    handleChangeWorkspace: () => void;
    loadFile: (filePath: string) => Promise<void>;
    handleSave: () => Promise<void>;
    handleSaveAs: () => Promise<void>;
    setCanvasState: React.Dispatch<React.SetStateAction<CanvasState>>;
    setCurrentFilePath: React.Dispatch<React.SetStateAction<string | null>>;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
    const workspace = useWorkspace();
    return (
        <WorkspaceContext.Provider value={workspace}>
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspaceContext = () => {
    const context = useContext(WorkspaceContext);
    if (context === undefined) {
        throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
    }
    return context;
}; 