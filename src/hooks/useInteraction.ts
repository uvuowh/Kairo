import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Connection, MouseDownState, GRID_CONSTANTS, SelectionArea } from '../types';
import { isPreviewCollidingWithAny, doBoxesIntersect } from '../utils/collision';
import { DELETE_HANDLE_RADIUS } from '../hooks/useCanvasDrawing';

export interface BoxPreview {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const useInteraction = (
    boxes: Box[], 
    connections: Connection[],
    findBoxAt: (gridX: number, gridY: number) => Box | undefined,
    addBox: (box: Omit<Box, 'id' | 'text'>) => void,
    onBoxClick: (box: Box, worldX: number, worldY: number) => void,
    onBoxDoubleClick: (box: Box, mouseX: number, mouseY: number) => void,
    onBoxDelete: (boxId: string) => void,
    onDoubleClickEmpty: (gridX: number, gridY: number) => void,
    pan: { x: number, y: number },
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>,
    zoom: number,
    moveBoxes: (id: string, newX: number, newY: number) => Promise<void>,
    moveSelectedBoxes: (deltaX: number, deltaY: number) => Promise<void>,
    addConnection: (from: string, to: string) => Promise<void>,
    toggleConnections: (fromIds: string[], toId: string) => Promise<void>,
    cycleConnectionType: (from: string, to: string) => Promise<void>,
    selectBoxes: (ids: string[]) => Promise<void>,
    toggleBoxSelection: (id: string) => Promise<void>,
    clearSelection: () => Promise<void>
) => {
    const mouseDownRef = useRef<MouseDownState | null>(null);
    const initialPanRef = useRef({ x: 0, y: 0 });
    const moveRequestRef = useRef<number | null>(null);
    const latestMoveDataRef = useRef<{ boxId: string, newX: number, newY: number, startX: number, startY: number } | null>(null);
    const [draggingBox, setDraggingBox] = useState<{
        boxId: string;
        offsetX: number;
        offsetY: number;
    } | null>(null);
    const [newBoxPreview, setNewBoxPreview] = useState<BoxPreview | null>(null);
    const [hoveredDeleteButton, setHoveredDeleteButton] = useState<string | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [selectionArea, setSelectionArea] = useState<SelectionArea | null>(null);

    const lastClickTime = useRef(0);
    
    const findConnectionAt = (worldX: number, worldY: number, connections: Connection[], boxes: Box[]): Connection | null => {
        const CLICK_THRESHOLD = 5; // pixels
        let closestConnection = null;
        let minDistance = Infinity;

        for (const conn of connections) {
            const fromBox = boxes.find(b => b.id === conn.from);
            const toBox = boxes.find(b => b.id === conn.to);

            if (fromBox && toBox) {
                const p1x = (fromBox.x + fromBox.width / 2) * GRID_CONSTANTS.gridSize;
                const p1y = (fromBox.y + fromBox.height / 2) * GRID_CONSTANTS.gridSize;
                const p2x = (toBox.x + toBox.width / 2) * GRID_CONSTANTS.gridSize;
                const p2y = (toBox.y + toBox.height / 2) * GRID_CONSTANTS.gridSize;
                
                const l2 = Math.pow(p1x - p2x, 2) + Math.pow(p1y - p2y, 2);
                if (l2 === 0) continue;

                let t = ((worldX - p1x) * (p2x - p1x) + (worldY - p1y) * (p2y - p1y)) / l2;
                t = Math.max(0, Math.min(1, t));

                const projX = p1x + t * (p2x - p1x);
                const projY = p1y + t * (p2y - p1y);
                const dist = Math.sqrt(Math.pow(worldX - projX, 2) + Math.pow(worldY - projY, 2));
                
                if (dist < CLICK_THRESHOLD && dist < minDistance) {
                    minDistance = dist;
                    closestConnection = conn;
                }
            }
        }
        return closestConnection;
    };

    const screenToWorld = useCallback((screenX: number, screenY: number) => {
        const worldX = (screenX - pan.x) / zoom;
        const worldY = (screenY - pan.y) / zoom;
        return { worldX, worldY };
    }, [pan, zoom]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const gridX = Math.floor(worldX / GRID_CONSTANTS.gridSize);
        const gridY = Math.floor(worldY / GRID_CONSTANTS.gridSize);
        
        const clickedBox = findBoxAt(gridX, gridY);
        const selectedBoxes = boxes.filter(b => b.selected);

        if (e.button === 2) { // Right mouse button
            e.preventDefault(); // Always prevent context menu first

            // Priority 1: Check if a box was clicked. This is the most specific target.
            if (clickedBox) {
                if (!clickedBox.selected) {
                    const fromIds = selectedBoxes.map(b => b.id).filter(id => id !== clickedBox.id);
                    if (fromIds.length > 0) {
                        toggleConnections(fromIds, clickedBox.id);
                    }
                }
                // If the box was clicked (selected or not), we consider the action handled.
                return;
            }

            // Priority 2: If no box was clicked, check if a connection line was clicked.
            const clickedConnection = findConnectionAt(worldX, worldY, connections, boxes);
            if (clickedConnection) {
                cycleConnectionType(clickedConnection.from, clickedConnection.to);
                return;
            }
        }
        
        if (e.button === 1) { // Middle mouse button for panning
            setIsPanning(true);
            initialPanRef.current = pan; 
            mouseDownRef.current = {
                time: Date.now(),
                x: e.clientX,
                y: e.clientY,
                gridX: 0, 
                gridY: 0,
                boxId: null
            };
            return;
        }

        const now = Date.now();
        const DOUBLE_CLICK_THRESHOLD = 300; 

        if (hoveredDeleteButton) {
            onBoxDelete(hoveredDeleteButton);
            setHoveredDeleteButton(null);
            mouseDownRef.current = null; 
            return;
        }

        if (now - lastClickTime.current < DOUBLE_CLICK_THRESHOLD) {
            if (clickedBox) {
                onBoxDoubleClick(clickedBox, worldX, worldY);
            } else {
                onDoubleClickEmpty(gridX, gridY);
            }
            lastClickTime.current = 0; 
            mouseDownRef.current = null; 
            return;
        }
        lastClickTime.current = now;

        // General click handling
        mouseDownRef.current = {
            time: now,
            x: worldX,
            y: worldY,
            gridX,
            gridY,
            boxId: clickedBox?.id || null,
        };

        if (e.ctrlKey) {
            if (clickedBox) {
                // With ctrl, click on a box toggles it without deselecting others.
                toggleBoxSelection(clickedBox.id);
                mouseDownRef.current = null; // Prevent drag
            } else {
                // With ctrl, click on empty space starts lasso selection.
                setSelectionArea({
                    startX: worldX,
                    startY: worldY,
                    endX: worldX,
                    endY: worldY,
                });
                // We don't clear selection here, we do it on mouse up to allow for ctrl+click combos
            }
        } else {
            // Without ctrl
            if (clickedBox) {
                // if the clicked box is not selected, we clear previous selection
                // and select only the clicked one.
                if (!clickedBox.selected) {
                    clearSelection().then(() => {
                        toggleBoxSelection(clickedBox.id);
                    });
                }
                // If it's already selected (part of a group or single), 
                // we do nothing, allowing a drag to be initiated.
            } else {
                // Clicked on empty space, clear all selection
                if (selectedBoxes.length > 0) {
                   clearSelection();
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isPanning && mouseDownRef.current) {
            const dx = e.clientX - mouseDownRef.current.x;
            const dy = e.clientY - mouseDownRef.current.y;
            setPan({ 
                x: initialPanRef.current.x + dx, 
                y: initialPanRef.current.y + dy 
            });
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const selectedBoxes = boxes.filter(b => b.selected);
        const selectedBox = selectedBoxes.length === 1 ? selectedBoxes[0] : null;


        if (!mouseDownRef.current) {
            let isHoveringOnDeleteButton = false;
            
            if (selectedBox) {
                const box = selectedBox;
                const rectX = box.x * GRID_CONSTANTS.gridSize;
                const rectY = box.y * GRID_CONSTANTS.gridSize;
                const rectW = box.width * GRID_CONSTANTS.gridSize;

                const deleteHandleCenterX = rectX + rectW;
                const deleteHandleCenterY = rectY;
                const deleteDistance = Math.sqrt(Math.pow(worldX - deleteHandleCenterX, 2) + Math.pow(worldY - deleteHandleCenterY, 2));

                if (deleteDistance < DELETE_HANDLE_RADIUS) {
                    isHoveringOnDeleteButton = true;
                    setHoveredDeleteButton(box.id);
                }
            }
            
            if (!isHoveringOnDeleteButton) {
                setHoveredDeleteButton(null);
            }

            e.currentTarget.style.cursor = isHoveringOnDeleteButton ? 'pointer' : 'default';
            return;
        }
        
        const DRAG_THRESHOLD = 5;
        const distance = Math.sqrt(
            Math.pow(worldX - mouseDownRef.current.x, 2) +
            Math.pow(worldY - mouseDownRef.current.y, 2)
        );

        if (distance < DRAG_THRESHOLD) {
            return;
        }
        
        // Start dragging
        if (mouseDownRef.current.boxId && !draggingBox) {
            const box = boxes.find(b => b.id === mouseDownRef.current!.boxId)!;

            // This logic is now in mouseDown. If a box is selected, we can drag.
            // If we are here, it means the clicked box is selected (or just became selected).
            setDraggingBox({
                boxId: mouseDownRef.current.boxId,
                offsetX: mouseDownRef.current.gridX - box.x,
                offsetY: mouseDownRef.current.gridY - box.y,
            });
        }

        if (draggingBox) {
            const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            const newGridX = Math.round((worldX / GRID_CONSTANTS.gridSize) - draggingBox.offsetX);
            const newGridY = Math.round((worldY / GRID_CONSTANTS.gridSize) - draggingBox.offsetY);
            
            const originalBox = boxes.find(b => b.id === draggingBox.boxId);
            if (!originalBox) return;

            latestMoveDataRef.current = { 
                boxId: draggingBox.boxId, 
                newX: newGridX, newY: newGridY,
                startX: originalBox.x, startY: originalBox.y
            };

            if (!moveRequestRef.current) {
                moveRequestRef.current = requestAnimationFrame(() => {
                    if (latestMoveDataRef.current) {
                        const { boxId, newX, newY, startX, startY } = latestMoveDataRef.current;
                        const draggedBox = boxes.find(b => b.id === boxId);

                        if (draggedBox?.selected) {
                            const deltaX = newX - startX;
                            const deltaY = newY - startY;
                            if (deltaX !== 0 || deltaY !== 0) {
                                moveSelectedBoxes(deltaX, deltaY);
                            }
                        } else {
                            moveBoxes(boxId, newX, newY);
                        }
                    }
                    moveRequestRef.current = null; 
                });
            }
        }

        // Handle selection area dragging
        if (selectionArea) {
            setSelectionArea(prev => prev ? { ...prev, endX: worldX, endY: worldY } : null);
            return;
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (moveRequestRef.current) {
            cancelAnimationFrame(moveRequestRef.current);
            moveRequestRef.current = null;
        }
        if (latestMoveDataRef.current) {
            const { boxId, newX, newY, startX, startY } = latestMoveDataRef.current;
            const draggedBox = boxes.find(b => b.id === boxId);
            if (draggedBox?.selected) {
                const deltaX = newX - startX;
                const deltaY = newY - startY;
                 if (deltaX !== 0 || deltaY !== 0) {
                    moveSelectedBoxes(deltaX, deltaY);
                }
            } else {
                moveBoxes(boxId, newX, newY);
            }
            latestMoveDataRef.current = null;
        }

        if (isPanning) {
            setIsPanning(false);
            mouseDownRef.current = null;
            return;
        }

        if (selectionArea) {
            const minX = Math.min(selectionArea.startX, selectionArea.endX);
            const maxX = Math.max(selectionArea.startX, selectionArea.endX);
            const minY = Math.min(selectionArea.startY, selectionArea.endY);
            const maxY = Math.max(selectionArea.startY, selectionArea.endY);

            const selectionRect = {
                x: minX / GRID_CONSTANTS.gridSize,
                y: minY / GRID_CONSTANTS.gridSize,
                width: (maxX - minX) / GRID_CONSTANTS.gridSize,
                height: (maxY - minY) / GRID_CONSTANTS.gridSize,
            };

            const marqueeSelectedIds = boxes
                .filter(box => doBoxesIntersect(box, selectionRect))
                .map(box => box.id);
            
            const previouslySelectedIds = boxes
                .filter(box => box.selected)
                .map(box => box.id);

            const combinedIds = [...new Set([...previouslySelectedIds, ...marqueeSelectedIds])];

            selectBoxes(combinedIds);
            setSelectionArea(null);
            mouseDownRef.current = null;
            return;
        }

        const DRAG_THRESHOLD = 5;

        if (mouseDownRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            const distance = Math.sqrt(
                Math.pow(worldX - mouseDownRef.current.x, 2) +
                Math.pow(worldY - mouseDownRef.current.y, 2)
            );
            
            // This was a click, not a drag
            if (distance < DRAG_THRESHOLD) {
                const clickedBox = findBoxAt(mouseDownRef.current.gridX, mouseDownRef.current.gridY);
                const selectedBoxes = boxes.filter(b => b.selected);

                // We only trigger onBoxClick if there's exactly one selected box after the click
                // and that box was the one that was clicked.
                if (clickedBox && selectedBoxes.length === 1 && selectedBoxes[0].id === clickedBox.id) {
                    onBoxClick(clickedBox, worldX, worldY);
                }
            }
        }
        
        setDraggingBox(null);
        setNewBoxPreview(null);
        mouseDownRef.current = null;
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        // The logic is now in handleMouseDown, but we might need to prevent
        // the menu in other cases too. For now, this is simpler.
        // It's already handled in onMouseDown, but let's prevent it here too for safety.
        e.preventDefault();
    };

    return { 
        handleMouseDown, 
        handleMouseMove, 
        handleMouseUp, 
        handleContextMenu,
        draggingBox, 
        newBoxPreview, 
        selectionArea,
        hoveredDeleteButton,
        isPanning,
    };
};

const doBoxesIntersect = (boxA: { x: number, y: number, width: number, height: number }, boxB: { x: number, y: number, width: number, height: number }) => {
    const boxA_x = boxA.x;
    const boxA_y = boxA.y;
    const boxA_w = boxA.width;
    const boxA_h = boxA.height;

    const boxB_x = boxB.x;
    const boxB_y = boxB.y;
    const boxB_w = boxB.width;
    const boxB_h = boxB.height;

    // Check for no overlap
    if (boxA_x + boxA_w < boxB_x || 
        boxB_x + boxB_w < boxA_x || 
        boxA_y + boxA_h < boxB_y || 
        boxB_y + boxB_h < boxA_y) {
        return false;
    }

    return true;
}; 