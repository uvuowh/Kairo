import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './FileTree.css';

export interface FileNode {
    name: string;
    path: string;
    is_directory: boolean;
    children?: FileNode[];
}

interface FileTreeProps {
    workspacePath: string;
    onFileSelect: (path: string) => void;
}

const FileTreeNode: React.FC<{ node: FileNode; onFileSelect: (path: string) => void; level?: number }> = ({ node, onFileSelect, level = 0 }) => {
    const [isOpen, setIsOpen] = useState(true);

    const handleToggle = () => {
        if (node.is_directory) {
            setIsOpen(!isOpen);
        }
    };

    const handleFileClick = () => {
        if (!node.is_directory) {
            onFileSelect(node.path);
        }
    };
    
    const paddingLeft = `${level * 20}px`;

    return (
        <div className="file-tree-node">
            <div className={`node-content ${node.is_directory ? 'node-directory' : 'node-file'}`} style={{ paddingLeft }} onClick={node.is_directory ? handleToggle : handleFileClick}>
                {node.is_directory && (
                    <span className={`arrow ${isOpen ? 'open' : ''}`}>&#9654;</span>
                )}
                <span className="node-name">{node.name}</span>
            </div>
            {node.is_directory && isOpen && node.children && (
                <div className="node-children">
                    {node.children.map(child => (
                        <FileTreeNode key={child.path} node={child} onFileSelect={onFileSelect} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};


const FileTree: React.FC<FileTreeProps> = ({ workspacePath, onFileSelect }) => {
    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchFileTree = async () => {
            try {
                const files = await invoke<FileNode[]>('list_directory_contents', { path: workspacePath });
                setFileTree(files);
                setError(null);
            } catch (err) {
                console.error("Failed to list directory contents:", err);
                setError(typeof err === 'string' ? err : 'An unknown error occurred.');
            }
        };

        if (workspacePath) {
            fetchFileTree();
        }
    }, [workspacePath]);

    if (error) {
        return <div className="file-tree-container error">Error loading file tree: {error}</div>;
    }

    return (
        <div className="file-tree-container">
            {fileTree.map(node => (
                <FileTreeNode key={node.path} node={node} onFileSelect={onFileSelect} />
            ))}
        </div>
    );
};

export default FileTree; 