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

    // Start a batch operation for the complete add node sequence
    const batchId = this.batchManager.startBatch();
    
    try {
      const nodeId = this.generateNodeId();
      
      // Add batch operation for node creation
      this.batchManager.addOperation({
        type: 'ADD_NODE',
        nodeId,
        data: { text, type, side, parentId: this.rootId }
      });
      
      // Get parent (root) position to start new node there
      const rootNode = this.konvaNodes.get(this.rootId);
      const rootPosition = rootNode ? {
        x: rootNode.getGroup().x() + LAYOUT_CONFIG.width / 2,
        y: rootNode.getGroup().y() + LAYOUT_CONFIG.height / 2
      } : { x: this.rootX, y: this.rootY };

      // Create node at parent's position initially
      const startPosition = this.positioner.calculateNodePosition(
        nodeId,
        this.rootId,
        side,
        rootPosition.x, // Start at parent's current position
        rootPosition.y
      );

      this.createAndPositionNodeAtParent(nodeId, startPosition, text, type, this.rootId);
      this.updateChildrenMap(this.rootId, nodeId);
      
      // Add batch operation for layout change
      this.batchManager.addOperation({
        type: 'LAYOUT_CHANGE',
        data: { parentId: this.rootId, operation: 'reposition_siblings' }
      });
      
      this.repositionSiblingsWithoutDraw(this.rootId);
      
      // Add batch operation for connection update
      this.batchManager.addOperation({
        type: 'UPDATE_CONNECTION',
        data: { parentId: this.rootId }
      });
      
      this.updateConnectionsWithoutDraw(this.rootId);

      // End the batch - this will trigger the handleBatchCommit
      this.batchManager.endBatch();
      
      return nodeId;
    } catch (error) {
      // If error occurs, clear the batch without committing
      this.batchManager.clearAllBatches();
      throw error;
    }
  }

  addNodeToExisting(parentId: string, text: string, type: NodeType): string {
    const parentSide = this.positioner.getNodeSide(parentId);
    if (!parentSide) {
      throw new Error("Parent node not found");
    }

    // Start a batch operation for the complete add node sequence
    const batchId = this.batchManager.startBatch();
    
    try {
      const nodeId = this.generateNodeId();
      
      // Add batch operation for node creation
      this.batchManager.addOperation({
        type: 'ADD_NODE',
        nodeId,
        data: { text, type, parentId }
      });
      
      // Get parent position to start new node there
      const parentNode = this.konvaNodes.get(parentId);
      const parentPosition = parentNode ? {
        x: parentNode.getGroup().x() + LAYOUT_CONFIG.width / 2,
        y: parentNode.getGroup().y() + LAYOUT_CONFIG.height / 2
      } : { x: this.rootX, y: this.rootY };

      // Create node at parent's position initially
      const startPosition = this.positioner.calculateNodePosition(
        nodeId,
        parentId,
        parentSide,
        parentPosition.x, // Start at parent's current position
        parentPosition.y
      );

      this.createAndPositionNodeAtParent(nodeId, startPosition, text, type, parentId);
      this.updateChildrenMap(parentId, nodeId);
      
      // Add batch operation for layout change
      this.batchManager.addOperation({
        type: 'LAYOUT_CHANGE',
        data: { parentId, operation: 'reposition_siblings' }
      });
      
      this.repositionSiblingsWithoutDraw(parentId);
      
      // Add batch operation for connection update
      this.batchManager.addOperation({
        type: 'UPDATE_CONNECTION',
        data: { parentId }
      });
      
      this.updateConnectionsWithoutDraw(parentId);

      // End the batch - this will trigger the handleBatchCommit
      this.batchManager.endBatch();

      return nodeId;
    } catch (error) {
      // If error occurs, clear the batch without committing
      this.batchManager.clearAllBatches();
      throw error;
    }
  }

  private createAndPositionNode(
    nodeId: string,
    position: NodePosition,
    text: string,
    type: NodeType
  ): void {
    const config = NODE_CONFIGS[type];
    const truncatedText = this.formatNodeText(text);

    // Check if node will be visible before creating
    const viewport = this.viewportCuller.getViewportInfo();
    const isVisible = this.viewportCuller.isNodeVisible(
      position.x, position.y,
      LAYOUT_CONFIG.width, LAYOUT_CONFIG.height,
      viewport
    );

    const node = new Node({
      x: position.x - LAYOUT_CONFIG.width / 2,
      y: position.y - LAYOUT_CONFIG.height / 2,
      text: truncatedText,
      isRoot: type === NodeType.ROOT,
      layer: this.layer,
      customColor: config.color,
    });

    // If node is not visible, make it temporarily transparent
    if (!isVisible && type !== NodeType.ROOT) {
      const group = node.getGroup();
      group.opacity(0.1); // Minimal opacity for off-screen nodes
    }

    this.konvaNodes.set(nodeId, node);
    this.setupNodeInteractions(nodeId);
  }

  private createAndPositionNodeAtParent(
    nodeId: string,
    position: NodePosition,
    text: string,
    type: NodeType,
    parentId: string
  ): void {
    const config = NODE_CONFIGS[type];
    const truncatedText = this.formatNodeText(text);

    // Get parent's current visual position
    const parentNode = this.konvaNodes.get(parentId);
    const parentGroup = parentNode?.getGroup();
    const parentX = parentGroup ? parentGroup.x() : position.x - LAYOUT_CONFIG.width / 2;
    const parentY = parentGroup ? parentGroup.y() : position.y - LAYOUT_CONFIG.height / 2;

    // Create node at parent's position (will animate to target during repositionSiblings)
    const node = new Node({
      x: parentX, // Start at parent's visual position
      y: parentY, // Start at parent's visual position
      text: truncatedText,
      isRoot: type === NodeType.ROOT,
      layer: this.layer,
      customColor: config.color,
    });

    // Check if target position will be visible - for new nodes, start with full opacity
    // since they will animate and should be visible during the animation
    const viewport = this.viewportCuller.getViewportInfo();
    const targetIsVisible = this.viewportCuller.isNodeVisible(
      position.x, position.y,
      LAYOUT_CONFIG.width, LAYOUT_CONFIG.height,
      viewport
    );

    // For new nodes that will animate, start with full opacity
    // The animation onFinish callback will handle final opacity
    if (!targetIsVisible && type !== NodeType.ROOT) {
      // Only set low opacity if target position is far off-screen
      const group = node.getGroup();
      const distance = Math.sqrt(
        Math.pow(position.x - (viewport.x + viewport.width / 2), 2) +
        Math.pow(position.y - (viewport.y + viewport.height / 2), 2)
      );
      
      // Only reduce opacity if very far from viewport
      if (distance > viewport.width + viewport.height) {
        group.opacity(0.1);
      }
    }

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

    // Get current viewport for culling
    const viewport = this.viewportCuller.getViewportInfo();

    updatedPositions.forEach((position) => {
      const nodeId = this.findNodeIdByPosition(position);
      if (nodeId) {
        const konvaNode = this.konvaNodes.get(nodeId);
        if (konvaNode) {
          // Check if node will be visible at target position
          if (this.viewportCuller.isNodeVisible(
            position.x, position.y, 
            LAYOUT_CONFIG.width, LAYOUT_CONFIG.height, 
            viewport
          )) {
            this.animateToPosition(konvaNode, position);
          } else {
            // For off-screen nodes, just set position without animation
            this.setPositionWithoutAnimation(konvaNode, position);
          }
        }
      }
    });
  }

  private repositionSiblingsWithoutDraw(parentId: string): void {
    const updatedPositions = this.positioner.repositionSiblings(
      parentId,
      this.rootX,
      this.rootY
    );

    // Get current viewport for culling
    const viewport = this.viewportCuller.getViewportInfo();

    updatedPositions.forEach((position) => {
      const nodeId = this.findNodeIdByPosition(position);
      if (nodeId) {
        const konvaNode = this.konvaNodes.get(nodeId);
        if (konvaNode) {
          // Check if node will be visible at target position
          if (this.viewportCuller.isNodeVisible(
            position.x, position.y, 
            LAYOUT_CONFIG.width, LAYOUT_CONFIG.height, 
            viewport
          )) {
            this.animateToPosition(konvaNode, position);
          } else {
            // For off-screen nodes, just set position without animation
            this.setPositionWithoutAnimation(konvaNode, position);
          }
        }
      }
    });
  }

  private updateConnectionsWithoutDraw(parentId: string): void {
    const children = this.positioner.getChildren(parentId);
    const parentNode = this.konvaNodes.get(parentId);

    if (!parentNode) return;

    // Get current viewport for culling
    const viewport = this.viewportCuller.getViewportInfo();

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

      // Skip connection if not visible in viewport
      if (!this.viewportCuller.isConnectionVisible(
        parentPos.x, parentPos.y, parentRect.width(), parentRect.height(),
        childPos.x, childPos.y, childRect.width(), childRect.height(),
        viewport
      )) {
        return; // Skip creating off-screen connections
      }

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
        // Restore full opacity after animation completes
        group.opacity(1.0);
        
        // Ensure connections are properly updated at the end
        this.updateAllConnections();
      }
    });

    tween.play();
  }

  private setPositionWithoutAnimation(node: Node, targetPosition: NodePosition): void {
    const group = node.getGroup();
    group.x(targetPosition.x - LAYOUT_CONFIG.width / 2);
    group.y(targetPosition.y - LAYOUT_CONFIG.height / 2);
    
    // Restore opacity for off-screen nodes that are positioned
    group.opacity(1.0);
  }

  private updateConnections(parentId: string): void {
    const children = this.positioner.getChildren(parentId);
    const parentNode = this.konvaNodes.get(parentId);

    if (!parentNode) return;

    // Get current viewport for culling
    const viewport = this.viewportCuller.getViewportInfo();

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

      // Skip connection if not visible in viewport
      if (!this.viewportCuller.isConnectionVisible(
        parentPos.x, parentPos.y, parentRect.width(), parentRect.height(),
        childPos.x, childPos.y, childRect.width(), childRect.height(),
        viewport
      )) {
        return; // Skip creating off-screen connections
      }

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
    // Get current viewport for culling
    const viewport = this.viewportCuller.getViewportInfo();

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
        
        // Skip connection if not visible in viewport
        if (!this.viewportCuller.isConnectionVisible(
          parentPos.x, parentPos.y, parentRect.width(), parentRect.height(),
          childPos.x, childPos.y, childRect.width(), childRect.height(),
          viewport
        )) {
          this.connections.delete(connectionId); // Remove from map since it's not visible
          return; // Skip creating off-screen connections
        }
        
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
    let needsSingleDraw = false;
    
    for (const op of operations) {
      switch (op.type) {
        case 'ADD_NODE':
        case 'REMOVE_NODE':
          needsLayoutRecalculation = true;
          needsConnectionUpdate = true;
          needsSingleDraw = true;
          break;
        case 'MOVE_NODE':
          needsConnectionUpdate = true;
          needsSingleDraw = true;
          break;
        case 'LAYOUT_CHANGE':
          needsLayoutRecalculation = true;
          needsConnectionUpdate = true;
          needsSingleDraw = true;
          break;
        case 'UPDATE_CONNECTION':
          needsConnectionUpdate = true;
          needsSingleDraw = true;
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
    }
    
    // Single draw call for the entire batch
    if (needsSingleDraw) {
      this.layer.draw();
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

  // Method to update node visibility based on viewport changes
  public updateNodeVisibility(): void {
    const viewport = this.viewportCuller.getViewportInfo();
    
    // Skip update if viewport hasn't changed significantly
    if (this.lastViewport && this.viewportCuller.shouldSkipUpdate(this.lastViewport, viewport)) {
      return;
    }
    
    this.konvaNodes.forEach((node, nodeId) => {
      const group = node.getGroup();
      const centerX = group.x() + LAYOUT_CONFIG.width / 2;
      const centerY = group.y() + LAYOUT_CONFIG.height / 2;
      
      const isVisible = this.viewportCuller.isNodeVisible(
        centerX, centerY,
        LAYOUT_CONFIG.width, LAYOUT_CONFIG.height,
        viewport
      );
      
      // Update opacity based on visibility (keep root always visible)
      const isRoot = nodeId === this.rootId;
      group.opacity(isVisible || isRoot ? 1.0 : 0.1);
    });
    
    // Update connections based on visibility
    this.updateAllConnections();
    
    this.lastViewport = viewport;
  }
}

// Export performance utilities for external access
export { PerformanceUtils, ViewportCuller, BatchManager, DrawManager, ObjectPoolManager };
