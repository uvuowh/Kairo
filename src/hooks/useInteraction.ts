import { useState, useRef } from 'react';
import { Box, MouseDownState, GRID_CONSTANTS } from '../types';
import { isBoxCollidingWithAny, isPreviewCollidingWithAny, doBoxesIntersect } from '../utils/collision';

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
    onSelectBox: (box: Box) => void
) => {
    const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
    const [draggingBox, setDraggingBox] = useState<{
        boxId: string;
        offsetX: number;
        offsetY: number;
    } | null>(null);
    const [resizingBox, setResizingBox] = useState<string | null>(null);
    const [hoveredResizeHandle, setHoveredResizeHandle] = useState<string | null>(null);
    const [newBoxPreview, setNewBoxPreview] = useState<BoxPreview | null>(null);

    const mouseDownRef = useRef<MouseDownState | null>(null);
    
    const selectedBox = boxes.find(b => b.id === selectedBoxId);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const gridX = Math.floor(mouseX / GRID_CONSTANTS.gridSize);
        const gridY = Math.floor(mouseY / GRID_CONSTANTS.gridSize);

        const clickedBox = findBoxAt(gridX, gridY);

        if (hoveredResizeHandle && clickedBox?.id === hoveredResizeHandle) {
            setResizingBox(clickedBox.id);
            mouseDownRef.current = { time: Date.now(), x: mouseX, y: mouseY, gridX, gridY, boxId: clickedBox.id };
            return;
        }
        
        mouseDownRef.current = {
            time: Date.now(),
            x: mouseX,
            y: mouseY,
            gridX,
            gridY,
            boxId: clickedBox?.id || null,
        };
        
        if (selectedBoxId && clickedBox?.id !== selectedBoxId) {
            setSelectedBoxId(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const currentMouseX = e.clientX - rect.left;
        const currentMouseY = e.clientY - rect.top;

        if (resizingBox) {
            const currentGridX = Math.floor(currentMouseX / GRID_CONSTANTS.gridSize);
            const currentGridY = Math.floor(currentMouseY / GRID_CONSTANTS.gridSize);
            setBoxes(prevBoxes => {
                const box = prevBoxes.find(b => b.id === resizingBox);
                if (!box) return prevBoxes;

                const newWidth = Math.max(2, currentGridX - box.x + 1);
                const newHeight = Math.max(2, currentGridY - box.y + 1);
                
                const updatedBox = { ...box, width: newWidth, height: newHeight };

                const hasCollision = prevBoxes.some(other => 
                    other.id !== resizingBox && doBoxesIntersect(updatedBox, other)
                );

                if (hasCollision) {
                    return prevBoxes;
                }

                return prevBoxes.map(b => b.id === resizingBox ? updatedBox : b);
            });
            return;
        }
        
        if (!mouseDownRef.current) {
            let isHoveringOnResizeHandle = false;
            const handleHitRadius = 10; 
            for (const box of boxes) {
                const rectX = box.x * GRID_CONSTANTS.gridSize;
                const rectY = box.y * GRID_CONSTANTS.gridSize;
                const rectW = box.width * GRID_CONSTANTS.gridSize;
                const rectH = box.height * GRID_CONSTANTS.gridSize;
                const handleCenterX = rectX + rectW - 8;
                const handleCenterY = rectY + rectH - 8;

                const distance = Math.sqrt(
                    Math.pow(currentMouseX - handleCenterX, 2) +
                    Math.pow(currentMouseY - handleCenterY, 2)
                );

                if (distance < handleHitRadius) {
                    isHoveringOnResizeHandle = true;
                    setHoveredResizeHandle(box.id);
                    e.currentTarget.style.cursor = 'nwse-resize';
                    break;
                }
            }

            if (!isHoveringOnResizeHandle) {
                setHoveredResizeHandle(null);
                e.currentTarget.style.cursor = 'default';
            }
            return;
        }

        // Handle creating a new box
        if (!mouseDownRef.current.boxId && mouseDownRef.current) {
            const startGridX = mouseDownRef.current.gridX;
            const startGridY = mouseDownRef.current.gridY;
            const currentGridX = Math.floor(currentMouseX / GRID_CONSTANTS.gridSize);
            const currentGridY = Math.floor(currentMouseY / GRID_CONSTANTS.gridSize);

            const x = Math.min(startGridX, currentGridX);
            const y = Math.min(startGridY, currentGridY);
            const width = Math.abs(startGridX - currentGridX) + 1;
            const height = Math.abs(startGridY - currentGridY) + 1;
            
            setNewBoxPreview({ x, y, width, height });
            return;
        }

        // Handle moving an existing box
        if (draggingBox) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const newGridX = Math.round((mouseX / GRID_CONSTANTS.gridSize) - draggingBox.offsetX);
            const newGridY = Math.round((mouseY / GRID_CONSTANTS.gridSize) - draggingBox.offsetY);

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
            return;
        }

        // Check if starting a drag on an existing box
        const DRAG_THRESHOLD = 5;
        const distance = Math.sqrt(
            Math.pow(currentMouseX - mouseDownRef.current.x, 2) +
            Math.pow(currentMouseY - mouseDownRef.current.y, 2)
        );

        if (distance > DRAG_THRESHOLD && mouseDownRef.current.boxId) {
            const box = boxes.find(b => b.id === mouseDownRef.current!.boxId)!;
            setDraggingBox({
                boxId: mouseDownRef.current.boxId,
                offsetX: mouseDownRef.current.gridX - box.x,
                offsetY: mouseDownRef.current.gridY - box.y,
            });
            if(selectedBoxId) setSelectedBoxId(null);
        }
    };

    const handleMouseUp = () => {
        // Finalize new box creation
        if (newBoxPreview) {
            // Ensure the box has a minimum size and doesn't collide
            if ((newBoxPreview.width > 1 || newBoxPreview.height > 1) && !isPreviewCollidingWithAny(newBoxPreview, boxes)) {
                addBox(newBoxPreview);
            }
            setNewBoxPreview(null);
            mouseDownRef.current = null;
            return;
        }

        if (draggingBox) {
            setDraggingBox(null);
            mouseDownRef.current = null;
        }
        
        if (resizingBox) {
            setResizingBox(null);
            mouseDownRef.current = null;
        }

        if (mouseDownRef.current) {
            const CLICK_TIME_THRESHOLD = 200;
            const timeElapsed = Date.now() - mouseDownRef.current.time;

            if (timeElapsed < CLICK_TIME_THRESHOLD) {
                const { boxId } = mouseDownRef.current;
                if (boxId) {
                    if(selectedBoxId !== boxId) {
                        setSelectedBoxId(boxId);
                        const box = boxes.find(b => b.id === boxId);
                        if (box) onSelectBox(box);
                    }
                } else {
                    setSelectedBoxId(null);
                }
            }
            mouseDownRef.current = null;
        }
    };

    return {
        selectedBoxId,
        selectedBox,
        newBoxPreview,
        hoveredResizeHandle,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
    };
}; 