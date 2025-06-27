import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { CanvasState } from '../types';

export const useWorkspace = () => {
    const [workspacePath, setWorkspacePath] = useState<string | null>(null);
    const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
    const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
    const [canvasState, setCanvasState] = useState<CanvasState>({ boxes: [], connections: [] });

    useEffect(() => {
        const checkWorkspace = async () => {
            try {
                const path = await invoke<string | null>('get_workspace_path');
                setWorkspacePath(path);
            } catch (error) {
                console.error("Failed to get workspace path:", error);
            } finally {
                setIsWorkspaceLoading(false);
            }
        };
        checkWorkspace();
    }, []);

    const handleWorkspaceSet = useCallback((path: string) => {
        setWorkspacePath(path);
        setCurrentFilePath(null);
        setCanvasState({ boxes: [], connections: [] });
        invoke('set_workspace_path', { path });
    }, []);

    const handleChangeWorkspace = useCallback(() => {
        setWorkspacePath(null);
        setCurrentFilePath(null);
        setCanvasState({ boxes: [], connections: [] });
        invoke('clear_workspace_path');
    }, []);

    const loadFile = useCallback(async (filePath: string) => {
        try {
            const content = await readTextFile(filePath);
            const loadedState: CanvasState = JSON.parse(content);
            if (loadedState && Array.isArray(loadedState.boxes) && Array.isArray(loadedState.connections)) {
                const syncedState = await invoke<CanvasState>('load_new_state', { newState: loadedState });
                setCanvasState(syncedState);
                setCurrentFilePath(filePath);
            } else {
                console.error("Invalid file format");
            }
        } catch (err) {
            console.error("Error loading file:", err);
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (currentFilePath) {
            try {
                await writeTextFile(currentFilePath, JSON.stringify(canvasState, null, 2));
            } catch (err) {
                console.error("Error saving file:", err);
            }
        } else {
            await handleSaveAs();
        }
    }, [currentFilePath, canvasState]);

    const handleSaveAs = useCallback(async () => {
        try {
            const filePath = await save({
                title: "Save Kairo File As",
                filters: [{ name: 'Kairo File', extensions: ['kairo'] }],
                defaultPath: workspacePath || undefined,
            });
            if (filePath) {
                await writeTextFile(filePath, JSON.stringify(canvasState, null, 2));
                setCurrentFilePath(filePath);
            }
        } catch (err) {
            console.error("Error saving file:", err);
        }
    }, [workspacePath, canvasState]);

    return {
        workspacePath,
        isWorkspaceLoading,
        currentFilePath,
        canvasState,
        handleWorkspaceSet,
        handleChangeWorkspace,
        loadFile,
        handleSave,
        handleSaveAs,
        setCanvasState,
        setCurrentFilePath,
    };
}; 