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
    }
  );

  const { draw, getCursorIndexFromClick } = useCanvasDrawing(
    canvasRef,
    boxes,
    selectedBoxId,
    newBoxPreview,
    cursor,
    hoveredDeleteButton
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
      >
        <canvas
          ref={canvasRef}
          width={window.innerWidth}
          height={window.innerHeight}
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