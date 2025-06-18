import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// 类型定义
interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridConfig {
  gridSize: number;
  columns: number;
  rows: number;
}

interface DragState {
  isDragging: boolean;
  isCreating: boolean;
  draggedBox: Box | null;
  startX: number;
  startY: number;
  initialBoxX: number;
  initialBoxY: number;
}

function App() {
  // 网格配置
  const gridConfig: GridConfig = {
    gridSize: 20,
    columns: 40, // 800px / 20px
    rows: 30,    // 600px / 20px
  };

  // 状态管理
  const [boxes, setBoxes] = useState<Box[]>([
    // 添加一些测试方框
    { id: 'box-1', x: 5, y: 5, width: 3, height: 2 },
    { id: 'box-2', x: 10, y: 8, width: 2, height: 3 },
    { id: 'box-3', x: 15, y: 12, width: 4, height: 2 },
  ]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    isCreating: false,
    draggedBox: null,
    startX: 0,
    startY: 0,
    initialBoxX: 0,
    initialBoxY: 0,
  });
  const [previewBox, setPreviewBox] = useState<Box | null>(null);
  const [debugInfo, setDebugInfo] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);

  // 调试信息
  useEffect(() => {
    const debugData = {
      boxes: boxes.length,
      dragState,
      previewBox,
      gridConfig,
      timestamp: new Date().toISOString(),
    };
    setDebugInfo(JSON.stringify(debugData, null, 2));
  }, [boxes, dragState, previewBox]);

  // 坐标转换工具函数
  const pixelToGrid = useCallback((pixelX: number, pixelY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    const relativeX = pixelX - rect.left;
    const relativeY = pixelY - rect.top;
    
    return {
      x: Math.floor(relativeX / gridConfig.gridSize),
      y: Math.floor(relativeY / gridConfig.gridSize),
    };
  }, [gridConfig.gridSize]);

  const gridToPixel = useCallback((gridX: number, gridY: number) => {
    return {
      x: gridX * gridConfig.gridSize,
      y: gridY * gridConfig.gridSize,
    };
  }, [gridConfig.gridSize]);

  // 碰撞检测
  const isColliding = useCallback((boxA: Box, boxB: Box) => {
    return !(
      boxA.x >= boxB.x + boxB.width ||
      boxA.x + boxA.width <= boxB.x ||
      boxA.y >= boxB.y + boxB.height ||
      boxA.y + boxA.height <= boxB.y
    );
  }, []);

  // 检查方框是否在网格边界内
  const isWithinBounds = useCallback((box: Box) => {
    return (
      box.x >= 0 &&
      box.y >= 0 &&
      box.x + box.width <= gridConfig.columns &&
      box.y + box.height <= gridConfig.rows
    );
  }, [gridConfig.columns, gridConfig.rows]);

  // 推挤算法 - 重写版本
  const calculatePushMovement = useCallback((draggedBox: Box, targetX: number, targetY: number) => {
    console.log('Calculating push movement for box:', draggedBox.id, 'to:', targetX, targetY);
    
    const movementPlan: Record<string, { x: number; y: number }> = {};
    const moveQueue: Array<{ box: Box; newX: number; newY: number; priority: number }> = [
      { box: draggedBox, newX: targetX, newY: targetY, priority: 0 } // 拖拽的方框优先级最高
    ];
    const processed = new Set<string>();

    while (moveQueue.length > 0) {
      // 按优先级排序，优先级高的先处理
      moveQueue.sort((a, b) => a.priority - b.priority);
      const { box, newX, newY, priority } = moveQueue.shift()!;

      if (processed.has(box.id)) continue;
      processed.add(box.id);

      console.log('Processing box:', box.id, 'at priority:', priority, 'to:', newX, newY);

      // 检查边界
      if (!isWithinBounds({ ...box, x: newX, y: newY })) {
        console.log('Box out of bounds:', box.id);
        return { success: false, reason: "out of bounds" };
      }

      // 寻找碰撞
      const collisions = boxes.filter(otherBox => 
        otherBox.id !== box.id && 
        isColliding({ ...box, x: newX, y: newY }, otherBox)
      );

      console.log('Collisions for box:', box.id, ':', collisions.length);

      // 计算推挤 - 支持四个方向
      for (const collidedBox of collisions) {
        if (processed.has(collidedBox.id)) continue;

        // 计算推挤方向和距离
        let pushDeltaX = 0;
        let pushDeltaY = 0;

        // 水平推挤
        if (newX + box.width > collidedBox.x && newX < collidedBox.x) {
          // 向右推
          pushDeltaX = (newX + box.width) - collidedBox.x;
        } else if (newX < collidedBox.x + collidedBox.width && newX + box.width > collidedBox.x + collidedBox.width) {
          // 向左推
          pushDeltaX = newX - (collidedBox.x + collidedBox.width);
        }

        // 垂直推挤
        if (newY + box.height > collidedBox.y && newY < collidedBox.y) {
          // 向下推
          pushDeltaY = (newY + box.height) - collidedBox.y;
        } else if (newY < collidedBox.y + collidedBox.height && newY + box.height > collidedBox.y + collidedBox.height) {
          // 向上推
          pushDeltaY = newY - (collidedBox.y + collidedBox.height);
        }

        // 选择推挤距离较小的方向（避免过度推挤）
        if (Math.abs(pushDeltaX) < Math.abs(pushDeltaY) || pushDeltaY === 0) {
          pushDeltaY = 0; // 优先水平推挤
        } else {
          pushDeltaX = 0; // 优先垂直推挤
        }

        const pushedBoxNewX = collidedBox.x + pushDeltaX;
        const pushedBoxNewY = collidedBox.y + pushDeltaY;

        console.log('Pushing box:', collidedBox.id, 'by:', pushDeltaX, pushDeltaY);

        moveQueue.push({ 
          box: collidedBox, 
          newX: pushedBoxNewX, 
          newY: pushedBoxNewY,
          priority: priority + 1 // 被推挤的方框优先级降低
        });
      }

      movementPlan[box.id] = { x: newX, y: newY };
    }

    console.log('Movement plan:', movementPlan);
    return { success: true, plan: movementPlan };
  }, [boxes, isColliding, isWithinBounds]);

  // 改进的碰撞检测 - 更精确的检测
  const hasCollision = useCallback((box: Box, excludeId?: string) => {
    const collision = boxes.some(otherBox => {
      if (otherBox.id === excludeId) return false;
      
      // 更精确的碰撞检测
      const horizontalOverlap = !(box.x >= otherBox.x + otherBox.width || 
                                 box.x + box.width <= otherBox.x);
      const verticalOverlap = !(box.y >= otherBox.y + otherBox.height || 
                               box.y + box.height <= otherBox.y);
      
      return horizontalOverlap && verticalOverlap;
    });
    
    if (collision) {
      console.log('Collision detected for box:', box, 'with existing boxes');
    }
    
    return collision;
  }, [boxes]);

  // 鼠标事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x: gridX, y: gridY } = pixelToGrid(e.clientX, e.clientY);
    
    console.log('Mouse down at grid:', gridX, gridY);
    
    // 检查是否点击了现有方框
    const clickedBox = boxes.find(box => 
      gridX >= box.x && gridX < box.x + box.width &&
      gridY >= box.y && gridY < box.y + box.height
    );

    if (clickedBox) {
      console.log('Clicked on box:', clickedBox.id);
      // 开始拖拽现有方框
      setDragState({
        isDragging: true,
        isCreating: false,
        draggedBox: clickedBox,
        startX: e.clientX,
        startY: e.clientY,
        initialBoxX: clickedBox.x,
        initialBoxY: clickedBox.y,
      });
    } else {
      console.log('Creating new box');
      // 开始创建新方框
      setDragState({
        isDragging: false,
        isCreating: true,
        draggedBox: null,
        startX: e.clientX,
        startY: e.clientY,
        initialBoxX: gridX,
        initialBoxY: gridY,
      });
      
      setPreviewBox({
        id: 'preview',
        x: gridX,
        y: gridY,
        width: 1,
        height: 1,
      });
    }
  }, [boxes, pixelToGrid]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x: gridX, y: gridY } = pixelToGrid(e.clientX, e.clientY);

    if (dragState.isCreating) {
      // 更新预览方框
      const startX = Math.min(dragState.initialBoxX, gridX);
      const startY = Math.min(dragState.initialBoxY, gridY);
      const width = Math.abs(gridX - dragState.initialBoxX) + 1;
      const height = Math.abs(gridY - dragState.initialBoxY) + 1;

      // 确保预览方框在边界内
      const clampedStartX = Math.max(0, Math.min(startX, gridConfig.columns - width));
      const clampedStartY = Math.max(0, Math.min(startY, gridConfig.rows - height));
      const clampedWidth = Math.min(width, gridConfig.columns - clampedStartX);
      const clampedHeight = Math.min(height, gridConfig.rows - clampedStartY);

      setPreviewBox({
        id: 'preview',
        x: clampedStartX,
        y: clampedStartY,
        width: clampedWidth,
        height: clampedHeight,
      });
    } else if (dragState.isDragging && dragState.draggedBox) {
      // 处理拖拽移动 - 修复坐标计算
      const deltaX = Math.round((e.clientX - dragState.startX) / gridConfig.gridSize);
      const deltaY = Math.round((e.clientY - dragState.startY) / gridConfig.gridSize);
      
      const targetX = dragState.initialBoxX + deltaX;
      const targetY = dragState.initialBoxY + deltaY;

      console.log('Dragging box:', dragState.draggedBox.id, 'to:', targetX, targetY);

      const result = calculatePushMovement(dragState.draggedBox, targetX, targetY);
      
      if (result.success && result.plan) {
        // 应用移动计划
        setBoxes(prevBoxes => 
          prevBoxes.map(box => {
            const newPos = result.plan[box.id];
            return newPos ? { ...box, x: newPos.x, y: newPos.y } : box;
          })
        );
      } else {
        console.log('Push movement failed:', result.reason);
      }
    }
  }, [dragState, pixelToGrid, gridConfig, calculatePushMovement]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    console.log('Mouse up');
    
    if (dragState.isCreating && previewBox) {
      // 创建新方框
      if (!hasCollision(previewBox)) {
        const newBox: Box = {
          id: `box-${Date.now()}`,
          x: previewBox.x,
          y: previewBox.y,
          width: previewBox.width,
          height: previewBox.height,
        };
        console.log('Creating new box:', newBox);
        setBoxes(prev => [...prev, newBox]);
      } else {
        console.log('Collision detected, not creating box');
      }
    }

    // 重置状态
    setDragState({
      isDragging: false,
      isCreating: false,
      draggedBox: null,
      startX: 0,
      startY: 0,
      initialBoxX: 0,
      initialBoxY: 0,
    });
    setPreviewBox(null);
  }, [dragState.isCreating, previewBox, hasCollision]);

  // 添加全局鼠标事件监听
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.isDragging || dragState.isCreating) {
        console.log('Global mouse up');
        setDragState({
          isDragging: false,
          isCreating: false,
          draggedBox: null,
          startX: 0,
          startY: 0,
          initialBoxX: 0,
          initialBoxY: 0,
        });
        setPreviewBox(null);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragState.isDragging || dragState.isCreating) {
        const { x: gridX, y: gridY } = pixelToGrid(e.clientX, e.clientY);

        if (dragState.isCreating) {
          const startX = Math.min(dragState.initialBoxX, gridX);
          const startY = Math.min(dragState.initialBoxY, gridY);
          const width = Math.abs(gridX - dragState.initialBoxX) + 1;
          const height = Math.abs(gridY - dragState.initialBoxY) + 1;

          setPreviewBox({
            id: 'preview',
            x: startX,
            y: startY,
            width,
            height,
          });
        } else if (dragState.isDragging && dragState.draggedBox) {
          const deltaX = Math.round((e.clientX - dragState.startX) / gridConfig.gridSize);
          const deltaY = Math.round((e.clientY - dragState.startY) / gridConfig.gridSize);
          
          const targetX = dragState.initialBoxX + deltaX;
          const targetY = dragState.initialBoxY + deltaY;

          const result = calculatePushMovement(dragState.draggedBox, targetX, targetY);
          
          if (result.success && result.plan) {
            setBoxes(prevBoxes => 
              prevBoxes.map(box => {
                const newPos = result.plan[box.id];
                return newPos ? { ...box, x: newPos.x, y: newPos.y } : box;
              })
            );
          }
        }
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [dragState, pixelToGrid, gridConfig.gridSize, calculatePushMovement]);

  // 渲染方框
  const renderBox = (box: Box, isPreview = false) => {
    const { x: pixelX, y: pixelY } = gridToPixel(box.x, box.y);
    
    return (
      <div
        key={box.id}
        className={`box ${isPreview ? 'preview' : ''}`}
        style={{
          position: 'absolute',
          left: pixelX,
          top: pixelY,
          width: box.width * gridConfig.gridSize - 2,
          height: box.height * gridConfig.gridSize - 2,
          backgroundColor: isPreview ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 123, 255, 0.8)',
          border: isPreview ? '2px dashed red' : '2px solid #0056b3',
          borderRadius: '4px',
          cursor: isPreview ? 'crosshair' : 'move',
          zIndex: isPreview ? 1000 : 100,
        }}
      />
    );
  };

  return (
    <main className="container">
      <div
        ref={gridRef}
        className="grid-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          position: 'relative',
          width: gridConfig.columns * gridConfig.gridSize,
          height: gridConfig.rows * gridConfig.gridSize,
          border: '1px solid #ccc',
          backgroundColor: '#f8f9fa',
        }}
      >
        {/* 渲染所有方框 */}
        {boxes.map(box => renderBox(box))}
        
        {/* 渲染预览方框 */}
        {previewBox && renderBox(previewBox, true)}
      </div>

      {/* 调试信息面板 */}
      <details style={{ marginTop: '2rem', textAlign: 'left' }}>
        <summary>Debug Information</summary>
        <pre style={{ 
          background: 'rgba(0,0,0,0.1)', 
          padding: '1rem', 
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {debugInfo}
        </pre>
      </details>
    </main>
  );
}

export default App;