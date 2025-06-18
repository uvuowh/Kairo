import { useState } from "react";
import { Box } from "../types";

const initialBoxes: Box[] = [];

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

  const updateBox = (boxId: string, newText: string, newWidth: number, newHeight: number) => {
    setBoxes(prevBoxes =>
      prevBoxes.map(box =>
        box.id === boxId ? { ...box, text: newText, width: newWidth, height: newHeight } : box
      )
    );
  };

  const addBox = (newBox: Omit<Box, 'id' | 'text'>) => {
    const newId = `box-${Date.now()}-${Math.random()}`;
    setBoxes(prevBoxes => [...prevBoxes, { ...newBox, id: newId, text: '' }]);
  };

  const deleteBox = (boxId: string) => {
    setBoxes(prevBoxes => prevBoxes.filter(box => box.id !== boxId));
  };

  return {
    boxes,
    setBoxes,
    findBoxAt,
    updateBoxText,
    updateBox,
    addBox,
    deleteBox,
  };
}; 