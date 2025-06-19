import { useEffect, useRef, useState } from "react";
import "./App.css";
import { GRID_CONSTANTS, Box } from "./types";
import { useBoxes } from "./hooks/useBoxes";
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

  const { boxes, setBoxes, findBoxAt, updateBox, addBox, deleteBox, moveBoxes, resetBoxes } = useBoxes();
  
  const {
    selectedBoxId,
    selectedBox,
    newBoxPreview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    hoveredDeleteButton,
    isPanning,
  } = useInteraction(
    boxes,
    (boxes: Box[]) => setBoxes(boxes),
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
        addBox({ x: gridX, y: gridY, width: 2, height: 1 });
    },
    pan,
    setPan,
    zoom,
    moveBoxes
  );

  const { draw, getCursorIndexFromClick } = useCanvasDrawing(
    canvasRef,
    boxes,
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
    // This effect handles redrawing when state changes,
    // but avoids redrawing during a direct pan drag, as that is handled by the interaction hook.
    if (!isPanning) {
        draw();
    }
  }, [pan, zoom, boxes, cursor, isPanning, draw]);

  const startAnimation = () => {
    if (animationFrameId.current) return;

    const animate = () => {
      const LERP_FACTOR = 0.1; // Smoothing factor

      let needsToContinue = false;

      setZoom(currentZoom => {
        const dZoom = targetZoom.current - currentZoom;
        if (Math.abs(dZoom) > 0.001) {
            needsToContinue = true;
            return currentZoom + dZoom * LERP_FACTOR;
        }
        return targetZoom.current;
      });

      setPan(currentPan => {
        const dx = targetPan.current.x - currentPan.x;
        const dy = targetPan.current.y - currentPan.y;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            needsToContinue = true;
        return { x: currentPan.x + dx * LERP_FACTOR, y: currentPan.y + dy * LERP_FACTOR };
        }
        return targetPan.current;
      });
      
      draw(); // Redraw on each frame of the animation for smoothness

      if (needsToContinue) {
      animationFrameId.current = requestAnimationFrame(animate);
      } else {
        animationFrameId.current = null;
      }
    };
    animationFrameId.current = requestAnimationFrame(animate);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent wheel actions while panning with the mouse
    if (isPanning) {
        return;
    }
    e.preventDefault();

    if (e.ctrlKey) {
        // --- Zoom Logic (Pinch Gesture) ---
        // This is always animated for a smooth feel.
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
        // --- Pan Logic (Two-finger scroll or Mouse Wheel) ---
        // e.deltaMode === 0 means pixels (trackpads, precision mice)
        // e.deltaMode === 1 means lines (traditional mouse wheel)
        const isPixelBasedScroll = e.deltaMode === 0;

        if (isPixelBasedScroll) {
            // For trackpads, apply pan directly for a 1:1 feel.
            setPan(prevPan => {
                const newPan = {
                    x: prevPan.x - e.deltaX,
                    y: prevPan.y - e.deltaY
                };
                // Also update the animation target to prevent conflicts.
                targetPan.current = newPan;
                return newPan;
            });
        } else {
            // For traditional mouse wheels, use smooth animation.
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
        // compositionend is fired before the final onInput event in some browsers,
        // so we manually trigger the text update here to ensure correctness.
        handleTextInput(e as any);
    }
  };

  const handleSave = async () => {
    try {
        const filePath = await save({
            title: "Save Kairo File",
            filters: [{ name: 'Kairo File', extensions: ['kairo'] }]
        });
        if (filePath) {
            await writeTextFile(filePath, JSON.stringify(boxes, null, 2));
        }
    } catch (err) {
        console.error("Error saving file:", err);
        // Optionally, show an error to the user
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
              const loadedBoxes: Box[] = JSON.parse(content);
              // Basic validation
              if (Array.isArray(loadedBoxes)) {
                const syncedBoxes = await invoke<Box[]>('set_all_boxes', { newBoxes: loadedBoxes });
                setBoxes(syncedBoxes);
              } else {
                console.error("Invalid file format");
              }
          }
      } catch (err) {
          console.error("Error loading file:", err);
          // Optionally, show an error to the user
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

    // --- Custom Animation Logic ---
    const startPan = pan;
    const startZoom = zoom;
    const animationStartTime = Date.now();
    const animationDuration = 500; // in ms

    const startContentScreenX = (contentCenterX * startZoom) + startPan.x;
    const startContentScreenY = (contentCenterY * startZoom) + startPan.y;
    const endContentScreenX = viewportWidth / 2;
    const endContentScreenY = viewportHeight / 2;

    const animate = () => {
        const elapsedTime = Date.now() - animationStartTime;
        const progress = Math.min(elapsedTime / animationDuration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 4); // easeOutQuart

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
            setPan(finalPan); // Snap to final position
            setZoom(finalZoom);
        }
    };

    animationFrameId.current = requestAnimationFrame(animate);
  };

  const handleClearCanvas = () => {
    if (window.confirm("Are you sure you want to clear the canvas? This cannot be undone.")) {
        resetBoxes();
    }
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <button onClick={handleSave}>Save</button>
        <button onClick={handleLoad}>Load</button>
        <button onClick={handleResetView}>Reset View</button>
        <button onClick={handleClearCanvas}>Clear Canvas</button>
      </div>
      <h1 className="title">Kairo</h1>
      <div
        className="canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      >
        <canvas
          ref={canvasRef}
        />
        <textarea
          ref={inputRef}
          className="hidden-textarea"
          onInput={handleTextInput}
          onBlur={() => { /* Now handled by useEffect */ }}
          onCompositionStart={handleComposition}
          onCompositionEnd={handleComposition}
        />
      </div>
    </div>
  );
}

export default App;