import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import './WorkspacePicker.css';

interface WorkspacePickerProps {
    onWorkspaceSet: (path: string) => void;
}

const WorkspacePicker: React.FC<WorkspacePickerProps> = ({ onWorkspaceSet }) => {
    const handleSelectWorkspace = async () => {
        try {
            const selectedPath = await open({
                directory: true,
                multiple: false,
                title: 'Select Kairo Workspace',
            });

            if (typeof selectedPath === 'string') {
                await invoke('set_workspace_path', { path: selectedPath });
                onWorkspaceSet(selectedPath);
            }
        } catch (error) {
            console.error("Failed to select workspace:", error);
            // You might want to show an error to the user here
        }
    };

    return (
        <div className="workspace-picker-container">
            <div className="workspace-picker-box">
                <h1>Welcome to Kairo</h1>
                <p>Please select a folder to use as your workspace. All your Kairo files will be stored here.</p>
                <button onClick={handleSelectWorkspace}>Select Workspace Folder</button>
            </div>
        </div>
    );
};

export default WorkspacePicker; 