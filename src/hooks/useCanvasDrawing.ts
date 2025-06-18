import { RefObject, useCallback, useEffect, useState } from 'react';
import { Box, GRID_CONSTANTS } from '../types';
import { BoxPreview } from './useInteraction';

interface GridConfig {
    columns: number;
    rows: number;
}

type Cursor = {
    boxId: string;
    index: number;
};

const FONT_SIZE = 16;
const FONT_FAMILY = '"Courier New", Courier, monospace';
const PADDING = 2;
const LINE_HEIGHT = GRID_CONSTANTS.gridSize;

// Helper function to break text into lines based on measured width
const breakTextIntoLines = (ctx: CanvasRenderingContext2D, text: string, boxWidthInPixels: number) => {
    const lines: string[] = [];
    if (!text) return lines;

    let currentLine = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const potentialLine = currentLine + char;
        if (ctx.measureText(potentialLine).width > boxWidthInPixels && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = char;
        } else {
            currentLine = potentialLine;
        }
    }
    lines.push(currentLine);
    return lines;
};

export const useCanvasDrawing = (
    canvasRef: RefObject<HTMLCanvasElement>, 
    boxes: Box[],
    selectedBoxId: string | null,
    newBoxPreview: BoxPreview | null,
    gridConfig: GridConfig,
    cursor: Cursor | null
) => {
    const [isCursorVisible, setIsCursorVisible] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => setIsCursorVisible(v => !v), 500);
        return () => clearInterval(interval);
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || gridConfig.columns === 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw grid
        ctx.strokeStyle = "#eee";
        ctx.lineWidth = 1;
        for (let i = 0; i <= gridConfig.columns; i++) {
            ctx.beginPath();
            ctx.moveTo(i * GRID_CONSTANTS.gridSize, 0);
            ctx.lineTo(i * GRID_CONSTANTS.gridSize, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= gridConfig.rows; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * GRID_CONSTANTS.gridSize);
            ctx.lineTo(canvas.width, i * GRID_CONSTANTS.gridSize);
            ctx.stroke();
        }
        
        const getCursorPixelPosition = (box: Box, charIndex: number) => {
            ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
            const textBeforeCursor = box.text.substring(0, charIndex);
            const boxWidthInPixels = box.width * GRID_CONSTANTS.gridSize - PADDING * 2;
            const lines = breakTextIntoLines(ctx, textBeforeCursor, boxWidthInPixels);
            
            const cursorLineIndex = lines.length > 0 ? lines.length - 1 : 0;
            const textOnCursorLine = lines[cursorLineIndex] || '';
            
            const pixelX = box.x * GRID_CONSTANTS.gridSize + PADDING + ctx.measureText(textOnCursorLine).width;
            const pixelY = box.y * GRID_CONSTANTS.gridSize + (cursorLineIndex * LINE_HEIGHT) + PADDING;
            return { pixelX, pixelY };
        };

        const renderTextInBox = (box: Box) => {
            ctx.fillStyle = '#333';
            ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
            ctx.textBaseline = 'top';
            
            const boxWidthInPixels = box.width * GRID_CONSTANTS.gridSize - PADDING * 2;
            const lines = breakTextIntoLines(ctx, box.text, boxWidthInPixels);

            lines.forEach((line, lineIndex) => {
                if ((lineIndex + 1) * LINE_HEIGHT > box.height * GRID_CONSTANTS.gridSize) return;
                const drawX = box.x * GRID_CONSTANTS.gridSize + PADDING;
                const drawY = box.y * GRID_CONSTANTS.gridSize + (lineIndex * LINE_HEIGHT) + PADDING;
                ctx.fillText(line, drawX, drawY);
            });
        };

        boxes.forEach(box => {
            ctx.fillStyle = "rgba(0, 100, 255, 0.1)";
            ctx.strokeStyle = "rgba(0, 100, 255, 0.5)";
            ctx.lineWidth = 1;
            
            const rectX = box.x * GRID_CONSTANTS.gridSize;
            const rectY = box.y * GRID_CONSTANTS.gridSize;
            const rectW = box.width * GRID_CONSTANTS.gridSize;
            const rectH = box.height * GRID_CONSTANTS.gridSize;

            ctx.fillRect(rectX, rectY, rectW, rectH);
            ctx.strokeRect(rectX, rectY, rectW, rectH);
            
            if (box.id === selectedBoxId) {
                ctx.strokeStyle = "rgba(0, 100, 255, 1)";
                ctx.lineWidth = 2;
                ctx.strokeRect(rectX - 1, rectY - 1, rectW + 2, rectH + 2);
            }

            renderTextInBox(box);
        });

        if (cursor && cursor.boxId === selectedBoxId && isCursorVisible) {
            const box = boxes.find(b => b.id === cursor.boxId);
            if (box) {
                const { pixelX, pixelY } = getCursorPixelPosition(box, cursor.index);
                ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
                ctx.fillRect(pixelX, pixelY - PADDING, 2, FONT_SIZE + PADDING * 2);
            }
        }

        if (newBoxPreview) {
            ctx.strokeStyle = "rgba(0, 100, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(
                newBoxPreview.x * GRID_CONSTANTS.gridSize,
                newBoxPreview.y * GRID_CONSTANTS.gridSize,
                newBoxPreview.width * GRID_CONSTANTS.gridSize,
                newBoxPreview.height * GRID_CONSTANTS.gridSize
            );
            ctx.setLineDash([]);
        }
    }, [boxes, canvasRef, selectedBoxId, newBoxPreview, gridConfig, cursor, isCursorVisible]);

    return { draw };
}; 