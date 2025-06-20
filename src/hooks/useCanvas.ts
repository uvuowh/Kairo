import { useState, useEffect, useCallback } from 'react';
import { Box, CanvasState, Connection } from '../types';
import { invoke } from '@tauri-apps/api/core';

export const useCanvas = () => {
    const [canvasState, setCanvasState] = useState<CanvasState>({ boxes: [], connections: [] });
    
    useEffect(() => {
        const fetchState = async () => {
            try {
                const initialState = await invoke<CanvasState>('get_full_state');
                setCanvasState(initialState);
            } catch (e) {
                console.error("Failed to fetch state from backend", e);
            }
        };
        fetchState();
    }, []);

    const findBoxAt = useCallback((gridX: number, gridY: number) => {
        return canvasState.boxes.find(box => 
            gridX >= box.x && 
            gridX < box.x + box.width && 
            gridY >= box.y && 
            gridY < box.y + box.height
        );
    }, [canvasState.boxes]);
    
    const updateBox = useCallback(async (id: string, text: string, width: number, height: number) => {
        try {
            const updatedState = await invoke<CanvasState>('update_box_text', { id, text, width, height });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to update box", e);
        }
    }, []);
    
    const addBox = useCallback(async (box: Omit<Box, 'id' | 'text'>) => {
        try {
            const { x, y, width, height } = box;
            const updatedState = await invoke<CanvasState>('add_box', { x, y, width, height });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to add box", e);
        }
    }, []);
    
    const deleteBox = useCallback(async (id: string) => {
        try {
            const updatedState = await invoke<CanvasState>('delete_box', { id });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to delete box", e);
        }
    }, []);

    const moveBoxes = useCallback(async (id: string, newX: number, newY: number) => {
        try {
            const updatedState = await invoke<CanvasState>('move_box', { boxId: id, newX, newY });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to move box", e);
        }
    }, []);

    const addConnection = useCallback(async (from: string, to: string) => {
        try {
            const updatedState = await invoke<CanvasState>('add_connection', { from, to });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to add connection", e);
        }
    }, []);

    const toggleBoxSelection = useCallback(async (id: string) => {
        try {
            const updatedState = await invoke<CanvasState>('toggle_box_selection', { id });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to toggle box selection", e);
        }
    }, []);

    const clearSelection = useCallback(async () => {
        try {
            const updatedState = await invoke<CanvasState>('clear_selection');
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to clear selection", e);
        }
    }, []);

    const moveSelectedBoxes = useCallback(async (deltaX: number, deltaY: number) => {
        try {
            const updatedState = await invoke<CanvasState>('move_selected_boxes', { deltaX, deltaY });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to move selected boxes", e);
        }
    }, []);

    return { ...canvasState, setCanvasState, findBoxAt, updateBox, addBox, deleteBox, moveBoxes, addConnection, toggleBoxSelection, clearSelection, moveSelectedBoxes };
}; 