import { RefObject, useCallback, useEffect, useState } from 'react';
import { Box, Connection, ConnectionType, GRID_CONSTANTS, SelectionArea } from '../types';
import { BoxPreview } from './useInteraction';

type Cursor = {
    boxId: string;
    index: number;
};

const FONT_SIZE = 16;
const FONT_FAMILY = "'Maple Mono NF CN', 'Courier New', Courier, monospace";
const LINE_HEIGHT = GRID_CONSTANTS.gridSize;
export const DELETE_HANDLE_RADIUS = 4;

const getCharWidthForDrawing = (char: string): number => {
    // This is for drawing, so it should be pixel-based, not grid based.
    // Half-width for ASCII letters, numbers, and common punctuation
    if (/[a-zA-Z0-9]/.test(char) || /[\s.,!?;:'"(){}[\]<>\-_+=@#$%^&*|\\/]/.test(char)) {
        return GRID_CONSTANTS.gridSize / 2; // Assuming 1 grid = 16px, so half is 8px
    }
    // Full-width for CJK characters and full-width symbols
    else if (/[\u4e00-\u9fa5\uff00-\uffef\u3000-\u303f]/.test(char)) {
        return GRID_CONSTANTS.gridSize; // 16px
    }
    // Default other symbols to full-width
    else {
        return GRID_CONSTANTS.gridSize; // 16px
    }
};

const calculateTextWidthForDrawing = (text: string): number => {
    let width = 0;
    for (const char of text) {
        width += getCharWidthForDrawing(char);
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
    
    const pixelX = box.x * GRID_CONSTANTS.gridSize + calculateTextWidthForDrawing(textOnCursorLine);
    const pixelY = box.y * GRID_CONSTANTS.gridSize + (cursorLineIndex * LINE_HEIGHT);
    return { pixelX, pixelY, cursorLineIndex };
};

const renderTextInBox = (
    ctx: CanvasRenderingContext2D,
    box: Box,
    isDarkMode: boolean
) => {
    ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    
    const boxWidthInPixels = box.width * GRID_CONSTANTS.gridSize;
    const lines = breakTextIntoLines(ctx, box.text, boxWidthInPixels);

    lines.forEach((line, lineIndex) => {
        if ((lineIndex + 1) * LINE_HEIGHT > box.height * GRID_CONSTANTS.gridSize) return;
        let drawX = box.x * GRID_CONSTANTS.gridSize;
        const lineTop = box.y * GRID_CONSTANTS.gridSize + (lineIndex * LINE_HEIGHT);
        const drawY = lineTop + (LINE_HEIGHT / 2);
        
        for (const char of line) {
            ctx.fillText(char, drawX, drawY);
            drawX += getCharWidthForDrawing(char);
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
            if (calculateTextWidthForDrawing(word) > boxWidthInPixels) {
                // If so, it needs to be broken up character by character.
                // But first, push whatever was on the current line.
                if (currentLine) {
                    allLines.push(currentLine);
                }
                currentLine = ''; // Start fresh for the broken word.

                let tempLine = '';
                for (const char of word) {
                    const lineWithChar = tempLine + char;
                    if (calculateTextWidthForDrawing(lineWithChar) > boxWidthInPixels) {
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
                if (calculateTextWidthForDrawing(lineWithWord) > boxWidthInPixels) {
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
        const lineWidth = calculateTextWidthForDrawing(line);
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

export const calculateSizeForTextWithMonoFont = (text: string): { width: number, height: number } => {
    if (!text) {
        return { width: 2, height: 1 }; // Default size for empty box
    }

    const lines = text.split('\n');
    let maxChars = 0;
    
    for (const line of lines) {
        let charCount = 0;
        for (const char of line) {
            // Half-width for ASCII
            if (char.charCodeAt(0) >= 0 && char.charCodeAt(0) <= 127) {
                charCount += 0.5;
            } else { // Full-width for others
                charCount += 1;
            }
        }
        if (charCount > maxChars) {
            maxChars = charCount;
        }
    }
    
    // Each grid cell is assumed to hold two half-width characters (like in getCharWidthForDrawing).
    const widthInGrids = Math.max(2, Math.ceil(maxChars));
    const heightInGrids = Math.max(1, lines.length);

    return { width: widthInGrids, height: heightInGrids };
}

const getEdgeIntersectionPoint = (
    box: Box,
    outsidePoint: { x: number, y: number }
): { x: number, y: number } => {
    const boxCenterX = (box.x + box.width / 2) * GRID_CONSTANTS.gridSize;
    const boxCenterY = (box.y + box.height / 2) * GRID_CONSTANTS.gridSize;

    const dx = outsidePoint.x - boxCenterX;
    const dy = outsidePoint.y - boxCenterY;

    if (dx === 0 && dy === 0) return { x: boxCenterX, y: boxCenterY };

    const halfWidth = (box.width / 2) * GRID_CONSTANTS.gridSize;
    const halfHeight = (box.height / 2) * GRID_CONSTANTS.gridSize;

    const slope = Math.abs(dy / dx);
    const boxSlope = halfHeight / halfWidth;

    let x, y;

    if (slope < boxSlope) {
        if (dx > 0) {
            x = boxCenterX + halfWidth;
            y = boxCenterY + halfWidth * (dy / dx);
        } else {
            x = boxCenterX - halfWidth;
            y = boxCenterY - halfWidth * (dy / dx);
        }
    } else {
        if (dy > 0) {
            y = boxCenterY + halfHeight;
            x = boxCenterX + halfHeight * (dx / dy);
        } else {
            y = boxCenterY - halfHeight;
            x = boxCenterX - halfHeight * (dx / dy);
        }
    }

    return { x, y };
};

enum PortDirection { Top, Right, Bottom, Left }

interface ConnectionPoint {
    x: number;
    y: number;
    direction: PortDirection;
}

const getBestConnectionPoints = (
    fromBox: Box,
    toBox: Box
): { start: ConnectionPoint, end: ConnectionPoint } => {
    const fromCenterX = fromBox.x + fromBox.width / 2;
    const fromCenterY = fromBox.y + fromBox.height / 2;
    const toCenterX = toBox.x + toBox.width / 2;
    const toCenterY = toBox.y + toBox.height / 2;

    const dx = toCenterX - fromCenterX;
    const dy = toCenterY - fromCenterY;

    let fromDirection: PortDirection;
    if (Math.abs(dx) > Math.abs(dy)) {
        fromDirection = dx > 0 ? PortDirection.Right : PortDirection.Left;
    } else {
        fromDirection = dy > 0 ? PortDirection.Bottom : PortDirection.Top;
    }

    let toDirection: PortDirection;
    if (Math.abs(dx) > Math.abs(dy)) {
        toDirection = dx > 0 ? PortDirection.Left : PortDirection.Right;
    } else {
        toDirection = dy > 0 ? PortDirection.Top : PortDirection.Bottom;
    }

    const getCoords = (box: Box, dir: PortDirection): { x: number, y: number } => {
        const halfW = (box.width / 2) * GRID_CONSTANTS.gridSize;
        const halfH = (box.height / 2) * GRID_CONSTANTS.gridSize;
        const centerX = (box.x + box.width / 2) * GRID_CONSTANTS.gridSize;
        const centerY = (box.y + box.height / 2) * GRID_CONSTANTS.gridSize;
        switch (dir) {
            case PortDirection.Top: return { x: centerX, y: centerY - halfH };
            case PortDirection.Right: return { x: centerX + halfW, y: centerY };
            case PortDirection.Bottom: return { x: centerX, y: centerY + halfH };
            case PortDirection.Left: return { x: centerX - halfW, y: centerY };
        }
    };

    return {
        start: { ...getCoords(fromBox, fromDirection), direction: fromDirection },
        end: { ...getCoords(toBox, toDirection), direction: toDirection },
    };
};

const calculateCurveControlPoints = (
    start: ConnectionPoint,
    end: ConnectionPoint
): { cp1: { x: number, y: number }, cp2: { x: number, y: number } } => {
    const offset = 60;
    let cp1 = { ...start };
    let cp2 = { ...end };

    switch (start.direction) {
        case PortDirection.Top: cp1.y -= offset; break;
        case PortDirection.Right: cp1.x += offset; break;
        case PortDirection.Bottom: cp1.y += offset; break;
        case PortDirection.Left: cp1.x -= offset; break;
    }

    switch (end.direction) {
        case PortDirection.Top: cp2.y -= offset; break;
        case PortDirection.Right: cp2.x += offset; break;
        case PortDirection.Bottom: cp2.y += offset; break;
        case PortDirection.Left: cp2.x -= offset; break;
    }

    return { cp1, cp2 };
}

export const useCanvasDrawing = (
    canvasRef: RefObject<HTMLCanvasElement>, 
    boxes: Box[],
    connections: Connection[],
    selectedBoxId: string | null,
    newBoxPreview: BoxPreview | null,
    selectionArea: SelectionArea | null,
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

    const drawArrowhead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, arrowSize: number) => {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        
        ctx.save();
        ctx.beginPath();
        ctx.translate(toX, toY);
        ctx.rotate(angle);
        
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowSize, -arrowSize / 2);
        ctx.lineTo(-arrowSize, arrowSize / 2);
        ctx.closePath();
        
        ctx.restore();
        ctx.fill();
    };

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
        ctx.strokeStyle = isDarkMode ? '#555' : '#ccc';
        ctx.lineWidth = 2;
        ctx.fillStyle = isDarkMode ? '#aaa' : '#555'; // For arrowheads

        connections.forEach(connection => {
            const fromBox = boxes.find(b => b.id === connection.from);
            const toBox = boxes.find(b => b.id === connection.to);
            if (fromBox && toBox) {
                const { start: startPoint, end: endPoint } = getBestConnectionPoints(fromBox, toBox);
                const { cp1, cp2 } = calculateCurveControlPoints(startPoint, endPoint);

                ctx.beginPath();
                ctx.moveTo(startPoint.x, startPoint.y);
                ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, endPoint.x, endPoint.y);
                ctx.stroke();

                if (connection.type === ConnectionType.Forward || connection.type === ConnectionType.Bidirectional) {
                    drawArrowhead(ctx, cp2.x, cp2.y, endPoint.x, endPoint.y, 10);
                }
                if (connection.type === ConnectionType.Bidirectional) {
                    drawArrowhead(ctx, cp1.x, cp1.y, startPoint.x, startPoint.y, 10);
                }
            }
        });

        // Draw all boxes
        boxes.forEach(box => {
            const isBoxSelected = box.selected;
            const rectX = box.x * GRID_CONSTANTS.gridSize;
            const rectY = box.y * GRID_CONSTANTS.gridSize;
            const rectW = box.width * GRID_CONSTANTS.gridSize;
            const rectH = box.height * GRID_CONSTANTS.gridSize;
            const borderRadius = 4;
            
            ctx.save();

            const boxBorderColor = box.color || (isDarkMode ? '#555' : '#ccc');

            if (isBoxSelected) {
                ctx.shadowColor = boxBorderColor;
                ctx.shadowBlur = 15;
                ctx.shadowOffsetY = 0;
                ctx.fillStyle = isDarkMode ? "rgba(40, 40, 40, 0.9)" : "rgba(255, 255, 255, 0.9)";
            } else {
                ctx.shadowColor = isDarkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.15)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = 'transparent';
            }
            
            ctx.strokeStyle = boxBorderColor;
            ctx.lineWidth = isBoxSelected ? 2.5 : 1.5;

            roundRect(ctx, rectX, rectY, rectW, rectH, borderRadius);
            ctx.fill();
            ctx.stroke();

            ctx.restore();

            renderTextInBox(ctx, box, isDarkMode);

            // Draw delete handle
            if (isBoxSelected) {
                const deleteHandleCenterX = rectX + rectW;
                const deleteHandleCenterY = rectY;

                ctx.beginPath();
                ctx.arc(deleteHandleCenterX, deleteHandleCenterY, DELETE_HANDLE_RADIUS, 0, 2 * Math.PI);
                ctx.fillStyle = hoveredDeleteButton === box.id ? '#FF453A' : '#FF9500';
                ctx.fill();
            }
        });

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

        // Finally, if the cursor should be visible, draw it.
        if (isCursorVisible && cursor && selectedBoxId === cursor.boxId && document.activeElement === canvasRef.current?.nextSibling) {
            const selectedBox = boxes.find(b => b.id === selectedBoxId);
            if (selectedBox) {
                const { pixelX, pixelY } = getCursorPixelPosition(
                    ctx,
                    selectedBox,
                    cursor.index
                );
                
                ctx.fillStyle = isDarkMode ? '#f0f0f0' : '#333';

                const cursorHeight = LINE_HEIGHT * 0.9;
                const cursorYOffset = (LINE_HEIGHT - cursorHeight) / 2;
                
                ctx.fillRect(
                    pixelX,
                    pixelY + cursorYOffset,
                    2,
                    cursorHeight
                );
            }
        }

        if (selectionArea) {
            ctx.fillStyle = "rgba(0, 100, 255, 0.1)";
            ctx.strokeStyle = "rgba(0, 100, 255, 0.5)";
            ctx.lineWidth = 1 / zoom;
            const width = selectionArea.endX - selectionArea.startX;
            const height = selectionArea.endY - selectionArea.startY;
            ctx.fillRect(selectionArea.startX, selectionArea.startY, width, height);
            ctx.strokeRect(selectionArea.startX, selectionArea.startY, width, height);
        }

        ctx.restore();
    }, [boxes, canvasRef, selectedBoxId, newBoxPreview, selectionArea, hoveredDeleteButton, pan, zoom, connections, isCursorVisible]);

    return { draw, getCursorIndexFromClick };
}; 