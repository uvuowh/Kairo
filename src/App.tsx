import { useEffect, useRef, useState } from "react";
import "./App.css";
import { GRID_CONSTANTS, Box } from "./types";
import { useBoxes } from "./hooks/useBoxes";
import { useInteraction } from "./hooks/useInteraction";
import { useCanvasDrawing, calculateSizeForText } from "./hooks/useCanvasDrawing";
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';

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

  const { boxes, setBoxes, findBoxAt, updateBox, addBox, deleteBox } = useBoxes();
  
  const {
    selectedBoxId,
    selectedBox,
    newBoxPreview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    hoveredDeleteButton,
  } = useInteraction(
    boxes,
    setBoxes,
    findBoxAt,
    addBox,
    (box: Box) => {
        inputRef.current?.focus();
        setCursor({ boxId: box.id, index: box.text.length });
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
    zoom
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

  const startAnimation = () => {
    if (animationFrameId.current) return;

    const animate = () => {
      const LERP_FACTOR = 0.1; // Smoothing factor

      setPan(currentPan => {
        const dx = targetPan.current.x - currentPan.x;
        const dy = targetPan.current.y - currentPan.y;
        
        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
            return targetPan.current;
        }
        return { x: currentPan.x + dx * LERP_FACTOR, y: currentPan.y + dy * LERP_FACTOR };
      });

      setZoom(currentZoom => {
        const dZoom = targetZoom.current - currentZoom;
        if (Math.abs(dZoom) < 0.001) {
            return targetZoom.current;
        }
        return currentZoom + dZoom * LERP_FACTOR;
      });

      animationFrameId.current = requestAnimationFrame(animate);
    };
    animationFrameId.current = requestAnimationFrame(animate);
  };

  // Effect to stop animation when target is reached
  useEffect(() => {
    const panReached = Math.abs(targetPan.current.x - pan.x) < 0.1 && Math.abs(targetPan.current.y - pan.y) < 0.1;
    const zoomReached = Math.abs(targetZoom.current - zoom) < 0.001;

    if (panReached && zoomReached && animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
    }
  }, [pan, zoom]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
        // Zooming
        const zoomSpeed = 0.005;
        const oldTargetZoom = targetZoom.current;
        const newTargetZoom = Math.max(0.1, Math.min(5, oldTargetZoom - e.deltaY * zoomSpeed));
        targetZoom.current = newTargetZoom;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomRatio = newTargetZoom / oldTargetZoom;
        
        // Apply pan delta to keep mouse position constant
        targetPan.current.x = mouseX - (mouseX - targetPan.current.x) * zoomRatio;
        targetPan.current.y = mouseY - (mouseY - targetPan.current.y) * zoomRatio;
    } else {
        // Panning
        targetPan.current.x -= e.deltaX;
        targetPan.current.y -= e.deltaY;
    }
    startAnimation();
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

  useEffect(() => {
    draw();
  }, [draw, boxes, cursor]);

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
                setBoxes(loadedBoxes);
              } else {
                console.error("Invalid file format");
              }
          }
      } catch (err) {
          console.error("Error loading file:", err);
          // Optionally, show an error to the user
      }
  };

  return (
    <div className="app-container">
      <div className="top-bar">
        <button onClick={handleSave}>Save</button>
        <button onClick={handleLoad}>Load</button>
      </div>
      <h1 className="title">Kairo</h1>
      <div
        className="canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
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