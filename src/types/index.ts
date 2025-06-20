export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  selected?: boolean;
}

export interface Connection {
  from: string;
  to: string;
}

export interface CanvasState {
  boxes: Box[];
  connections: Connection[];
}

export const GRID_CONSTANTS = {
  gridSize: 20,
};

// 记录鼠标按下时的状态，用于区分单击和拖拽
export interface MouseDownState {
  time: number;
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  boxId: string | null;
} 