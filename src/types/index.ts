export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  selected?: boolean;
  color?: string;
}

export enum ConnectionType {
  None = "None",
  Forward = "Forward",
  Bidirectional = "Bidirectional",
}

export interface Connection {
  from: string;
  to: string;
  type: ConnectionType;
}

export interface CanvasState {
  boxes: Box[];
  connections: Connection[];
}

export interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
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