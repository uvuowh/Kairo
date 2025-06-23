import { useEffect, useCallback } from 'react';
import { Box, CanvasState, Connection, ConnectionType } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';
import { useHistory, Command } from './useHistory';

// --- Command Definitions ---

interface AddBoxCommand extends Command<CanvasState> {
    type: 'addBox';
    box: Box;
}

interface DeleteBoxCommand extends Command<CanvasState> {
    type: 'deleteBox';
    boxId: string;
    deletedBox: Box;
    deletedConnections: Connection[];
}

interface UpdateBoxCommand extends Command<CanvasState> {
    type: 'updateBox';
    boxId: string;
    oldText: string;
    newText: string;
    oldWidth: number;
    newWidth: number;
    oldHeight: number;
    newHeight: number;
}

interface AddConnectionCommand extends Command<CanvasState> {
    type: 'addConnection';
    connection: Connection;
}

interface MoveCommand extends Command<CanvasState> {
    type: 'move';
    oldState: CanvasState;
    newState: CanvasState;
}

// --- Hook Implementation ---

export const useCanvas = () => {
    const { 
        state: canvasState, 
        setState: setCanvasState, 
        execute, 
        undo, 
        redo, 
        canUndo, 
        canRedo 
    } = useHistory<CanvasState>({ boxes: [], connections: [] });
    
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
    }, [setCanvasState]);

    const findBoxAt = useCallback((gridX: number, gridY: number) => {
        return canvasState.boxes.find(box => 
            gridX >= box.x && 
            gridX < box.x + box.width && 
            gridY >= box.y && 
            gridY < box.y + box.height
        );
    }, [canvasState.boxes]);
    
    const updateBox = useCallback(async (id: string, text: string, width: number, height: number) => {
        const boxToUpdate = canvasState.boxes.find(b => b.id === id);
        if (!boxToUpdate) return;
        
        const command: UpdateBoxCommand = {
            type: 'updateBox',
            boxId: id,
            oldText: boxToUpdate.text,
            newText: text,
            oldWidth: boxToUpdate.width,
            newWidth: width,
            oldHeight: boxToUpdate.height,
            newHeight: height,
            execute: (state) => ({
                ...state,
                boxes: state.boxes.map(b => b.id === id ? { ...b, text, width, height } : b)
            }),
            undo: (state) => ({
                ...state,
                boxes: state.boxes.map(b => b.id === id ? { ...b, text: boxToUpdate.text, width: boxToUpdate.width, height: boxToUpdate.height } : b)
            })
        };

        execute(command);
        invoke('update_box_text', { id, text, width, height }).catch(e => console.error("Backend update failed for update_box_text", e));
    }, [canvasState.boxes, execute]);
    
    const addBox = useCallback(async (box: Omit<Box, 'id' | 'text' | 'selected'>) => {
        const newBox: Box = {
            ...box,
            id: uuidv4(),
            text: '',
            selected: false,
        };
        
        const command: AddBoxCommand = {
            type: 'addBox',
            box: newBox,
            execute: (state) => ({ ...state, boxes: [...state.boxes, newBox] }),
            undo: (state) => ({ ...state, boxes: state.boxes.filter(b => b.id !== newBox.id) })
        };
        
        execute(command);
        invoke('add_box', { ...newBox }).catch(e => console.error("Backend update failed for add_box", e));
    }, [execute]);
    
    const deleteBox = useCallback(async (id: string) => {
        const boxToDelete = canvasState.boxes.find(b => b.id === id);
        if (!boxToDelete) return;

        const connectionsToDelete = canvasState.connections.filter(c => c.from === id || c.to === id);

        const command: DeleteBoxCommand = {
            type: 'deleteBox',
            boxId: id,
            deletedBox: boxToDelete,
            deletedConnections: connectionsToDelete,
            execute: (state) => ({
                ...state,
                boxes: state.boxes.filter(b => b.id !== id),
                connections: state.connections.filter(c => c.from !== id && c.to !== id)
            }),
            undo: (state) => ({
                ...state,
                boxes: [...state.boxes, boxToDelete],
                connections: [...state.connections, ...connectionsToDelete]
            })
        };

        execute(command);
        invoke('delete_box', { id }).catch(e => console.error("Backend update failed for delete_box", e));
    }, [canvasState, execute]);

    const moveBoxes = useCallback(async (id: string, newX: number, newY: number) => {
        const oldState = { ...canvasState };
        try {
            const newState = await invoke<CanvasState>('move_box', { boxId: id, newX, newY });
            
            const command: MoveCommand = {
                type: 'move',
                oldState: oldState,
                newState: newState,
                execute: () => newState,
                undo: () => oldState,
            };
            execute(command);

        } catch (e) {
            console.error("Failed to move box", e);
        }
    }, [canvasState, execute]);

    const addConnection = useCallback(async (from: string, to: string) => {
        if (from === to) return;
        const connectionExists = canvasState.connections.some(c =>
            (c.from === from && c.to === to) || (c.from === to && c.to === from)
        );
        if (connectionExists) return;

        const newConnection: Connection = { from, to, type: ConnectionType.Forward };
        
        const command: AddConnectionCommand = {
            type: 'addConnection',
            connection: newConnection,
            execute: (state) => ({
                ...state,
                connections: [...state.connections, newConnection]
            }),
            undo: (state) => ({
                ...state,
                connections: state.connections.filter(c => !(c.from === from && c.to === to))
            })
        };

        execute(command);
        invoke('add_connection', { from, to }).catch(e => console.error("Backend update failed for add_connection", e));
    }, [canvasState.connections, execute]);

    const toggleBoxSelection = useCallback(async (id: string) => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => b.id === id ? { ...b, selected: !b.selected } : b)
        }));
        invoke('toggle_box_selection', { id }).catch(e => console.error("Backend update failed for toggle_box_selection", e));
    }, [setCanvasState]);

    const clearSelection = useCallback(async () => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => ({ ...b, selected: false }))
        }));
        invoke('clear_selection').catch(e => console.error("Backend update failed for clear_selection", e));
    }, [setCanvasState]);

    const moveSelectedBoxes = useCallback(async (deltaX: number, deltaY: number) => {
        const oldState = { ...canvasState };
        try {
            const newState = await invoke<CanvasState>('move_selected_boxes', { deltaX, deltaY });
            
            const command: MoveCommand = {
                type: 'move',
                oldState: oldState,
                newState: newState,
                execute: () => newState,
                undo: () => oldState,
            };
            execute(command);
        } catch (e) {
            console.error("Failed to move selected boxes", e);
        }
    }, [canvasState, execute]);

    const toggleConnections = useCallback(async (fromIds: string[], toId: string) => {
        const oldState = { ...canvasState };
        try {
            const newState = await invoke<CanvasState>('toggle_connections', { fromIds, toId });
            const command: MoveCommand = { // Using MoveCommand as it handles full state changes
                type: 'move',
                oldState: oldState,
                newState: newState,
                execute: () => newState,
                undo: () => oldState,
            };
            execute(command);
        } catch (e) {
            console.error("Backend update failed for toggle_connections", e);
        }
    }, [canvasState, execute]);

    const cycleConnectionType = useCallback(async (from: string, to: string) => {
        const oldState = { ...canvasState };
        try {
            const updatedConnection = await invoke<Connection>('cycle_connection_type', { from, to });
            if (updatedConnection) {
                const newState = {
                    ...oldState,
                    connections: oldState.connections.map(c => 
                        (c.from === from && c.to === to) || (c.from === to && c.to === from)
                        ? updatedConnection 
                        : c
                    )
                };
                 const command: MoveCommand = { // Using MoveCommand as it handles full state changes
                    type: 'move',
                    oldState: oldState,
                    newState: newState,
                    execute: () => newState,
                    undo: () => oldState,
                };
                execute(command);
            }
        } catch (e) {
            console.error("Failed to cycle connection type", e);
        }
    }, [canvasState, execute]);

    const selectBoxes = useCallback(async (ids: string[]) => {
        setCanvasState(prevState => ({
            ...prevState,
            boxes: prevState.boxes.map(b => ({...b, selected: ids.includes(b.id)}))
        }));
        invoke('select_boxes', { ids }).catch(e => console.error("Backend update failed for select_boxes", e));
    }, [setCanvasState]);

    return { 
        ...canvasState, 
        setCanvasState, // Keep for non-history actions like selection
        findBoxAt, 
        updateBox, 
        addBox, 
        deleteBox, 
        moveBoxes, 
        addConnection, 
        toggleBoxSelection, 
        clearSelection, 
        moveSelectedBoxes, 
        toggleConnections, 
        cycleConnectionType, 
        selectBoxes,
        undo,
        redo,
        canUndo,
        canRedo
    };
}; 