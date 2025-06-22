import { useState, useEffect, useCallback } from 'react';
import { Box, CanvasState, Connection } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';

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
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => b.id === id ? { ...b, text, width, height } : b)
        }));
        invoke('update_box_text', { id, text, width, height }).catch(e => console.error("Backend update failed for update_box_text", e));
    }, []);
    
    const addBox = useCallback(async (box: Omit<Box, 'id' | 'text' | 'selected'>) => {
        const newBox: Box = {
            ...box,
            id: uuidv4(),
            text: '',
            selected: false,
        };
        setCanvasState(prevState => ({
            ...prevState,
            boxes: [...prevState.boxes, newBox]
        }));
        invoke('add_box', { id: newBox.id, x: newBox.x, y: newBox.y, width: newBox.width, height: newBox.height, text: newBox.text, selected: newBox.selected }).catch(e => console.error("Backend update failed for add_box", e));
    }, []);
    
    const deleteBox = useCallback(async (id: string) => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.filter(b => b.id !== id),
            connections: prevState.connections.filter(c => c.from !== id && c.to !== id)
        }));
        invoke('delete_box', { id }).catch(e => console.error("Backend update failed for delete_box", e));
    }, []);

    const moveBoxes = useCallback(async (id: string, newX: number, newY: number) => {
        // This is a complex one due to backend collision logic.
        // For now, we'll keep it as is and optimize later if needed.
        // The backend returns the final state of all potentially moved boxes.
        try {
            const updatedState = await invoke<CanvasState>('move_box', { boxId: id, newX, newY });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to move box", e);
        }
    }, []);

    const addConnection = useCallback(async (from: string, to: string) => {
        if (from === to) {
            return;
        }
        setCanvasState(prevState => {
            const connectionExists = prevState.connections.some(c =>
                (c.from === from && c.to === to) || (c.from === to && c.to === from)
            );

            if (connectionExists) {
                return prevState;
            }

            invoke('add_connection', { from, to }).catch(e => console.error("Backend update failed for add_connection", e));
            
            const newConnection: Connection = { from, to };
            return {
                ...prevState,
                connections: [...prevState.connections, newConnection]
            };
        });
    }, []);

    const toggleBoxSelection = useCallback(async (id: string) => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => b.id === id ? { ...b, selected: !b.selected } : b)
        }));
        invoke('toggle_box_selection', { id }).catch(e => console.error("Backend update failed for toggle_box_selection", e));
    }, []);

    const clearSelection = useCallback(async () => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => ({ ...b, selected: false }))
        }));
        invoke('clear_selection').catch(e => console.error("Backend update failed for clear_selection", e));
    }, []);

    const moveSelectedBoxes = useCallback(async (deltaX: number, deltaY: number) => {
         // This is a complex one due to backend collision logic.
        // For now, we'll keep it as is and optimize later if needed.
        try {
            const updatedState = await invoke<CanvasState>('move_selected_boxes', { deltaX, deltaY });
            setCanvasState(updatedState);
        } catch (e) {
            console.error("Failed to move selected boxes", e);
        }
    }, []);

    const addMultipleConnections = useCallback(async (fromIds: string[], toId: string) => {
        setCanvasState(prevState => {
            const existingConnections = new Set(
                prevState.connections.map(c => {
                    const pair = [c.from, c.to].sort();
                    return `${pair[0]}-${pair[1]}`;
                })
            );

            const newConnections: Connection[] = [];
            for (const fromId of fromIds) {
                if (fromId === toId) continue; // Prevent self-connection

                const pair = [fromId, toId].sort();
                const key = `${pair[0]}-${pair[1]}`;

                if (!existingConnections.has(key)) {
                    newConnections.push({ from: fromId, to: toId });
                    existingConnections.add(key); // Add to set to handle duplicates within the same multi-add
                }
            }

            if (newConnections.length === 0) {
                return prevState;
            }
            
            // Get the IDs of the newly added connections to send to the backend.
            const newFromIds = newConnections.map(c => c.from);
            invoke('add_multiple_connections', { fromIds: newFromIds, toId }).catch(e => console.error("Backend update failed for add_multiple_connections", e));

            return {
                ...prevState,
                connections: [...prevState.connections, ...newConnections]
            };
        });
    }, []);

    const selectBoxes = useCallback(async (ids: string[]) => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => ({...b, selected: ids.includes(b.id)}))
        }));
        invoke('select_boxes', { ids }).catch(e => console.error("Backend update failed for select_boxes", e));
    }, []);

    return { ...canvasState, setCanvasState, findBoxAt, updateBox, addBox, deleteBox, moveBoxes, addConnection, toggleBoxSelection, clearSelection, moveSelectedBoxes, addMultipleConnections, selectBoxes };
}; 