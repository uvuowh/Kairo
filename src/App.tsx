import { useEffect, useRef, useState } from "react";
import "./App.css";
import { GRID_CONSTANTS, Box } from "./types";
import { useBoxes } from "./hooks/useBoxes";
import { useInteraction } from "./hooks/useInteraction";
import { useCanvasDrawing } from "./hooks/useCanvasDrawing";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [gridConfig, setGridConfig] = useState({ columns: 0, rows: 0 });
  const [cursor, setCursor] = useState<{boxId: string, index: number} | null>(null);

  useEffect(() => {
    const calculateGridSize = () => {
      const columns = Math.floor(window.innerWidth / GRID_CONSTANTS.gridSize);
      const rows = Math.floor(window.innerHeight / GRID_CONSTANTS.gridSize);
      setGridConfig({ columns, rows });
    };

    calculateGridSize();
    window.addEventListener('resize', calculateGridSize);
    return () => window.removeEventListener('resize', calculateGridSize);
  }, []);

  const { boxes, setBoxes, findBoxAt, updateBoxText, addBox } = useBoxes();
  
  const {
    selectedBoxId,
    selectedBox,
    newBoxPreview,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  } = useInteraction(boxes, setBoxes, findBoxAt, addBox, gridConfig, (box: Box) => {
    inputRef.current?.focus();
    setCursor({ boxId: box.id, index: box.text.length });
  });

  const { draw } = useCanvasDrawing(canvasRef, boxes, selectedBoxId, newBoxPreview, gridConfig, cursor);

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

  const handleTextInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedBoxId) return;
    const newText = e.currentTarget.value;
    const newCursorIndex = e.currentTarget.selectionStart;

    updateBoxText(selectedBoxId, newText);
    setCursor({ boxId: selectedBoxId, index: newCursorIndex });
  };

  useEffect(() => {
    draw();
  }, [draw, boxes, cursor]);

  return (
    <>
      <h1 className="title">Kairo</h1>
      <div
        className="canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas
          ref={canvasRef}
          width={gridConfig.columns * GRID_CONSTANTS.gridSize}
          height={gridConfig.rows * GRID_CONSTANTS.gridSize}
        />
        <textarea
          ref={inputRef}
          className="hidden-textarea"
          onInput={handleTextInput}
          onBlur={() => setCursor(null)}
        />
      </div>
    </>
  );
}

export default App;