import React, { useEffect, useRef, useState } from "react";
import { Box, GRID_CONSTANTS } from "../types";
import { useCanvas } from "../hooks/useCanvas";
import { useInteraction } from "../hooks/useInteraction";
import { useCanvasDrawing, calculateSizeForTextWithMonoFont } from "../hooks/useCanvasDrawing";
import { invoke } from "@tauri-apps/api/core";
import ColorSlider from '../components/ColorSlider';
import FileTree from '../components/FileTree';
import { COLORS } from '../config/constants';
import Toolbar from "../features/Toolbar/Toolbar";
import { useWorkspaceContext } from "../contexts/WorkspaceContext";

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

const EditorLayout: React.FC = () => {
    const {
        workspacePath,
        currentFilePath,
        loadFile,
        handleSave,
        handleSaveAs,
        setCanvasState,
        handleChangeWorkspace,
    } = useWorkspaceContext();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isComposing = useRef(false);

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const targetPan = useRef({ x: 0, y: 0 });
    const targetZoom = useRef(1);
    const animationFrameId = useRef<number | null>(null);

    const [currentColor, setCurrentColor] = useState(COLORS[0]);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [cursor, setCursor] = useState<{ boxId: string, index: number } | null>(null);
    const [isFileTreeVisible, setIsFileTreeVisible] = useState(true);

    const {
        boxes,
        connections,
        setCanvasState: setCanvasData, // renamed to avoid conflict
        findBoxAt,
        updateBox,
        addBox,
        deleteBox,
        moveBoxes,
        addConnection,
        toggleBoxSelection,
        clearSelection,
        moveSelectedBoxes,
        toggleConnections,
        cycleConnectionType,
        selectBoxes,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useCanvas();

    useEffect(() => {
        setCanvasState({ boxes, connections });
    }, [boxes, connections, setCanvasState]);

    const selectedBoxes = boxes.filter(b => b.selected);
    const selectedBox = selectedBoxes.length === 1 ? selectedBoxes[0] : null;
    const selectedBoxId = selectedBox ? selectedBox.id : null;

    const {
        newBoxPreview,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        hoveredDeleteButton,
        isPanning,
        handleContextMenu,
        selectionArea,
    } = useInteraction(
        boxes,
        connections,
        findBoxAt,
        addBox,
        (box: Box, worldX: number, worldY: number) => {
            inputRef.current?.focus();
            if (selectedBoxId === box.id) {
                const newIndex = getCursorIndexFromClick(box, worldX, worldY);
                setCursor({ boxId: box.id, index: newIndex });
            } else {
                setCursor({ boxId: box.id, index: box.text.length });
            }
        },
        (box: Box, mouseX: number, mouseY: number) => {
            const newIndex = getCursorIndexFromClick(box, mouseX, mouseY);
            inputRef.current?.focus();
            setCursor({ boxId: box.id, index: newIndex });
        },
        deleteBox,
        (gridX: number, gridY: number) => {
            addBox({ x: gridX, y: gridY, width: 2, height: 1, color: currentColor });
        },
        pan,
        setPan,
        zoom,
        moveBoxes,
        moveSelectedBoxes,
        addConnection,
        toggleConnections,
        cycleConnectionType,
        selectBoxes,
        toggleBoxSelection,
        clearSelection
    );

    const { draw, getCursorIndexFromClick } = useCanvasDrawing(
        canvasRef,
        boxes,
        connections,
        selectedBoxId,
        newBoxPreview,
        selectionArea,
        cursor,
        hoveredDeleteButton,
        pan,
        zoom,
        isDarkMode
    );

    useEffect(() => {
        if (selectedBox && cursor && inputRef.current) {
            if (document.activeElement !== inputRef.current) {
                inputRef.current.focus();
            }
            inputRef.current.value = selectedBox.text;
            inputRef.current.selectionStart = cursor.index;
            inputRef.current.selectionEnd = cursor.index;
        }
    }, [selectedBox, cursor]);

    useEffect(() => {
        if (selectedBoxId === null) {
            setCursor(null);
        }
    }, [selectedBoxId]);

    useEffect(() => {
        if (!isPanning) {
            draw();
        }
    }, [pan, zoom, boxes, connections, cursor, isPanning, draw]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setIsDarkMode(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
        }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            if (!(e.target as HTMLElement).classList.contains('hidden-textarea')) {
                return;
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            setIsFileTreeVisible(p => !p);
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [undo, redo]);

    const handleComposition = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        if (e.type === 'compositionstart') {
            isComposing.current = true;
        } else if (e.type === 'compositionend') {
            isComposing.current = false;
            handleInput(e as unknown as React.ChangeEvent<HTMLTextAreaElement>);
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (isComposing.current || !selectedBox) return;
        const newText = e.currentTarget.value;
        const { width, height } = calculateSizeForTextWithMonoFont(newText);
        updateBox(selectedBox.id, newText, width, height);
        const newCursorIndex = e.currentTarget.selectionStart;
        setCursor({ boxId: selectedBox.id, index: newCursorIndex });
    };

    const startAnimation = () => {
        if (animationFrameId.current) return;
        const animate = () => {
            const PAN_LERP_FACTOR = 0.2, ZOOM_LERP_FACTOR = 0.15, MAX_PAN_SPEED = 60;
            let needsToContinue = false;
            setPan(currentPan => {
                const dx = targetPan.current.x - currentPan.x, dy = targetPan.current.y - currentPan.y;
                if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return targetPan.current;
                needsToContinue = true;
                let moveX = dx * PAN_LERP_FACTOR, moveY = dy * PAN_LERP_FACTOR;
                const speed = Math.sqrt(moveX * moveX + moveY * moveY);
                if (speed > MAX_PAN_SPEED) {
                    moveX = (moveX / speed) * MAX_PAN_SPEED;
                    moveY = (moveY / speed) * MAX_PAN_SPEED;
                }
                return { x: currentPan.x + moveX, y: currentPan.y + moveY };
            });
            setZoom(currentZoom => {
                const dZoom = targetZoom.current - currentZoom;
                if (Math.abs(dZoom) < 0.001) return targetZoom.current;
                needsToContinue = true;
                return currentZoom + dZoom * ZOOM_LERP_FACTOR;
            });
            draw();
            if (needsToContinue) animationFrameId.current = requestAnimationFrame(animate);
            else {
                if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
                draw();
            }
        };
        animationFrameId.current = requestAnimationFrame(animate);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const isPixelBasedScroll = e.deltaMode === 0;
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        if (e.ctrlKey) {
            const zoomSensitivity = 0.005;
            const zoomMultiplier = Math.exp(-e.deltaY * zoomSensitivity);
            if (isPixelBasedScroll) {
                setZoom(currentZoom => {
                    const newZoom = Math.max(0.1, Math.min(5, currentZoom * zoomMultiplier));
                    const zoomRatio = newZoom / currentZoom;
                    setPan(currentPan => ({
                        x: mouseX - (mouseX - currentPan.x) * zoomRatio,
                        y: mouseY - (mouseY - currentPan.y) * zoomRatio
                    }));
                    targetZoom.current = newZoom;
                    targetPan.current = { x: mouseX - (mouseX - pan.x) * zoomRatio, y: mouseY - (mouseY - pan.y) * zoomRatio };
                    return newZoom;
                });
            } else {
                const oldTargetZoom = targetZoom.current;
                const newTargetZoom = Math.max(0.1, Math.min(5, oldTargetZoom * zoomMultiplier));
                targetZoom.current = newTargetZoom;
                const zoomRatio = newTargetZoom / oldTargetZoom;
                targetPan.current.x = mouseX - (mouseX - targetPan.current.x) * zoomRatio;
                targetPan.current.y = mouseY - (mouseY - targetPan.current.y) * zoomRatio;
                startAnimation();
            }
        } else {
            if (isPixelBasedScroll) {
                setPan(prevPan => {
                    const newPan = { x: prevPan.x - e.deltaX, y: prevPan.y - e.deltaY };
                    targetPan.current = newPan;
                    return newPan;
                });
            } else {
                targetPan.current.x -= e.deltaX;
                targetPan.current.y -= e.deltaY;
                startAnimation();
            }
        }
    };

    const handleResetView = async () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        let boundingBox: BoundingBox | null = null;
        const selected = boxes.filter(b => b.selected);
        if (selected.length > 0) {
            if (selected.length === 1) {
                const box = selected[0];
                boundingBox = { x: box.x, y: box.y, width: box.width, height: box.height };
            } else {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                selected.forEach(box => {
                    minX = Math.min(minX, box.x);
                    minY = Math.min(minY, box.y);
                    maxX = Math.max(maxX, box.x + box.width);
                    maxY = Math.max(maxY, box.y + box.height);
                });
                boundingBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            }
        } else {
            boundingBox = await invoke<BoundingBox | null>('get_bounding_box');
        }
        if (!boundingBox || boundingBox.width === 0 || boundingBox.height === 0) {
            targetPan.current = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
            targetZoom.current = 1;
            startAnimation();
            return;
        }
        const PADDING_PIXELS = 80;
        const viewportWidth = canvas.clientWidth, viewportHeight = canvas.clientHeight;
        if (viewportWidth <= PADDING_PIXELS * 2 || viewportHeight <= PADDING_PIXELS * 2) return;
        const contentWidth = boundingBox.width * GRID_CONSTANTS.gridSize;
        const contentHeight = boundingBox.height * GRID_CONSTANTS.gridSize;
        const finalZoom = Math.min((viewportWidth - PADDING_PIXELS * 2) / contentWidth, (viewportHeight - PADDING_PIXELS * 2) / contentHeight, 5);
        const contentCenterX = (boundingBox.x * GRID_CONSTANTS.gridSize) + contentWidth / 2;
        const contentCenterY = (boundingBox.y * GRID_CONSTANTS.gridSize) + contentHeight / 2;
        const finalPan = { x: (viewportWidth / 2) - (contentCenterX * finalZoom), y: (viewportHeight / 2) - (contentCenterY * finalZoom) };
        const startPan = pan, startZoom = zoom, animationStartTime = Date.now(), animationDuration = 500;
        const startContentScreenX = (contentCenterX * startZoom) + startPan.x, startContentScreenY = (contentCenterY * startZoom) + startPan.y;
        const endContentScreenX = viewportWidth / 2, endContentScreenY = viewportHeight / 2;
        const animate = () => {
            const elapsedTime = Date.now() - animationStartTime;
            const progress = Math.min(elapsedTime / animationDuration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 4);
            const currentZoom = startZoom + (finalZoom - startZoom) * easedProgress;
            const currentContentScreenX = startContentScreenX + (endContentScreenX - startContentScreenX) * easedProgress;
            const currentContentScreenY = startContentScreenY + (endContentScreenY - startContentScreenY) * easedProgress;
            const currentPanX = currentContentScreenX - (contentCenterX * currentZoom);
            const currentPanY = currentContentScreenY - (contentCenterY * currentZoom);
            setZoom(currentZoom);
            setPan({ x: currentPanX, y: currentPanY });
            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(animate);
            } else {
                animationFrameId.current = null;
                setPan(finalPan);
                setZoom(finalZoom);
            }
        };
        animationFrameId.current = requestAnimationFrame(animate);
    };

    return (
        <div className={`app-container ${isFileTreeVisible ? 'sidebar-visible' : ''}`}>
            {isFileTreeVisible && workspacePath && (
                <div className="sidebar">
                    <div className="sidebar-toolbar">
                        <button onClick={handleChangeWorkspace}>Change Workspace</button>
                    </div>
                    <FileTree
                        workspacePath={workspacePath}
                        onFileSelect={loadFile}
                        currentFilePath={currentFilePath}
                    />
                </div>
            )}
            <div className="main-content">
                <Toolbar
                    isFileTreeVisible={isFileTreeVisible}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onToggleFileTree={() => setIsFileTreeVisible(p => !p)}
                    onUndo={undo}
                    onRedo={redo}
                    onSave={handleSave}
                    onSaveAs={handleSaveAs}
                    onResetView={handleResetView}
                />
                <h1 className="title">Kairo</h1>
                <div
                    className={`canvas-container ${isDarkMode ? 'dark' : ''}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleContextMenu}
                    style={{ cursor: isPanning ? 'grabbing' : 'default' }}
                >
                    <ColorSlider colors={COLORS} color={currentColor} onChange={setCurrentColor} />
                    <canvas ref={canvasRef} />
                    <textarea
                        ref={inputRef}
                        className="hidden-textarea"
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={handleComposition}
                        onCompositionUpdate={handleComposition}
                        onCompositionEnd={handleComposition}
                    />
                </div>
            </div>
        </div>
    );
};

export default EditorLayout; 