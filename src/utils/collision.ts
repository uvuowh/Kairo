import { Box } from '../types';

type BoxLike = {
    x: number;
    y: number;
    width: number;
    height: number;
}

// AABB (Axis-Aligned Bounding Box) collision detection
export const doBoxesIntersect = (boxA: BoxLike, boxB: BoxLike): boolean => {
    // Check if one box is to the left of the other
    if (boxA.x + boxA.width <= boxB.x || boxB.x + boxB.width <= boxA.x) {
        return false;
    }
    // Check if one box is above the other
    if (boxA.y + boxA.height <= boxB.y || boxB.y + boxB.height <= boxA.y) {
        return false;
    }
    return true;
};

export const isBoxCollidingWithAny = (
    targetBox: Box & { id: string },
    allBoxes: Box[]
): boolean => {
    for (const otherBox of allBoxes) {
        if (targetBox.id === otherBox.id) continue;
        if (doBoxesIntersect(targetBox, otherBox)) {
            return true;
        }
    }
    return false;
};

export const isPreviewCollidingWithAny = (
    targetBox: BoxLike,
    allBoxes: Box[]
): boolean => {
    for (const otherBox of allBoxes) {
        if (doBoxesIntersect(targetBox, otherBox)) {
            return true;
        }
    }
    return false;
} 