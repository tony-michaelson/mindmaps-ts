import { NodePosition } from "./NodePosition";

interface MemoizeCache<T> {
  [key: string]: T;
}

function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T & { cache: MemoizeCache<ReturnType<T>>; clear: () => void } {
  const cache: MemoizeCache<ReturnType<T>> = {};
  
  const memoizedFn = ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator 
      ? keyGenerator(...args)
      : Array.prototype.join.call(args, ',');
    
    if (key in cache) {
      return cache[key];
    }
    
    const result = fn(...args);
    cache[key] = result;
    return result;
  }) as T & { cache: MemoizeCache<ReturnType<T>>; clear: () => void };
  
  memoizedFn.cache = cache;
  memoizedFn.clear = () => {
    Object.keys(cache).forEach(key => delete cache[key]);
  };
  
  return memoizedFn;
}

export class PerformanceUtils {
  private static connectionPathCache = memoize(
    PerformanceUtils.calculateConnectionPathInner,
    (fromX, fromY, fromWidth, fromHeight, toX, toY, toWidth, toHeight) =>
      `${fromX},${fromY},${fromWidth},${fromHeight},${toX},${toY},${toWidth},${toHeight}`
  );

  private static nodeDimensionCache = memoize(
    PerformanceUtils.calculateNodeDimensionsInner,
    (text, nodeType, isRoot) => `${text}|${nodeType}|${isRoot}`
  );

  private static layoutCalculationCache = memoize(
    PerformanceUtils.calculateLayoutPositionInner,
    (nodeId, parentId, side, rootX, rootY, childCount, level) =>
      `${nodeId}|${parentId}|${side}|${rootX}|${rootY}|${childCount}|${level}`
  );

  static calculateConnectionPath(
    fromX: number, fromY: number, fromWidth: number, fromHeight: number,
    toX: number, toY: number, toWidth: number, toHeight: number
  ): { startX: number; startY: number; controlX: number; controlY: number; endX: number; endY: number } {
    return this.connectionPathCache(fromX, fromY, fromWidth, fromHeight, toX, toY, toWidth, toHeight);
  }

  private static calculateConnectionPathInner(
    fromX: number, fromY: number, fromWidth: number, fromHeight: number,
    toX: number, toY: number, toWidth: number, toHeight: number
  ): { startX: number; startY: number; controlX: number; controlY: number; endX: number; endY: number } {
    const startX = fromX;
    const startY = fromY;
    const endX = toX;
    const endY = toY;
    
    const controlX = fromX;
    const controlY = toY - (fromY - toY) * 0.5;
    
    return { startX, startY, controlX, controlY, endX, endY };
  }

  static calculateNodeDimensions(
    text: string,
    nodeType: string,
    isRoot: boolean
  ): { width: number; height: number } {
    return this.nodeDimensionCache(text, nodeType, isRoot);
  }

  private static calculateNodeDimensionsInner(
    text: string,
    nodeType: string,
    isRoot: boolean
  ): { width: number; height: number } {
    const baseWidth = 120;
    const baseHeight = 40;
    
    const textMultiplier = Math.max(1, text.length / 10);
    const typeMultiplier = nodeType === 'ROOT' ? 1.5 : 1;
    const rootMultiplier = isRoot ? 1.2 : 1;
    
    return {
      width: Math.ceil(baseWidth * textMultiplier * typeMultiplier * rootMultiplier),
      height: Math.ceil(baseHeight * rootMultiplier)
    };
  }

  static calculateLayoutPosition(
    nodeId: string,
    parentId: string | null,
    side: "left" | "right",
    rootX: number,
    rootY: number,
    childCount: number,
    level: number
  ): NodePosition {
    return this.layoutCalculationCache(nodeId, parentId || '', side, rootX, rootY, childCount, level);
  }

  private static calculateLayoutPositionInner(
    nodeId: string,
    parentId: string,
    side: "left" | "right",
    rootX: number,
    rootY: number,
    childCount: number,
    level: number
  ): NodePosition {
    return {
      x: rootX + (side === 'right' ? 1 : -1) * level * 150,
      y: rootY + (childCount - 1) * 60,
      level,
      stackIndex: childCount,
      side,
      parentId: parentId || undefined
    };
  }

  static clearAllCaches(): void {
    this.connectionPathCache.clear();
    this.nodeDimensionCache.clear();
    this.layoutCalculationCache.clear();
  }

  static clearConnectionCache(): void {
    this.connectionPathCache.clear();
  }

  static clearLayoutCache(): void {
    this.layoutCalculationCache.clear();
  }

  static getCacheStats() {
    return {
      connectionPaths: Object.keys(this.connectionPathCache.cache).length,
      nodeDimensions: Object.keys(this.nodeDimensionCache.cache).length,
      layoutCalculations: Object.keys(this.layoutCalculationCache.cache).length
    };
  }
}