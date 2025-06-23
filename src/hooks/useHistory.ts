import { useCallback, useState } from 'react';

export interface Command<T> {
  execute: (state: T) => T;
  undo: (state: T) => T;
}

export const useHistory = <T>(initialState: T) => {
  const [state, setState] = useState(initialState);
  const [undoStack, setUndoStack] = useState<Command<T>[]>([]);
  const [redoStack, setRedoStack] = useState<Command<T>[]>([]);

  const execute = useCallback((command: Command<T>) => {
    const newState = command.execute(state);
    setState(newState);
    setUndoStack(prev => [...prev, command]);
    setRedoStack([]); // Clear redo stack on new action
  }, [state]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;

    const lastCommand = undoStack[undoStack.length - 1];
    const newState = lastCommand.undo(state);
    setState(newState);
    
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastCommand]);
  }, [state, undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;

    const lastCommand = redoStack[redoStack.length - 1];
    const newState = lastCommand.execute(state);
    setState(newState);

    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, lastCommand]);
  }, [state, redoStack]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    state,
    setState,
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}; 