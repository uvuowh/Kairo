import { useState } from "react";
import { Box } from "../types";

const initialBoxes: Box[] = [
  { id: 'box-1', x: 5, y: 5, width: 10, height: 4, text: '你好世界！这是一个可以换行的文本框。' },
  { id: 'box-2', x: 10, y: 15, width: 5, height: 3, text: 'Hello' },
];

export const useBoxes = () => {
  const [boxes, setBoxes] = useState<Box[]>(initialBoxes);

  const findBoxAt = (gridX: number, gridY: number) => {
    return boxes.find(box =>
      gridX >= box.x &&
      gridX < box.x + box.width &&
      gridY >= box.y &&
      gridY < box.y + box.height
    );
  };
  
  const updateBoxText = (boxId: string, newText: string) => {
    setBoxes(prevBoxes =>
      prevBoxes.map(box =>
        box.id === boxId ? { ...box, text: newText } : box
      )
    );
  };

  const addBox = (newBox: Omit<Box, 'id' | 'text'>) => {
    const newId = `box-${Date.now()}-${Math.random()}`;
    setBoxes(prevBoxes => [...prevBoxes, { ...newBox, id: newId, text: '' }]);
  };

  return {
    boxes,
    setBoxes,
    findBoxAt,
    updateBoxText,
    addBox,
  };
}; 