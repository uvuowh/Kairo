import { useRef, useCallback, useEffect } from "react";
import { Box, GRID_CONSTANTS } from "../types";
import { OptimisticDragPosition } from "./useInteraction";

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, panX: number, panY: number) {
    ctx.beginPath();
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";
    ctx.lineWidth = 1;

    const gridSize = GRID_CONSTANTS.gridSize;
    const startX = Math.floor(panX / gridSize) * gridSize;
    const startY = Math.floor(panY / gridSize) * gridSize;

    for (let x = startX; x < panX + width; x += gridSize) {
        ctx.moveTo(x, panY);
        ctx.lineTo(x, panY + height);
    }
    for (let y = startY; y < panY + height; y += gridSize) {
        ctx.moveTo(panX, y);
        ctx.lineTo(panX + width, y);
    }
    ctx.stroke();
}

export function calculateSizeForText(ctx: CanvasRenderingContext2D, text: string) {
    const lines = text.split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
        const width = ctx.measureText(line).width;
        if (width > maxWidth) {
            maxWidth = width;
        }
    });

    const padding = 10;
    const widthInGrids = Math.max(2, Math.ceil((maxWidth + 2 * padding) / GRID_CONSTANTS.gridSize));
    const heightInGrids = Math.max(1, Math.ceil((lines.length * GRID_CONSTANTS.fontSize + 2 * padding) / GRID_CONSTANTS.gridSize));

    return { width: widthInGrids, height: heightInGrids };
}


export const useCanvasDrawing = (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    boxes: Box[],
    selectedBoxId: string | null,
    newBoxPreview: { x: number; y: number; width: number; height: number; } | null,
    cursor: { boxId: string; index: number; } | null,
    hoveredDeleteButton: string | null,
    pan: { x: number; y: number; },
    zoom: number,
    optimisticDragPosition: OptimisticDragPosition | null
) => {
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        if (canvasRef.current) {
            ctxRef.current = canvasRef.current.getContext("2d");
        }
    }, [canvasRef]);

    const draw = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== canvas.clientWidth * dpr || canvas.height !== canvas.clientHeight * dpr) {
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.scale(dpr, dpr);
        }
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        ctx.fillStyle = isDarkMode ? '#1a1a1a' : '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        drawGrid(ctx, canvas.width / zoom, canvas.height / zoom, -pan.x / zoom, -pan.y / zoom);

        boxes.forEach(box => {
            let drawX = box.x;
            let drawY = box.y;

            if (optimisticDragPosition && optimisticDragPosition.boxId === box.id) {
                drawX = optimisticDragPosition.x;
                drawY = optimisticDragPosition.y;
            }

            if (box.id === selectedBoxId) {
                ctx.shadowColor = 'rgba(118, 118, 255, 0.9)';
                ctx.shadowBlur = 10;
            } else {
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetY = 2;
            }

            ctx.fillStyle = "#333";
            ctx.strokeStyle = box.id === selectedBoxId ? 'rgba(118, 118, 255, 0.9)' : "#555";
            ctx.lineWidth = 1;
            
            const rectX = drawX * GRID_CONSTANTS.gridSize;
            const rectY = drawY * GRID_CONSTANTS.gridSize;
            const rectW = box.width * GRID_CONSTANTS.gridSize;
            const rectH = box.height * GRID_CONSTANTS.gridSize;
            
            ctx.fillRect(rectX, rectY, rectW, rectH);
            ctx.strokeRect(rectX, rectY, rectW, rectH);
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            ctx.fillStyle = "#FFF";
            ctx.font = `${GRID_CONSTANTS.fontSize}px sans-serif`;
            ctx.textBaseline = "top";
            
            const padding = 10;
            
            ctx.fillText(box.text, rectX + padding, rectY + padding, rectW - 2 * padding);
            
            if (cursor && cursor.boxId === box.id && selectedBoxId === box.id) {
                const textBeforeCursor = box.text.substring(0, cursor.index);
                const cursorX = ctx.measureText(textBeforeCursor).width;
                
                ctx.fillStyle = "#FFF";
                ctx.fillRect(
                    rectX + padding + cursorX,
                    rectY + padding,
                    2,
                    GRID_CONSTANTS.fontSize
                );
            }

            if (box.id === selectedBoxId) {
                const handleSize = 8;
                const deleteHandleCenterX = rectX + rectW;
                const deleteHandleCenterY = rectY;

                ctx.beginPath();
                ctx.arc(deleteHandleCenterX, deleteHandleCenterY, handleSize, 0, 2 * Math.PI);
                ctx.fillStyle = hoveredDeleteButton === box.id ? 'red' : 'darkred';
                ctx.fill();

                ctx.strokeStyle = "white";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(deleteHandleCenterX - 3, deleteHandleCenterY - 3);
                ctx.lineTo(deleteHandleCenterX + 3, deleteHandleCenterY + 3);
                ctx.moveTo(deleteHandleCenterX + 3, deleteHandleCenterY - 3);
                ctx.lineTo(deleteHandleCenterX - 3, deleteHandleCenterY + 3);
                ctx.stroke();
            }
        });

        if (newBoxPreview) {
            ctx.fillStyle = "rgba(118, 118, 255, 0.3)";
            ctx.fillRect(
                newBoxPreview.x * GRID_CONSTANTS.gridSize,
                newBoxPreview.y * GRID_CONSTANTS.gridSize,
                newBoxPreview.width * GRID_CONSTANTS.gridSize,
                newBoxPreview.height * GRID_CONSTANTS.gridSize
            );
        }

        ctx.restore();

    }, [boxes, selectedBoxId, newBoxPreview, cursor, pan, zoom, hoveredDeleteButton, optimisticDragPosition, canvasRef]);
    
    const getCursorIndexFromClick = useCallback((box: Box, worldX: number, worldY: number) => {
        if (!ctxRef.current) return 0;
        const ctx = ctxRef.current;
        ctx.font = `${GRID_CONSTANTS.fontSize}px sans-serif`;
        
        let text = box.text;
        
        const rectX = box.x * GRID_CONSTANTS.gridSize;
        const padding = 10;
        const relativeX = worldX - (rectX + padding);

        if (relativeX < 0) return 0;

        for (let i = 1; i <= text.length; i++) {
            let subtext = text.substring(0, i);
            let subwidth = ctx.measureText(subtext).width;
            if (relativeX < subwidth) {
                let prevSubwidth = ctx.measureText(text.substring(0,i-1)).width;
                if (relativeX - prevSubwidth < subwidth - relativeX) {
                    return i-1;
                }
                return i;
            }
        }
        return text.length;
    }, []);


    return { draw, calculateSizeForText, getCursorIndexFromClick };
}; 