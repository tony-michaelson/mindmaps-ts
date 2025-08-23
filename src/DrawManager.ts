import Konva from "konva";

export interface DrawRequest {
  id: string;
  priority: number;
  timestamp: number;
  layer?: Konva.Layer;
  region?: { x: number; y: number; width: number; height: number };
}

export class DrawManager {
  private pendingDraws: Set<DrawRequest> = new Set();
  private isDrawScheduled = false;
  private animationFrameId: number | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private lastDrawTime = 0;
  private drawCount = 0;
  private readonly minDrawInterval: number;
  private readonly debounceDelay: number;

  constructor(
    minDrawInterval: number = 16, // ~60fps
    debounceDelay: number = 5
  ) {
    this.minDrawInterval = minDrawInterval;
    this.debounceDelay = debounceDelay;
  }

  requestDraw(
    layer: Konva.Layer,
    id: string = 'default',
    priority: number = 1,
    region?: { x: number; y: number; width: number; height: number }
  ): void {
    const request: DrawRequest = {
      id,
      priority,
      timestamp: performance.now(),
      layer,
      region
    };

    this.pendingDraws.add(request);
    this.scheduleDrawIfNeeded();
  }

  requestDrawDeferred(
    layer: Konva.Layer,
    id: string = 'default',
    priority: number = 1,
    region?: { x: number; y: number; width: number; height: number }
  ): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(() => {
      this.requestDraw(layer, id, priority, region);
      this.debounceTimeout = null;
    }, this.debounceDelay);
  }

  scheduleDraw(layer: Konva.Layer): void {
    this.requestDraw(layer, 'scheduled', 2);
  }

  scheduleDrawNextFrame(layer: Konva.Layer): void {
    this.requestDraw(layer, 'next-frame', 0);
  }

  private scheduleDrawIfNeeded(): void {
    if (this.isDrawScheduled || this.pendingDraws.size === 0) {
      return;
    }

    const now = performance.now();
    const timeSinceLastDraw = now - this.lastDrawTime;

    if (timeSinceLastDraw < this.minDrawInterval) {
      const delay = this.minDrawInterval - timeSinceLastDraw;
      setTimeout(() => {
        this.scheduleAnimation();
      }, delay);
    } else {
      this.scheduleAnimation();
    }
  }

  private scheduleAnimation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.isDrawScheduled = true;
    this.animationFrameId = requestAnimationFrame(() => {
      this.executePendingDraws();
    });
  }

  private executePendingDraws(): void {
    if (this.pendingDraws.size === 0) {
      this.isDrawScheduled = false;
      this.animationFrameId = null;
      return;
    }

    const sortedRequests = Array.from(this.pendingDraws).sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Earlier timestamps first
    });

    const processedLayers = new Set<Konva.Layer>();
    const processedRegions = new Map<Konva.Layer, Set<string>>();

    for (const request of sortedRequests) {
      if (!request.layer) continue;

      if (request.region) {
        const layerRegions = processedRegions.get(request.layer) || new Set();
        const regionKey = `${request.region.x},${request.region.y},${request.region.width},${request.region.height}`;
        
        if (!layerRegions.has(regionKey)) {
          layerRegions.add(regionKey);
          processedRegions.set(request.layer, layerRegions);
          
          this.drawRegion(request.layer, request.region);
        }
      } else if (!processedLayers.has(request.layer)) {
        processedLayers.add(request.layer);
        this.drawLayer(request.layer);
      }
    }

    this.pendingDraws.clear();
    this.lastDrawTime = performance.now();
    this.drawCount++;
    this.isDrawScheduled = false;
    this.animationFrameId = null;
  }

  private drawLayer(layer: Konva.Layer): void {
    try {
      layer.draw();
    } catch (error) {
      console.warn('Error drawing layer:', error);
    }
  }

  private drawRegion(layer: Konva.Layer, region: { x: number; y: number; width: number; height: number }): void {
    try {
      const context = layer.getContext();
      const canvas = context.canvas;
      
      context.save();
      context.clearRect(region.x, region.y, region.width, region.height);
      
      layer.getChildren().forEach(node => {
        if (this.nodeIntersectsRegion(node, region)) {
          node.draw();
        }
      });
      
      context.restore();
    } catch (error) {
      console.warn('Error drawing region:', error);
      this.drawLayer(layer);
    }
  }

  private nodeIntersectsRegion(
    node: Konva.Node, 
    region: { x: number; y: number; width: number; height: number }
  ): boolean {
    const nodeRect = node.getClientRect();
    return !(
      nodeRect.x + nodeRect.width < region.x ||
      nodeRect.x > region.x + region.width ||
      nodeRect.y + nodeRect.height < region.y ||
      nodeRect.y > region.y + region.height
    );
  }

  cancelPendingDraws(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }

    this.pendingDraws.clear();
    this.isDrawScheduled = false;
  }

  hasPendingDraws(): boolean {
    return this.pendingDraws.size > 0;
  }

  getPendingDrawCount(): number {
    return this.pendingDraws.size;
  }

  getDrawStats() {
    return {
      totalDraws: this.drawCount,
      pendingDraws: this.pendingDraws.size,
      isScheduled: this.isDrawScheduled,
      lastDrawTime: this.lastDrawTime,
      minInterval: this.minDrawInterval
    };
  }

  setMinDrawInterval(interval: number): void {
    (this as any).minDrawInterval = interval;
  }

  immediate(layer: Konva.Layer): void {
    layer.draw();
    this.drawCount++;
    this.lastDrawTime = performance.now();
  }

  batchDraw(layers: Konva.Layer[], callback?: () => void): void {
    if (layers.length === 0) {
      if (callback) callback();
      return;
    }

    let completedCount = 0;
    
    const onDrawComplete = () => {
      completedCount++;
      if (completedCount === layers.length && callback) {
        callback();
      }
    };

    layers.forEach(layer => {
      this.requestDraw(layer, `batch-${performance.now()}`, 3);
    });

    if (callback) {
      setTimeout(callback, this.minDrawInterval * 2);
    }
  }

  withBatch<T>(layer: Konva.Layer, operations: () => T): T {
    const result = operations();
    this.requestDrawDeferred(layer, 'batch-operation', 2);
    return result;
  }

  reset(): void {
    this.cancelPendingDraws();
    this.drawCount = 0;
    this.lastDrawTime = 0;
  }
}