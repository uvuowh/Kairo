import { RefObject, useCallback, useEffect, useState } from 'react';
import { Box, Connection, GRID_CONSTANTS } from '../types';
import { BoxPreview } from './useInteraction';

type Cursor = {
    boxId: string;
    index: number;
};

const FONT_SIZE = 16;
const FONT_FAMILY = '"Courier New", Courier, monospace';
const PADDING = 2;
const LINE_HEIGHT = GRID_CONSTANTS.gridSize;
export const DELETE_HANDLE_RADIUS = 4;

const getCharWidth = (char: string): number => {
    // Half-width for ASCII letters, numbers, and common punctuation
    if (/[a-zA-Z0-9]/.test(char) || /[\s.,!?;:'"(){}[\]<>\-_+=@#$%^&*|\\/]/.test(char)) {
        return GRID_CONSTANTS.gridSize / 2;
    }
    // Full-width for CJK characters and full-width symbols
    else if (/[\u4e00-\u9fa5\uff00-\uffef\u3000-\u303f]/.test(char)) {
        return GRID_CONSTANTS.gridSize;
    }
    // Default other symbols to full-width
    else {
        return GRID_CONSTANTS.gridSize;
    }
};

const calculateCustomTextWidth = (text: string): number => {
    let width = 0;
    for (const char of text) {
        width += getCharWidth(char);
    }
    return width;
};

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

const getCursorPixelPosition = (
    ctx: CanvasRenderingContext2D,
    box: Box,
    charIndex: number
) => {
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    const textBeforeCursor = box.text.substring(0, charIndex);
    const boxWidthInPixels = box.width * GRID_CONSTANTS.gridSize;
    const lines = breakTextIntoLines(ctx, textBeforeCursor, boxWidthInPixels);
    
    const cursorLineIndex = lines.length > 0 ? lines.length - 1 : 0;
    const textOnCursorLine = lines[cursorLineIndex] || '';
    
    const pixelX = box.x * GRID_CONSTANTS.gridSize + calculateCustomTextWidth(textOnCursorLine);
    const pixelY = box.y * GRID_CONSTANTS.gridSize + (cursorLineIndex * LINE_HEIGHT) + PADDING;
    return { pixelX, pixelY, cursorLineIndex };
};

const renderTextInBox = (
    ctx: CanvasRenderingContext2D,
    box: Box,
    isDarkMode: boolean
) => {
    ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    
    const boxWidthInPixels = box.width * GRID_CONSTANTS.gridSize;
    const lines = breakTextIntoLines(ctx, box.text, boxWidthInPixels);

    lines.forEach((line, lineIndex) => {
        if ((lineIndex + 1) * LINE_HEIGHT > box.height * GRID_CONSTANTS.gridSize) return;
        let drawX = box.x * GRID_CONSTANTS.gridSize;
        const drawY = box.y * GRID_CONSTANTS.gridSize + (lineIndex * LINE_HEIGHT) + PADDING;
        
        for (const char of line) {
            ctx.fillText(char, drawX, drawY);
            drawX += getCharWidth(char);
        }
    });
};

// Re-introducing a simplified and correct version of this helper.
const breakTextIntoLines = (ctx: CanvasRenderingContext2D, text: string, boxWidthInPixels: number): string[] => {
    const allLines: string[] = [];
    if (!text && text !== '') return allLines;

    const hardLines = text.split('\n');

    for (const hardLine of hardLines) {
        if (!hardLine) {
            allLines.push('');
            continue;
        }
        
        let currentLine = '';
        const words = hardLine.split(' ');
        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            // First, check if the word itself is wider than the box.
            if (calculateCustomTextWidth(word) > boxWidthInPixels) {
                // If so, it needs to be broken up character by character.
                // But first, push whatever was on the current line.
                if (currentLine) {
                    allLines.push(currentLine);
                }
                currentLine = ''; // Start fresh for the broken word.

                let tempLine = '';
                for (const char of word) {
                    const lineWithChar = tempLine + char;
                    if (calculateCustomTextWidth(lineWithChar) > boxWidthInPixels) {
                        allLines.push(tempLine);
                        tempLine = char;
                    } else {
                        tempLine = lineWithChar;
                    }
                }
                currentLine = tempLine; // The remainder of the broken word.
            } else {
                // If the word fits on a line by itself, see if it fits on the current one.
                const lineWithWord = currentLine ? `${currentLine} ${word}` : word;
                if (calculateCustomTextWidth(lineWithWord) > boxWidthInPixels) {
                    // Doesn't fit, so push the old line and start a new one.
                    allLines.push(currentLine);
                    currentLine = word;
                } else {
                    // Fits, so add it to the current line.
                    currentLine = lineWithWord;
                }
            }
        }
        allLines.push(currentLine);
    }

    return allLines;
};

export const calculateSizeForText = (ctx: CanvasRenderingContext2D, text: string): { width: number, height: number } => {
    if (!text) {
        return { width: 2, height: 1 }; // Default size for empty box
    }

    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    const lines = text.split('\n');
    let maxLineWidth = 0;
    
    for (const line of lines) {
        const lineWidth = calculateCustomTextWidth(line);
        if (lineWidth > maxLineWidth) {
            maxLineWidth = lineWidth;
        }
    }
    
    const widthInGrids = Math.max(2, Math.ceil(maxLineWidth / GRID_CONSTANTS.gridSize));
    
    // Now, calculate height based on wrapping with the calculated width
    const boxWidthInPixels = widthInGrids * GRID_CONSTANTS.gridSize;
    const wrappedLines = breakTextIntoLines(ctx, text, boxWidthInPixels);
    const heightInGrids = Math.max(1, wrappedLines.length);

    return { width: widthInGrids, height: heightInGrids };
};

export const useCanvasDrawing = (
    canvasRef: RefObject<HTMLCanvasElement>, 
    boxes: Box[],
    connections: Connection[],
    selectedBoxId: string | null,
    newBoxPreview: BoxPreview | null,
    cursor: Cursor | null,
    hoveredDeleteButton: string | null,
    pan: { x: number, y: number },
    zoom: number
) => {
    const [isCursorVisible, setIsCursorVisible] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => setIsCursorVisible(v => !v), 500);
        return () => clearInterval(interval);
    }, []);

    const getCursorIndexFromClick = useCallback((box: Box, clickPixelX: number, clickPixelY: number): number => {
        const canvas = canvasRef.current;
        if (!canvas) return 0;
        const ctx = canvas.getContext("2d");
        if (!ctx) return 0;

        let closestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i <= box.text.length; i++) {
            const { pixelX, pixelY } = getCursorPixelPosition(ctx, box, i);
            // Compare distance to the center of the character's clickable area
            const dist = Math.pow(clickPixelX - pixelX, 2) + Math.pow(clickPixelY - (pixelY + (FONT_SIZE / 2)), 2);
            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = i;
            }
        }
        return closestIndex;
    }, [canvasRef]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Handle High DPI displays
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== canvas.clientWidth * dpr || canvas.height !== canvas.clientHeight * dpr) {
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
        }
        
        ctx.save();
        ctx.scale(dpr * zoom, dpr * zoom);
        ctx.translate(pan.x / zoom, pan.y / zoom);

        const viewLeft = -pan.x / zoom;
        const viewTop = -pan.y / zoom;
        const viewWidth = canvas.clientWidth / zoom;
        const viewHeight = canvas.clientHeight / zoom;
        
        ctx.clearRect(viewLeft, viewTop, viewWidth, viewHeight);

        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Draw grid
        ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
        ctx.lineWidth = 1 / zoom;

        const gridStartX = Math.floor(viewLeft / GRID_CONSTANTS.gridSize) * GRID_CONSTANTS.gridSize;
        const gridEndX = Math.ceil((viewLeft + viewWidth) / GRID_CONSTANTS.gridSize) * GRID_CONSTANTS.gridSize;
        const gridStartY = Math.floor(viewTop / GRID_CONSTANTS.gridSize) * GRID_CONSTANTS.gridSize;
        const gridEndY = Math.ceil((viewTop + viewHeight) / GRID_CONSTANTS.gridSize) * GRID_CONSTANTS.gridSize;

        for (let x = gridStartX; x < gridEndX; x += GRID_CONSTANTS.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, viewTop);
            ctx.lineTo(x, viewTop + viewHeight);
            ctx.stroke();
        }
        for (let y = gridStartY; y < gridEndY; y += GRID_CONSTANTS.gridSize) {
            ctx.beginPath();
            ctx.moveTo(viewLeft, y);
            ctx.lineTo(viewLeft + viewWidth, y);
            ctx.stroke();
        }
        
        // Draw connections underneath boxes
        ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 2 / zoom;
        connections.forEach(conn => {
            const fromBox = boxes.find(b => b.id === conn.from);
            const toBox = boxes.find(b => b.id === conn.to);

            if (fromBox && toBox) {
                const fromX = (fromBox.x + fromBox.width / 2) * GRID_CONSTANTS.gridSize;
                const fromY = (fromBox.y + fromBox.height / 2) * GRID_CONSTANTS.gridSize;
                const toX = (toBox.x + toBox.width / 2) * GRID_CONSTANTS.gridSize;
                const toY = (toBox.y + toBox.height / 2) * GRID_CONSTANTS.gridSize;
                
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();
            }
        });

        // Draw all boxes
        boxes.forEach(box => {
            const rectX = box.x * GRID_CONSTANTS.gridSize;
            const rectY = box.y * GRID_CONSTANTS.gridSize;
            const rectW = box.width * GRID_CONSTANTS.gridSize;
            const rectH = box.height * GRID_CONSTANTS.gridSize;
            const borderRadius = 4;

            // Simple culling
            if (rectX + rectW < viewLeft || rectX > viewLeft + viewWidth || rectY + rectH < viewTop || rectY > viewTop + viewHeight) {
                // Box is outside the viewport
            } else {
                ctx.fillStyle = isDarkMode ? "rgba(40, 40, 40, 0.8)" : "rgba(255, 255, 255, 0.8)";
                ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
                ctx.lineWidth = 1;

                roundRect(ctx, rectX, rectY, rectW, rectH, borderRadius);
                ctx.fill();
                ctx.stroke();

                // Draw grid inside the box
                ctx.save();
                ctx.clip(); // Clip to the rounded rect path defined above

                ctx.strokeStyle = isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";
                ctx.lineWidth = 1 / zoom;

                // Vertical lines
                for (let i = 1; i < box.width; i++) {
                    const x = rectX + i * GRID_CONSTANTS.gridSize;
                    ctx.beginPath();
                    ctx.moveTo(x, rectY);
                    ctx.lineTo(x, rectY + rectH);
                    ctx.stroke();
                }
                // Horizontal lines
                for (let i = 1; i < box.height; i++) {
                    const y = rectY + i * GRID_CONSTANTS.gridSize;
                    ctx.beginPath();
                    ctx.moveTo(rectX, y);
                    ctx.lineTo(rectX + rectW, y);
                    ctx.stroke();
                }
                ctx.restore();

                renderTextInBox(ctx, box, isDarkMode);

                if (selectedBoxId === box.id) {
                    ctx.strokeStyle = '#007AFF'; // A nice blue for selection
                    ctx.lineWidth = 2 / zoom;
                    roundRect(ctx, rectX - 1, rectY - 1, rectW + 2, rectH + 2, borderRadius + 1);
                    ctx.stroke();

                    // Draw delete handle
                    const deleteHandleCenterX = rectX + rectW;
                    const deleteHandleCenterY = rectY;
                    ctx.beginPath();
                    ctx.arc(deleteHandleCenterX, deleteHandleCenterY, DELETE_HANDLE_RADIUS / zoom, 0, 2 * Math.PI);
                    ctx.fillStyle = hoveredDeleteButton === box.id ? '#FF453A' : '#FF9500'; // Red when hovered, orange otherwise
                    ctx.fill();
                }
            }
        });

        if (cursor && cursor.boxId === selectedBoxId && isCursorVisible) {
            const box = boxes.find(b => b.id === cursor.boxId);
            if (box) {
                const { pixelX, pixelY } = getCursorPixelPosition(ctx, box, cursor.index);
                ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';
                ctx.fillRect(pixelX, pixelY, 1 / zoom, FONT_SIZE);
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

        ctx.restore();
    }, [boxes, canvasRef, selectedBoxId, newBoxPreview, cursor, hoveredDeleteButton, pan, zoom, isCursorVisible, connections]);

    return { draw, getCursorIndexFromClick };
}; 