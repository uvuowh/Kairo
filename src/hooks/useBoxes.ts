import { useState, useEffect, useCallback } from 'react';
import { Box } from '../types';
import { invoke } from '@tauri-apps/api/core';

export const useBoxes = () => {
    const [boxes, setBoxes] = useState<Box[]>([]);
    
    useEffect(() => {
        const fetchBoxes = async () => {
            try {
                const initialBoxes = await invoke<Box[]>('get_all_boxes');
                setBoxes(initialBoxes);
            } catch (e) {
                console.error("Failed to fetch boxes from backend", e);
            }
        };
        fetchBoxes();
    }, []);

    const findBoxAt = useCallback((gridX: number, gridY: number) => {
    return boxes.find(box =>
      gridX >= box.x &&
      gridX < box.x + box.width &&
      gridY >= box.y &&
      gridY < box.y + box.height
    );
    }, [boxes]);
  
    const updateBox = useCallback(async (id: string, text: string, width: number, height: number) => {
        try {
            const updatedBoxes = await invoke<Box[]>('update_box_text', { id, text, width, height });
            setBoxes(updatedBoxes);
        } catch (e) {
            console.error("Failed to update box", e);
        }
    }, []);

    const addBox = useCallback(async (box: Omit<Box, 'id' | 'text'>) => {
        try {
            const { x, y, width, height } = box;
            const updatedBoxes = await invoke<Box[]>('add_box', { x, y, width, height });
            setBoxes(updatedBoxes);
        } catch (e) {
            console.error("Failed to add box", e);
        }
    }, []);

    const deleteBox = useCallback(async (id: string) => {
        try {
            const updatedBoxes = await invoke<Box[]>('delete_box', { id });
            setBoxes(updatedBoxes);
        } catch (e) {
            console.error("Failed to delete box", e);
        }
    }, []);

    // The moveBox logic will be handled in useInteraction, but the setter is here.
    const moveBoxes = useCallback(async (id: string, newX: number, newY: number) => {
        try {
            const updatedBoxes = await invoke<Box[]>('move_box', { boxId: id, newX, newY });
            setBoxes(updatedBoxes);
        } catch (e) {
            console.error("Failed to move box", e);
        }
    }, []);

    return { boxes, setBoxes, findBoxAt, updateBox, addBox, deleteBox, moveBoxes };
}; 