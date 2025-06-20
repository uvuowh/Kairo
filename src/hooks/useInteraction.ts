import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, MouseDownState, GRID_CONSTANTS } from '../types';
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
    setBoxes: (boxes: Box[]) => void,
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

    const lastClickTime = useRef(0);
    
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
            if (selectedBoxes.length === 1 && clickedBox && clickedBox.id !== selectedBoxes[0].id) {
                addConnection(selectedBoxes[0].id, clickedBox.id);
            }
            // Always prevent context menu on right click for now
            e.preventDefault();
            return;
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
            // With ctrl, we don't want to drag, just select.
            // So we toggle selection and prevent drag by clearing mouseDownRef
            if (clickedBox) {
                toggleBoxSelection(clickedBox.id);
                mouseDownRef.current = null;
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
        hoveredDeleteButton,
        isPanning,
    };
}; 