import { useState, useRef, useCallback } from 'react';
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
    moveBoxes: (id: string, newX: number, newY: number) => Promise<void>
) => {
    const mouseDownRef = useRef<MouseDownState | null>(null);
    const initialPanRef = useRef({ x: 0, y: 0 });
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

    const screenToWorld = useCallback((screenX: number, screenY: number) => {
        const worldX = (screenX - pan.x) / zoom;
        const worldY = (screenY - pan.y) / zoom;
        return { worldX, worldY };
    }, [pan, zoom]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1 || e.button === 2) { // Middle or Right mouse button
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

        const rect = e.currentTarget.getBoundingClientRect();
        const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        
        const gridX = Math.floor(worldX / GRID_CONSTANTS.gridSize);
        const gridY = Math.floor(worldY / GRID_CONSTANTS.gridSize);

        const now = Date.now();
        const DOUBLE_CLICK_THRESHOLD = 300; 

        const clickedBox = findBoxAt(gridX, gridY);

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

        mouseDownRef.current = {
            time: now,
            x: worldX,
            y: worldY,
            gridX,
            gridY,
            boxId: clickedBox?.id || null,
        };

        if (clickedBox && clickedBox.id !== selectedBoxId) {
            setSelectedBoxId(null);
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

        if (distance < DRAG_THRESHOLD) {
            return;
        }

        if (mouseDownRef.current.boxId && !draggingBox) {
            const box = boxes.find(b => b.id === mouseDownRef.current!.boxId)!;
            setDraggingBox({
                boxId: mouseDownRef.current.boxId,
                offsetX: mouseDownRef.current.gridX - box.x,
                offsetY: mouseDownRef.current.gridY - box.y,
            });
            setSelectedBoxId(null);
        }

        if (draggingBox) {
            const { worldX, worldY } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            
            const newGridX = Math.round((worldX / GRID_CONSTANTS.gridSize) - draggingBox.offsetX);
            const newGridY = Math.round((worldY / GRID_CONSTANTS.gridSize) - draggingBox.offsetY);

            // Debounce or throttle this call if it's too frequent
            moveBoxes(draggingBox.boxId, newGridX, newGridY);
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

            if (distance < DRAG_THRESHOLD) {
                const clickedBox = findBoxAt(mouseDownRef.current.gridX, mouseDownRef.current.gridY);
                if (clickedBox) {
                    setSelectedBoxId(clickedBox.id);
                    onBoxClick(clickedBox, worldX, worldY);
                } else {
                    setSelectedBoxId(null);
                }
            }
        }

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
        isPanning
    };
}; 