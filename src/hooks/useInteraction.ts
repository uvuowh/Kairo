import { useState, useRef } from 'react';
import { Box, MouseDownState, GRID_CONSTANTS } from '../types';
import { isPreviewCollidingWithAny, doBoxesIntersect } from '../utils/collision';

export interface BoxPreview {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const useInteraction = (
    boxes: Box[], 
    setBoxes: React.Dispatch<React.SetStateAction<Box[]>>, 
    findBoxAt: (gridX: number, gridY: number) => Box | undefined,
    addBox: (box: Omit<Box, 'id' | 'text'>) => void,
    onBoxClick: (box: Box) => void,
    onBoxDoubleClick: (box: Box, mouseX: number, mouseY: number) => void,
    onBoxDelete: (boxId: string) => void,
    onDoubleClickEmpty: (gridX: number, gridY: number) => void,
    pan: { x: number, y: number },
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>,
    zoom: number
) => {
    const mouseDownRef = useRef<MouseDownState | null>(null);
    const [draggingBox, setDraggingBox] = useState<{
        boxId: string;
        offsetX: number;
        offsetY: number;
    } | null>(null);
    const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
    const [newBoxPreview, setNewBoxPreview] = useState<BoxPreview | null>(null);
    const [hoveredDeleteButton, setHoveredDeleteButton] = useState<string | null>(null);
    const [isPanning, setIsPanning] = useState(false);

    const lastClickTime = useRef(0);
    
    const selectedBox = boxes.find(b => b.id === selectedBoxId);

    const screenToWorld = (screenX: number, screenY: number) => {
        const worldX = (screenX - pan.x) / zoom;
        const worldY = (screenY - pan.y) / zoom;
        return { worldX, worldY };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1 || e.button === 2) { // Middle or Right mouse button
            setIsPanning(true);
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

        const rect = e.currentTarget.getBoundingClientRect();
        const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        
        const gridX = Math.floor(worldX / GRID_CONSTANTS.gridSize);
        const gridY = Math.floor(worldY / GRID_CONSTANTS.gridSize);

        const now = Date.now();
        const DOUBLE_CLICK_THRESHOLD = 300; // in ms

        const clickedBox = findBoxAt(gridX, gridY);

        // Handle delete button click
        if (hoveredDeleteButton) {
            onBoxDelete(hoveredDeleteButton);
            setHoveredDeleteButton(null);
            mouseDownRef.current = null; // Prevent other actions
            return;
        }

        // Double click handling
        if (now - lastClickTime.current < DOUBLE_CLICK_THRESHOLD) {
            if (clickedBox) {
                onBoxDoubleClick(clickedBox, worldX, worldY);
            } else {
                onDoubleClickEmpty(gridX, gridY);
            }
            lastClickTime.current = 0; // Reset timer
            mouseDownRef.current = null; // Prevent drag
            return;
        }
        lastClickTime.current = now;

        // Store mouse down state
        mouseDownRef.current = {
            time: now,
            x: worldX,
            y: worldY,
            gridX,
            gridY,
            boxId: clickedBox?.id || null,
        };

        // If clicking on a different box, deselect the current one
        if (clickedBox && clickedBox.id !== selectedBoxId) {
            setSelectedBoxId(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isPanning && mouseDownRef.current) {
            const dx = e.clientX - mouseDownRef.current.x;
            const dy = e.clientY - mouseDownRef.current.y;
            setPan(prevPan => ({ x: prevPan.x + dx, y: prevPan.y + dy }));
            // Update mouseDownRef to current position for next delta calculation
            mouseDownRef.current.x = e.clientX;
            mouseDownRef.current.y = e.clientY;
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        // If not dragging, check for hover states (e.g., delete button)
        if (!mouseDownRef.current) {
            let isHoveringOnDeleteButton = false;
            const handleHitRadius = 8; 

            if (selectedBox) {
                 const box = selectedBox;
                const rectX = box.x * GRID_CONSTANTS.gridSize;
                const rectY = box.y * GRID_CONSTANTS.gridSize;
                const rectW = box.width * GRID_CONSTANTS.gridSize;

                const deleteHandleCenterX = rectX + rectW;
                const deleteHandleCenterY = rectY;
                const deleteDistance = Math.sqrt(Math.pow(worldX - deleteHandleCenterX, 2) + Math.pow(worldY - deleteHandleCenterY, 2));

                if (deleteDistance < handleHitRadius) {
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

        // If drag threshold is not met, do nothing
        if (distance < DRAG_THRESHOLD) {
            return;
        }

        // Start dragging
        // Dragging an existing box
        if (mouseDownRef.current.boxId && !draggingBox) {
            const box = boxes.find(b => b.id === mouseDownRef.current!.boxId)!;
            setDraggingBox({
                boxId: mouseDownRef.current.boxId,
                offsetX: mouseDownRef.current.gridX - box.x,
                offsetY: mouseDownRef.current.gridY - box.y,
            });
            // Deselect box when dragging starts
            setSelectedBoxId(null);
        }

        if (draggingBox) {
            const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            const newGridX = Math.round((worldX / GRID_CONSTANTS.gridSize) - draggingBox.offsetX);
            const newGridY = Math.round((worldY / GRID_CONSTANTS.gridSize) - draggingBox.offsetY);

            setBoxes(prevBoxes => {
                const currentBox = prevBoxes.find(b => b.id === draggingBox.boxId);
                if (!currentBox) return prevBoxes;

                const proposedX = Math.max(0, newGridX);
                const proposedY = Math.max(0, newGridY);

                const deltaX = proposedX - currentBox.x;
                const deltaY = proposedY - currentBox.y;

                if (deltaX === 0 && deltaY === 0) return prevBoxes;

                const toUpdate = new Map<string, Box>();
                const queue: string[] = [draggingBox.boxId];
                toUpdate.set(draggingBox.boxId, { ...currentBox, x: proposedX, y: proposedY });

                let head = 0;
                while(head < queue.length) {
                    const currentId = queue[head++];
                    const movingBox = toUpdate.get(currentId)!;
                    
                    for (const other of prevBoxes) {
                        if (toUpdate.has(other.id)) continue;

                        if (doBoxesIntersect(movingBox, other)) {
                            const newOtherX = other.x + deltaX;
                            const newOtherY = other.y + deltaY;

                            if ( newOtherX < 0 || newOtherY < 0 ) {
                                return prevBoxes; 
                            }
                            
                            toUpdate.set(other.id, { ...other, x: newOtherX, y: newOtherY });
                            queue.push(other.id);
                        }
                    }
                }

                const finalBoxes = prevBoxes.map(b => toUpdate.get(b.id) || b);
                
                for (const updated of toUpdate.values()) {
                    const hasCollision = finalBoxes.some(other => {
                        if (updated.id === other.id || toUpdate.has(other.id)) return false;
                        return doBoxesIntersect(updated, other);
                    });
                    if (hasCollision) return prevBoxes;
                }

                return finalBoxes;
            });
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isPanning) {
            setIsPanning(false);
            mouseDownRef.current = null;
            return;
        }

        const DRAG_THRESHOLD = 5;
        const now = Date.now();

        if (mouseDownRef.current) {
            const rect = e.currentTarget.getBoundingClientRect();
            const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            const distance = Math.sqrt(
                Math.pow(worldX - mouseDownRef.current.x, 2) +
                Math.pow(worldY - mouseDownRef.current.y, 2)
            );
            const timeElapsed = now - mouseDownRef.current.time;

            const isClick = distance < DRAG_THRESHOLD && timeElapsed < 200;

            if (isClick) {
                if (mouseDownRef.current.boxId) {
                    const clickedBox = boxes.find(b => b.id === mouseDownRef.current!.boxId)!;
                    onBoxClick(clickedBox);
                    setSelectedBoxId(clickedBox.id);
                } else {
                    // Click on canvas
                    setSelectedBoxId(null);
                }
            }
        }
        
        // Reset states
        setDraggingBox(null);
        setNewBoxPreview(null);
        mouseDownRef.current = null;
    };
    
    return {
        selectedBoxId,
        selectedBox,
        newBoxPreview,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        hoveredDeleteButton,
    };
}; 