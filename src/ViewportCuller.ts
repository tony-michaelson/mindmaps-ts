import Konva from "konva";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
}

export class ViewportCuller {
  private stage: Konva.Stage;
  private cullingMargin: number;

  constructor(stage: Konva.Stage, margin: number = 100) {
    this.stage = stage;
    this.cullingMargin = margin;
  }

  getViewportInfo(): ViewportInfo {
    const stagePos = this.stage.position();
    const stageSize = this.stage.size();
    const scale = this.stage.scaleX();

    return {
      x: -stagePos.x / scale,
      y: -stagePos.y / scale,
      width: stageSize.width / scale,
      height: stageSize.height / scale,
      margin: this.cullingMargin / scale
    };
  }

  isRectangleVisible(rect: Rectangle, viewport?: ViewportInfo): boolean {
    const vp = viewport || this.getViewportInfo();
    
    const expandedViewport = {
      left: vp.x - vp.margin,
      top: vp.y - vp.margin,
      right: vp.x + vp.width + vp.margin,
      bottom: vp.y + vp.height + vp.margin
    };

    const rectBounds = {
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height
    };

    return !(
      rectBounds.right < expandedViewport.left ||
      rectBounds.left > expandedViewport.right ||
      rectBounds.bottom < expandedViewport.top ||
      rectBounds.top > expandedViewport.bottom
    );
  }

  isNodeVisible(nodeX: number, nodeY: number, nodeWidth: number, nodeHeight: number, viewport?: ViewportInfo): boolean {
    return this.isRectangleVisible({
      x: nodeX - nodeWidth / 2,
      y: nodeY - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight
    }, viewport);
  }

  isConnectionVisible(
    fromX: number, fromY: number, fromWidth: number, fromHeight: number,
    toX: number, toY: number, toWidth: number, toHeight: number,
    viewport?: ViewportInfo
  ): boolean {
    const vp = viewport || this.getViewportInfo();

    const connectionBounds = {
      x: Math.min(fromX - fromWidth / 2, toX - toWidth / 2),
      y: Math.min(fromY - fromHeight / 2, toY - toHeight / 2),
      width: Math.abs(fromX - toX) + Math.max(fromWidth, toWidth),
      height: Math.abs(fromY - toY) + Math.max(fromHeight, toHeight)
    };

    return this.isRectangleVisible(connectionBounds, vp);
  }

  getVisibleNodes<T>(nodes: Map<string, T>, getNodeBounds: (node: T) => Rectangle): Map<string, T> {
    const viewport = this.getViewportInfo();
    const visibleNodes = new Map<string, T>();

    for (const [nodeId, node] of nodes) {
      const bounds = getNodeBounds(node);
      if (this.isRectangleVisible(bounds, viewport)) {
        visibleNodes.set(nodeId, node);
      }
    }

    return visibleNodes;
  }

  getVisibleConnections<T>(
    connections: Map<string, T>,
    getConnectionBounds: (connection: T, connectionId: string) => { fromRect: Rectangle; toRect: Rectangle } | null
  ): Map<string, T> {
    const viewport = this.getViewportInfo();
    const visibleConnections = new Map<string, T>();

    for (const [connectionId, connection] of connections) {
      const bounds = getConnectionBounds(connection, connectionId);
      if (!bounds) continue;

      if (this.isConnectionVisible(
        bounds.fromRect.x + bounds.fromRect.width / 2,
        bounds.fromRect.y + bounds.fromRect.height / 2,
        bounds.fromRect.width,
        bounds.fromRect.height,
        bounds.toRect.x + bounds.toRect.width / 2,
        bounds.toRect.y + bounds.toRect.height / 2,
        bounds.toRect.width,
        bounds.toRect.height,
        viewport
      )) {
        visibleConnections.set(connectionId, connection);
      }
    }

    return visibleConnections;
  }

  setCullingMargin(margin: number): void {
    this.cullingMargin = margin;
  }

  getCullingMargin(): number {
    return this.cullingMargin;
  }

  atLeastOneVisible<T>(
    items: T[],
    getBounds: (item: T) => Rectangle,
    deltaX: number = 0,
    deltaY: number = 0
  ): boolean {
    const viewport = this.getViewportInfo();
    
    const adjustedViewport = {
      ...viewport,
      x: viewport.x + deltaX,
      y: viewport.y + deltaY
    };

    return items.some(item => {
      const bounds = getBounds(item);
      return this.isRectangleVisible(bounds, adjustedViewport);
    });
  }

  shouldSkipUpdate(
    oldViewport: ViewportInfo,
    newViewport: ViewportInfo,
    threshold: number = 0.1
  ): boolean {
    const deltaX = Math.abs(newViewport.x - oldViewport.x);
    const deltaY = Math.abs(newViewport.y - oldViewport.y);
    const scaleChange = Math.abs(newViewport.width - oldViewport.width) / oldViewport.width;

    return deltaX < threshold && deltaY < threshold && scaleChange < threshold;
  }
}