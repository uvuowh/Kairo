import React from 'react';
import './Toolbar.css';

interface ToolbarProps {
    isFileTreeVisible: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onToggleFileTree: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    onResetView: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
    isFileTreeVisible,
    canUndo,
    canRedo,
    onToggleFileTree,
    onUndo,
    onRedo,
    onSave,
    onSaveAs,
    onResetView
}) => {
    return (
        <div className="top-bar">
            <div className="toolbar">
                <div className="toolbar-section">
                    <button onClick={onToggleFileTree}>
                        {isFileTreeVisible ? 'Hide' : 'Show'} Files
                    </button>
                    <button onClick={onUndo} disabled={!canUndo}>Undo</button>
                    <button onClick={onRedo} disabled={!canRedo}>Redo</button>
                </div>
                <div className="toolbar-section">
                    <button onClick={onSave}>Save</button>
                    <button onClick={onSaveAs}>Save As...</button>
                    <button onClick={onResetView}>Reset View</button>
                </div>
            </div>
        </div>
    );
};

export default Toolbar;

