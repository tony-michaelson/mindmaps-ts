import Konva from "konva";
import { Node } from "./Node";
import { HierarchicalPositioner } from "./HierarchicalPositioner";
import {
  NodePosition,
  NodeType,
  NODE_CONFIGS,
  LAYOUT_CONFIG,
} from "./NodePosition";
import { PerformanceUtils } from "./PerformanceUtils";
import { ViewportCuller, ViewportInfo } from "./ViewportCuller";
import { BatchManager, BatchOperation } from "./BatchManager";
import { IncrementalUpdater, NodeState, ConnectionState } from "./IncrementalUpdater";
import { DrawManager } from "./DrawManager";
import { ObjectPoolManager, PoolableConnection } from "./ObjectPool";

export class MindmapController {
  private positioner = new HierarchicalPositioner();
  private konvaNodes: Map<string, Node> = new Map();
  private connections: Map<string, Konva.Shape> = new Map();
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private nodeCounter = 0;
  private selectedNodeId: string | null = null;
  public onNodeSelected?: (nodeId: string | null) => void;
  
  // Performance optimization components
  private viewportCuller: ViewportCuller;
  private batchManager: BatchManager;
  private incrementalUpdater: IncrementalUpdater;
  private drawManager: DrawManager;
  private objectPool: ObjectPoolManager;
  private lastViewport: ViewportInfo | null = null;

  constructor(layer: Konva.Layer, rootX: number, rootY: number, stage?: Konva.Stage) {
    this.layer = layer;
    this.rootX = rootX;
    this.rootY = rootY;
    
    // Initialize performance components
    this.viewportCuller = new ViewportCuller(stage || layer.getStage(), 100);
    this.batchManager = new BatchManager(
      { maxBatchSize: 50, maxBatchTime: 16, autoCommit: true },
      this.handleBatchCommit.bind(this)
    );
    this.incrementalUpdater = new IncrementalUpdater();
    this.drawManager = new DrawManager(16, 5);
    this.objectPool = new ObjectPoolManager({ connections: 200, rects: 100, texts: 100 });
    
    // Pre-allocate some pooled objects
    this.objectPool.preAllocate({ connections: 20, rects: 10, texts: 10 });
  }

  createRootNode(text: string): string {
    const nodeId = this.generateNodeId();
    this.rootId = nodeId;

    const position = this.positioner.calculateNodePosition(
      nodeId,
      null,
      "right",
      this.rootX,
      this.rootY
    );

    this.createAndPositionNode(nodeId, position, text, NodeType.ROOT);
    return nodeId;
  }

  addNodeToRoot(text: string, type: NodeType, side: "left" | "right"): string {
    if (!this.rootId) {
      throw new Error("Root node must be created first");
    }

    const nodeId = this.generateNodeId();
    const position = this.positioner.calculateNodePosition(
      nodeId,
      this.rootId,
      side,
      this.rootX,
      this.rootY
    );

    this.createAndPositionNode(nodeId, position, text, type);
    this.updateChildrenMap(this.rootId, nodeId);
    this.repositionSiblings(this.rootId);
    this.updateConnections(this.rootId);

    return nodeId;
  }

  addNodeToExisting(parentId: string, text: string, type: NodeType): string {
    const parentSide = this.positioner.getNodeSide(parentId);
    if (!parentSide) {
      throw new Error("Parent node not found");
    }

    const nodeId = this.generateNodeId();
    const position = this.positioner.calculateNodePosition(
      nodeId,
      parentId,
      parentSide,
      this.rootX,
      this.rootY
    );

    this.createAndPositionNode(nodeId, position, text, type);
    this.updateChildrenMap(parentId, nodeId);
    this.repositionSiblings(parentId);
    this.updateConnections(parentId);

    return nodeId;
  }

  private createAndPositionNode(
    nodeId: string,
    position: NodePosition,
    text: string,
    type: NodeType
  ): void {
    const config = NODE_CONFIGS[type];
    const truncatedText = this.formatNodeText(text);

    const node = new Node({
      x: position.x - LAYOUT_CONFIG.width / 2,
      y: position.y - LAYOUT_CONFIG.height / 2,
      text: truncatedText,
      isRoot: type === NodeType.ROOT,
      layer: this.layer,
      customColor: config.color,
    });

    this.konvaNodes.set(nodeId, node);
    this.setupNodeInteractions(nodeId);
  }

  private updateChildrenMap(parentId: string, childId: string): void {
    this.positioner.addToChildrenMap(parentId, childId);
  }

  private repositionSiblings(parentId: string): void {
    const updatedPositions = this.positioner.repositionSiblings(
      parentId,
      this.rootX,
      this.rootY
    );

    updatedPositions.forEach((position) => {
      const nodeId = this.findNodeIdByPosition(position);
      if (nodeId) {
        const konvaNode = this.konvaNodes.get(nodeId);
        if (konvaNode) {
          this.animateToPosition(konvaNode, position);
        }
      }
    });
  }

  private animateToPosition(node: Node, targetPosition: NodePosition): void {
    const group = node.getGroup();
    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - LAYOUT_CONFIG.width / 2,
      y: targetPosition.y - LAYOUT_CONFIG.height / 2,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        // Update connections during animation (without drawing)
        this.updateAllConnectionsWithoutDraw();
      },
      onFinish: () => {
        // Ensure connections are properly updated at the end
        this.updateAllConnections();
      }
    });

    tween.play();
  }

  private updateConnections(parentId: string): void {
    const children = this.positioner.getChildren(parentId);
    const parentNode = this.konvaNodes.get(parentId);

    if (!parentNode) return;

    children.forEach((childId) => {
      const childNode = this.konvaNodes.get(childId);
      if (!childNode) return;

      const connectionId = `${parentId}-${childId}`;

      // Remove old connection
      const oldConnection = this.connections.get(connectionId);
      if (oldConnection) {
        oldConnection.destroy();
      }

      // Get current visual positions from Konva groups (not target positions)
      const parentGroup = parentNode.getGroup();
      const childGroup = childNode.getGroup();
      
      const parentRect = parentGroup.children![0] as Konva.Rect;
      const childRect = childGroup.children![0] as Konva.Rect;
      
      const parentPos = {
        x: parentGroup.x() + parentRect.width() / 2,
        y: parentGroup.y() + parentRect.height() / 2,
        level: 0,
        stackIndex: 0,
        side: "right" as const
      };
      
      const childPos = {
        x: childGroup.x() + childRect.width() / 2,
        y: childGroup.y() + childRect.height() / 2,
        level: 0,
        stackIndex: 0,
        side: "right" as const
      };

      // Create new connection with current visual positions
      const newConnection = this.createConnectionLine(
        parentPos,
        childPos,
        parentId,
        childId
      );
      this.connections.set(connectionId, newConnection);
      this.layer.add(newConnection);
      newConnection.moveToBottom();
    });

    this.layer.draw();
  }

  private updateAllConnections(): void {
    this.updateAllConnectionsWithoutDraw();
    this.layer.draw();
  }

  private updateAllConnectionsWithoutDraw(): void {
    // Update all connections by redrawing them based on current visual node positions
    this.connections.forEach((connection, connectionId) => {
      const [parentId, childId] = connectionId.split('-');
      const parentNode = this.konvaNodes.get(parentId);
      const childNode = this.konvaNodes.get(childId);
      
      if (parentNode && childNode) {
        // Get current visual positions from Konva groups
        const parentGroup = parentNode.getGroup();
        const childGroup = childNode.getGroup();
        
        // Get actual rectangle dimensions from within the groups
        const parentRect = parentGroup.children![0] as Konva.Rect; // First child is the rectangle
        const childRect = childGroup.children![0] as Konva.Rect;
        
        // Convert visual positions back to logical center positions
        const parentPos = {
          x: parentGroup.x() + parentRect.width() / 2,
          y: parentGroup.y() + parentRect.height() / 2,
          level: 0, // These fields aren't used for connection drawing
          stackIndex: 0,
          side: "right" as const
        };
        
        const childPos = {
          x: childGroup.x() + childRect.width() / 2,
          y: childGroup.y() + childRect.height() / 2,
          level: 0,
          stackIndex: 0,
          side: "right" as const
        };
        
        // Remove old connection
        connection.destroy();
        
        // Create new connection with current visual positions
        const newConnection = this.createConnectionLine(parentPos, childPos, parentId, childId);
        this.connections.set(connectionId, newConnection);
        this.layer.add(newConnection);
        newConnection.moveToBottom();
      }
    });
  }

  private createConnectionLine(
    parentPos: NodePosition,
    childPos: NodePosition,
    parentId: string,
    childId: string
  ): Konva.Shape {
    const parentNode = this.konvaNodes.get(parentId);
    const childNode = this.konvaNodes.get(childId);

    if (!parentNode || !childNode) {
      // Fallback to simple straight line
      return new Konva.Line({
        points: [parentPos.x, parentPos.y, childPos.x, childPos.y],
        stroke: "#838383ff",
        strokeWidth: 1,
        listening: false,
      });
    }

    // Get node dimensions for memoization
    const parentGroup = parentNode.getGroup();
    const childGroup = childNode.getGroup();
    const parentRect = parentGroup.children![0] as Konva.Rect;
    const childRect = childGroup.children![0] as Konva.Rect;

    // Use memoized connection path calculation
    const pathData = PerformanceUtils.calculateConnectionPath(
      parentPos.x, parentPos.y, parentRect.width(), parentRect.height(),
      childPos.x, childPos.y, childRect.width(), childRect.height()
    );

    // Create curved line using cached path data
    return new Konva.Shape({
      sceneFunc: (context, shape) => {
        context.beginPath();
        context.moveTo(pathData.startX, pathData.startY);
        context.quadraticCurveTo(pathData.controlX, pathData.controlY, pathData.endX, pathData.endY);
        context.fillStrokeShape(shape);
      },
      stroke: "#838383ff",
      strokeWidth: 1,
      listening: false,
    });
  }


  private setupNodeInteractions(nodeId: string): void {
    const node = this.konvaNodes.get(nodeId);
    if (!node) return;

    const group = node.getGroup();

    // Add click handler for node selection
    group.on("click", (e) => {
      e.cancelBubble = true;
      this.selectNode(nodeId);
    });

    // Add drag handlers for repositioning
    group.on("dragmove", () => {
      // Update connections while dragging
      this.updateAllConnections();
    });
    
    group.on("dragend", () => {
      // For now, snap back to original position
      // Later we can implement drag-to-reparent logic
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        this.animateToPosition(node, position);
      }
    });
  }

  private selectNode(nodeId: string): void {
    // Clear all selections first (without redrawing)
    this.konvaNodes.forEach((node) => {
      node.setSelected(false);
    });

    // Select the clicked node (without redrawing)
    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.setSelected(true);
      this.selectedNodeId = nodeId;
    }

    // Notify callback of selection change
    if (this.onNodeSelected) {
      this.onNodeSelected(nodeId);
    }

    // Single redraw for all changes
    this.layer.draw();
  }

  private formatNodeText(text: string): string {
    return text.length > LAYOUT_CONFIG.maxTextLength
      ? text.substring(0, LAYOUT_CONFIG.maxTextLength - 3) + "..."
      : text;
  }

  private generateNodeId(): string {
    return `node_${++this.nodeCounter}`;
  }

  private findNodeIdByPosition(position: NodePosition): string | null {
    for (const [nodeId, nodePos] of this.positioner["nodePositions"]) {
      if (nodePos === position) {
        return nodeId;
      }
    }
    return null;
  }

  public getNodeCount(): number {
    return this.konvaNodes.size;
  }

  public getRootId(): string | null {
    return this.rootId;
  }

  public getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }

  public removeNode(nodeId: string): void {
    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.remove();
      this.konvaNodes.delete(nodeId);
    }

    // Remove connections
    const children = this.positioner.getChildren(nodeId);
    children.forEach((childId) => {
      const connectionId = `${nodeId}-${childId}`;
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.destroy();
        this.connections.delete(connectionId);
      }
    });

    // Remove from positioner
    this.positioner.removeNode(nodeId);
    this.layer.draw();
  }
  
  // Add performance optimization methods
  private handleBatchCommit(operations: BatchOperation[], batchId: string): void {
    // Process batched operations for optimal performance
    let needsLayoutRecalculation = false;
    let needsConnectionUpdate = false;
    
    for (const op of operations) {
      switch (op.type) {
        case 'ADD_NODE':
        case 'REMOVE_NODE':
          needsLayoutRecalculation = true;
          needsConnectionUpdate = true;
          break;
        case 'MOVE_NODE':
          needsConnectionUpdate = true;
          break;
        case 'LAYOUT_CHANGE':
          needsLayoutRecalculation = true;
          needsConnectionUpdate = true;
          break;
        case 'UPDATE_CONNECTION':
          needsConnectionUpdate = true;
          break;
      }
    }
    
    // Execute updates in optimal order
    if (needsLayoutRecalculation) {
      // Clear layout cache when structure changes
      PerformanceUtils.clearLayoutCache();
    }
    
    if (needsConnectionUpdate) {
      // Clear connection cache when positions change
      PerformanceUtils.clearConnectionCache();
      // Defer connection updates to next frame for better performance
      this.drawManager.scheduleDrawNextFrame(this.layer);
    }
  }
  
  public getPerformanceStats() {
    return {
      cache: PerformanceUtils.getCacheStats(),
      viewport: this.viewportCuller.getCullingMargin(),
      batch: this.batchManager.getStats(),
      draw: this.drawManager.getDrawStats(),
      pool: this.objectPool.getStats(),
      nodes: this.konvaNodes.size,
      connections: this.connections.size
    };
  }
  
  public optimizeForLargeDataset(): void {
    // Increase culling margin for better performance with large datasets
    this.viewportCuller.setCullingMargin(200);
    
    // Reduce draw frequency for large datasets
    this.drawManager.setMinDrawInterval(33); // ~30fps
    
    // Pre-allocate more pooled objects
    this.objectPool.preAllocate({ connections: 100, rects: 50, texts: 50 });
  }
  
  public clearPerformanceCaches(): void {
    PerformanceUtils.clearAllCaches();
    this.incrementalUpdater.reset();
  }
}

// Export performance utilities for external access
export { PerformanceUtils, ViewportCuller, BatchManager, DrawManager, ObjectPoolManager };
