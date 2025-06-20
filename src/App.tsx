import { useEffect, useRef, useState } from "react";
import "./App.css";
import { GRID_CONSTANTS, Box, CanvasState } from "./types";
import { useCanvas } from "./hooks/useCanvas";
import { useInteraction } from "./hooks/useInteraction";
import { useCanvasDrawing, calculateSizeForText } from "./hooks/useCanvasDrawing";
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from "@tauri-apps/api/core";

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposing = useRef(false);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const targetPan = useRef({ x: 0, y: 0 });
  const targetZoom = useRef(1);
  const animationFrameId = useRef<number | null>(null);
  
  const [cursor, setCursor] = useState<{boxId: string, index: number} | null>(null);

  const { 
    boxes, 
    connections, 
    setCanvasState, 
    findBoxAt, 
    updateBox, 
    addBox, 
    deleteBox, 
    moveBoxes, 
    addConnection, 
    toggleBoxSelection, 
    clearSelection,
    moveSelectedBoxes
  } = useCanvas();
  
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
  } = useInteraction(
    boxes,
    () => {},
    findBoxAt,
    addBox,
    (box: Box, worldX: number, worldY: number) => {
        if (selectedBoxes.length !== 1) return;
        inputRef.current?.focus();
        if (selectedBoxId === box.id) {
            const newIndex = getCursorIndexFromClick(box, worldX, worldY);
            setCursor({ boxId: box.id, index: newIndex });
        } else {
        setCursor({ boxId: box.id, index: box.text.length });
        }
    },
    (box: Box, mouseX: number, mouseY: number) => {
        if (selectedBoxes.length !== 1) return;
        const newIndex = getCursorIndexFromClick(box, mouseX, mouseY);
        inputRef.current?.focus();
        setCursor({ boxId: box.id, index: newIndex });
    },
    deleteBox,
    (gridX: number, gridY: number) => {
        addBox({ x: gridX, y: gridY, width: 2, height: 1 });
    },
    pan,
    setPan,
    zoom,
    moveBoxes,
    moveSelectedBoxes,
    addConnection,
    toggleBoxSelection,
    clearSelection
  );

  const { draw, getCursorIndexFromClick } = useCanvasDrawing(
    canvasRef,
    boxes,
    connections,
    selectedBoxId,
    newBoxPreview,
    cursor,
    hoveredDeleteButton,
    pan,
    zoom
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

  const startAnimation = () => {
    if (animationFrameId.current) return;

    const animate = () => {
      const PAN_LERP_FACTOR = 0.2;
      const ZOOM_LERP_FACTOR = 0.15;
      const MAX_PAN_SPEED = 60;

      let needsToContinue = false;

      setPan(currentPan => {
        const dx = targetPan.current.x - currentPan.x;
        const dy = targetPan.current.y - currentPan.y;
        
        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
            return targetPan.current;
        }
        needsToContinue = true;

        let moveX = dx * PAN_LERP_FACTOR;
        let moveY = dy * PAN_LERP_FACTOR;

        const speed = Math.sqrt(moveX * moveX + moveY * moveY);

        if (speed > MAX_PAN_SPEED) {
            moveX = (moveX / speed) * MAX_PAN_SPEED;
            moveY = (moveY / speed) * MAX_PAN_SPEED;
        }
        
        return { x: currentPan.x + moveX, y: currentPan.y + moveY };
      });

      setZoom(currentZoom => {
        const dZoom = targetZoom.current - currentZoom;
        if (Math.abs(dZoom) < 0.001) {
            return targetZoom.current;
        }
        needsToContinue = true;
        
        return currentZoom + dZoom * ZOOM_LERP_FACTOR;
      });

      draw(); 

      if (needsToContinue) {
      animationFrameId.current = requestAnimationFrame(animate);
      } else {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
        draw();
      }
    };
    animationFrameId.current = requestAnimationFrame(animate);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isPanning) {
        return;
    }
    e.preventDefault();

    if (e.ctrlKey) {
        const zoomSensitivity = 0.005;
        const oldTargetZoom = targetZoom.current;
        const zoomMultiplier = Math.exp(-e.deltaY * zoomSensitivity);
        const newTargetZoom = Math.max(0.1, Math.min(5, oldTargetZoom * zoomMultiplier));
        targetZoom.current = newTargetZoom;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomRatio = newTargetZoom / oldTargetZoom;
        
        targetPan.current.x = mouseX - (mouseX - targetPan.current.x) * zoomRatio;
        targetPan.current.y = mouseY - (mouseY - targetPan.current.y) * zoomRatio;
        startAnimation();
    } else {
        const isPixelBasedScroll = e.deltaMode === 0;

        if (isPixelBasedScroll) {
            setPan(prevPan => {
                const newPan = {
                    x: prevPan.x - e.deltaX,
                    y: prevPan.y - e.deltaY
                };
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

  const handleTextInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isComposing.current || !selectedBoxId) return;
    
    const newText = e.currentTarget.value;
    const newCursorIndex = e.currentTarget.selectionStart;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const { width, height } = calculateSizeForText(ctx, newText);
    updateBox(selectedBoxId, newText, width, height);
    setCursor({ boxId: selectedBoxId, index: newCursorIndex });
  };

  const handleComposition = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    if (e.type === 'compositionstart') {
        isComposing.current = true;
    } else if (e.type === 'compositionend') {
        isComposing.current = false;
        handleTextInput(e as any);
    }
  };

  const handleResetView = async () => {
    if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
    }
    
    const boundingBox = await invoke<BoundingBox | null>('get_bounding_box');
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!boundingBox || boundingBox.width === 0 || boundingBox.height === 0) {
        targetPan.current = { x: 0, y: 0 };
        targetZoom.current = 1;
        startAnimation();
        return;
    }

    const PADDING_PIXELS = 40;
    const viewportWidth = canvas.clientWidth;
    const viewportHeight = canvas.clientHeight;

    if (viewportWidth <= PADDING_PIXELS * 2 || viewportHeight <= PADDING_PIXELS * 2) return;

    const contentWidth = boundingBox.width * GRID_CONSTANTS.gridSize;
    const contentHeight = boundingBox.height * GRID_CONSTANTS.gridSize;

    const finalZoom = Math.min(
        (viewportWidth - PADDING_PIXELS * 2) / contentWidth,
        (viewportHeight - PADDING_PIXELS * 2) / contentHeight,
        5
    );
    
    const contentCenterX = (boundingBox.x * GRID_CONSTANTS.gridSize) + contentWidth / 2;
    const contentCenterY = (boundingBox.y * GRID_CONSTANTS.gridSize) + contentHeight / 2;

    const finalPan = {
        x: (viewportWidth / 2) - (contentCenterX * finalZoom),
        y: (viewportHeight / 2) - (contentCenterY * finalZoom)
    };

    const startPan = pan;
    const startZoom = zoom;
    const animationStartTime = Date.now();
    const animationDuration = 500;

    const startContentScreenX = (contentCenterX * startZoom) + startPan.x;
    const startContentScreenY = (contentCenterY * startZoom) + startPan.y;
    const endContentScreenX = viewportWidth / 2;
    const endContentScreenY = viewportHeight / 2;

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

  const handleSave = async () => {
    try {
        const filePath = await save({
            title: "Save Kairo File",
            filters: [{ name: 'Kairo File', extensions: ['kairo'] }]
        });
        if (filePath) {
            await writeTextFile(filePath, JSON.stringify({ boxes, connections }, null, 2));
        }
    } catch (err) {
        console.error("Error saving file:", err);
    }
  };

  const handleLoad = async () => {
      try {
          const selectedPath = await open({
              multiple: false,
              title: "Open Kairo File",
              filters: [{ name: 'Kairo File', extensions: ['kairo'] }]
          });
          if (typeof selectedPath === 'string') {
              const content = await readTextFile(selectedPath);
              const loadedState: CanvasState = JSON.parse(content);
              if (loadedState && Array.isArray(loadedState.boxes) && Array.isArray(loadedState.connections)) {
                const syncedState = await invoke<CanvasState>('load_new_state', { newState: loadedState });
                setCanvasState(syncedState);
              } else {
                console.error("Invalid file format");
              }
          }
      } catch (err) {
          console.error("Error loading file:", err);
      }
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <button onClick={handleSave}>Save</button>
        <button onClick={handleLoad}>Load</button>
        <button onClick={handleResetView}>Reset View</button>
      </div>
      <h1 className="title">Kairo</h1>
      <div
        className="canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      >
        <canvas
          ref={canvasRef}
        />
        <textarea
          ref={inputRef}
          className="hidden-textarea"
          onInput={handleTextInput}
          onBlur={() => {}}
          onCompositionStart={handleComposition}
          onCompositionEnd={handleComposition}
        />
      </div>
    </div>
  );
}

export default App;