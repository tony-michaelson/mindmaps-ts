import _ from "lodash";
import Konva from "konva";

interface ConnectionParams {
  parentX: number;
  parentY: number;
  childX: number;
  childY: number;
  parentWidth: number;
  parentHeight: number;
  childWidth: number;
  childHeight: number;
}

interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
}

interface CachedConnection {
  shape: Konva.Shape;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class ConnectionCache {
  // Memoized connection calculation - cache key is based on all position parameters
  private calculateConnection = _.memoize(
    (params: ConnectionParams): Konva.Shape => {
      return this.createConnectionShape(params);
    },
    (params: ConnectionParams): string => {
      // Create cache key from all parameters
      return [
        params.parentX, params.parentY, params.parentWidth, params.parentHeight,
        params.childX, params.childY, params.childWidth, params.childHeight
      ].join(',');
    }
  );

  // Cache for connection visibility checks
  private visibilityCache = new Map<string, boolean>();
  private lastViewport: ViewportBounds | null = null;

  // Create the actual Konva shape for a connection
  private createConnectionShape(params: ConnectionParams): Konva.Shape {
    const { parentX, parentY, childX, childY, parentWidth, parentHeight, childWidth, childHeight } = params;

    // Calculate center positions for both nodes
    const parentCenterX = parentX + parentWidth / 2;
    const parentCenterY = parentY + parentHeight / 2;
    const childCenterX = childX + childWidth / 2;
    const childCenterY = childY + childHeight / 2;

    return new Konva.Shape({
      sceneFunc: (context, shape) => {
        context.beginPath();
        context.moveTo(parentCenterX, parentCenterY);
        
        // Calculate control point for smooth curve
        const controlX = parentCenterX;
        const controlY = childCenterY - (parentCenterY - childCenterY) * 0.5;
        
        // Draw quadratic Bézier curve
        context.quadraticCurveTo(controlX, controlY, childCenterX, childCenterY);
        
        context.fillStrokeShape(shape);
      },
      stroke: "#838383ff",
      strokeWidth: 1,
      listening: false,
    });
  }

  // Get or create cached connection
  getCachedConnection(
    parentX: number, parentY: number, parentWidth: number, parentHeight: number,
    childX: number, childY: number, childWidth: number, childHeight: number
  ): Konva.Shape {
    const params: ConnectionParams = {
      parentX, parentY, parentWidth, parentHeight,
      childX, childY, childWidth, childHeight
    };

    return this.calculateConnection(params);
  }

  // Check if connection is visible in viewport (with memoization)
  isConnectionVisible(
    connectionId: string,
    parentX: number, parentY: number,
    childX: number, childY: number,
    viewport: ViewportBounds
  ): boolean {
    // Clear cache if viewport changed
    if (this.lastViewport === null || !_.isEqual(viewport, this.lastViewport)) {
      this.visibilityCache.clear();
      this.lastViewport = { ...viewport };
    }

    // Check cache first
    const cacheKey = `${connectionId}_${viewport.x}_${viewport.y}_${viewport.width}_${viewport.height}`;
    if (this.visibilityCache.has(cacheKey)) {
      return this.visibilityCache.get(cacheKey)!;
    }

    // Calculate connection bounds (already centered coordinates)
    const minX = Math.min(parentX, childX) - viewport.margin;
    const maxX = Math.max(parentX, childX) + viewport.margin;
    const minY = Math.min(parentY, childY) - viewport.margin;
    const maxY = Math.max(parentY, childY) + viewport.margin;

    // Check if connection intersects viewport
    const visible = !(
      maxX < viewport.x ||
      minX > viewport.x + viewport.width ||
      maxY < viewport.y ||
      minY > viewport.y + viewport.height
    );

    // Cache result
    this.visibilityCache.set(cacheKey, visible);
    return visible;
  }

  // Clear caches when needed (e.g., major layout changes)
  clearCache(): void {
    // Clear memoize cache
    this.calculateConnection.cache.clear!();
    this.visibilityCache.clear();
    this.lastViewport = null;
  }

  // Get cache statistics for debugging
  getCacheStats(): { 
    connectionCacheSize: number;
    visibilityCacheSize: number;
  } {
    return {
      connectionCacheSize: this.calculateConnection.cache.size || 0,
      visibilityCacheSize: this.visibilityCache.size
    };
  }
}