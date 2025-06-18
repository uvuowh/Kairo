import { RefObject, useCallback, useEffect, useState } from 'react';
import { Box, GRID_CONSTANTS } from '../types';
import { BoxPreview } from './useInteraction';

type Cursor = {
    boxId: string;
    index: number;
};

const FONT_SIZE = 16;
const FONT_FAMILY = '"Courier New", Courier, monospace';
const PADDING = 2;
const LINE_HEIGHT = GRID_CONSTANTS.gridSize;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

// Helper function to break text into lines based on measured width
const breakTextIntoLines = (ctx: CanvasRenderingContext2D, text: string, boxWidthInPixels: number) => {
    const allLines: string[] = [];
    if (!text && text !== '') return allLines;

    const hardLines = text.split('\n');

    for (const hardLine of hardLines) {
        // Apply the word-wrapping logic to each hardLine
        const wordsAndSymbols = hardLine.split(/(\s+|[.,!?;:()\[\]{}'"])/).filter(token => token);
        
        if (wordsAndSymbols.length === 0) {
            // This handles empty lines (e.g., from double Enter)
            allLines.push('');
            continue;
        }

        let currentLine = '';
        for (const token of wordsAndSymbols) {
            // This part for extremely long tokens needs to be preserved
            if (ctx.measureText(token).width > boxWidthInPixels) {
                for (const char of token) {
                    const potentialLineWithChar = currentLine + char;
                    if (ctx.measureText(potentialLineWithChar).width > boxWidthInPixels && currentLine) {
                        allLines.push(currentLine);
                        currentLine = char;
                    } else {
                        currentLine = potentialLineWithChar;
                    }
                }
                continue;
            }

            const potentialLine = currentLine + token;
            if (ctx.measureText(potentialLine).width > boxWidthInPixels && currentLine) {
                allLines.push(currentLine);
                // Start the new line, but trim leading space if the token is a space.
                currentLine = token.trimStart();
            } else {
                currentLine = potentialLine;
            }
        }

        if (currentLine) {
            allLines.push(currentLine);
        }
    }

    return allLines;
};

export const useCanvasDrawing = (
    canvasRef: RefObject<HTMLCanvasElement>, 
    boxes: Box[],
    selectedBoxId: string | null,
    newBoxPreview: BoxPreview | null,
    cursor: Cursor | null,
    hoveredResizeHandle: string | null
) => {
    const [isCursorVisible, setIsCursorVisible] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => setIsCursorVisible(v => !v), 500);
        return () => clearInterval(interval);
    }, []);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Draw grid
        ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
        ctx.lineWidth = 0.5;
        const columns = Math.floor(canvas.width / GRID_CONSTANTS.gridSize);
        const rows = Math.floor(canvas.height / GRID_CONSTANTS.gridSize);

        for (let i = 0; i <= columns; i++) {
            ctx.beginPath();
            ctx.moveTo(i * GRID_CONSTANTS.gridSize, 0);
            ctx.lineTo(i * GRID_CONSTANTS.gridSize, canvas.height);
            ctx.stroke();
        }
        for (let i = 0; i <= rows; i++) {
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
            return { pixelX, pixelY, cursorLineIndex };
        };

        const renderTextInBox = (box: Box) => {
            ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';
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
            const rectX = box.x * GRID_CONSTANTS.gridSize;
            const rectY = box.y * GRID_CONSTANTS.gridSize;
            const rectW = box.width * GRID_CONSTANTS.gridSize;
            const rectH = box.height * GRID_CONSTANTS.gridSize;
            const borderRadius = 8;

            ctx.shadowColor = isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
            
            ctx.fillStyle = isDarkMode ? "rgba(45, 45, 45, 0.75)" : "rgba(255, 255, 255, 0.75)";
            ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)";
            ctx.lineWidth = 1;
            
            roundRect(ctx, rectX, rectY, rectW, rectH, borderRadius);
            ctx.fill();
            
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            roundRect(ctx, rectX, rectY, rectW, rectH, borderRadius);
            ctx.stroke();
            
            if (box.id === selectedBoxId || box.id === hoveredResizeHandle) {
                const handleX = rectX + rectW;
                const handleY = rectY + rectH;
                const handleRadius = 5;
                const isHovered = box.id === hoveredResizeHandle;

                ctx.beginPath();
                ctx.arc(handleX, handleY, handleRadius, 0, 2 * Math.PI);
                
                // Fill with background color to hide the box corner underneath
                ctx.fillStyle = isDarkMode ? '#2d2d2d' : '#ffffff'; 
                ctx.fill();

                ctx.beginPath();
                ctx.arc(handleX, handleY, handleRadius, 0, 2 * Math.PI);
                
                if (isHovered) {
                    ctx.fillStyle = isDarkMode ? "rgba(130, 200, 255, 1)" : "rgba(0, 120, 255, 1)";
                    ctx.fill();
                } else {
                    ctx.strokeStyle = isDarkMode ? "rgba(130, 200, 255, 0.8)" : "rgba(0, 120, 255, 0.8)";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
            
            if (box.id === selectedBoxId) {
                ctx.strokeStyle = isDarkMode ? "rgba(100, 180, 255, 1)" : "rgba(0, 100, 255, 1)";
                ctx.lineWidth = 2;
                roundRect(ctx, rectX - 1, rectY - 1, rectW + 2, rectH + 2, borderRadius + 1);
                ctx.stroke();
            }

            renderTextInBox(box);
        });

        if (cursor && cursor.boxId === selectedBoxId && isCursorVisible) {
            const box = boxes.find(b => b.id === cursor.boxId);
            if (box) {
                const { pixelX, pixelY, cursorLineIndex } = getCursorPixelPosition(box, cursor.index);
                
                // Only draw cursor if it's within the visible height of the box
                if ((cursorLineIndex + 1) * LINE_HEIGHT <= box.height * GRID_CONSTANTS.gridSize) {
                    ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';
                    ctx.fillRect(pixelX, pixelY - PADDING, 2, FONT_SIZE + PADDING * 2);
                }
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
    }, [boxes, canvasRef, selectedBoxId, newBoxPreview, cursor, isCursorVisible, hoveredResizeHandle]);

    return { draw };
}; 