import Konva from "konva";
import { Node } from "./Node";
import { HierarchicalPositioner } from "./HierarchicalPositioner";
import { ConnectionCache } from "./ConnectionCache";
import { BatchProcessor } from "./BatchProcessor";
import {
  NodePosition,
  NodeType,
  NODE_CONFIGS,
  LAYOUT_CONFIG,
} from "./NodePosition";

export class MindmapController {
  private positioner = new HierarchicalPositioner();
  private konvaNodes: Map<string, Node> = new Map();
  private connections: Map<string, Konva.Shape> = new Map();
  private connectionCache = new ConnectionCache();
  private batchProcessor = new BatchProcessor();
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private nodeCounter = 0;
  private selectedNodeId: string | null = null;
  private pendingRedraw = false;
  public onNodeSelected?: (nodeId: string | null) => void;

  constructor(layer: Konva.Layer, rootX: number, rootY: number) {
    this.layer = layer;
    this.rootX = rootX;
    this.rootY = rootY;
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

    return this.batchProcessor.batch(() => {
      const nodeId = this.generateNodeId();
      const position = this.positioner.calculateNodePosition(
        nodeId,
        this.rootId!,
        side,
        this.rootX,
        this.rootY
      );

      this.createAndPositionNode(nodeId, position, text, type);
      this.updateChildrenMap(this.rootId!, nodeId);
      
      // Add batch operations
      this.batchProcessor.addOperation({
        type: 'nodeAdd',
        nodeId,
        data: { parentId: this.rootId }
      });
      
      this.repositionSiblings(this.rootId!);
      // Use simple direct connection update
      this.updateConnectionsSimple(this.rootId!);
      
      return nodeId;
    });
  }

  addNodeToExisting(parentId: string, text: string, type: NodeType): string {
    const parentSide = this.positioner.getNodeSide(parentId);
    if (!parentSide) {
      throw new Error("Parent node not found");
    }

    return this.batchProcessor.batch(() => {
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
      
      // Add batch operations
      this.batchProcessor.addOperation({
        type: 'nodeAdd',
        nodeId,
        data: { parentId }
      });
      
      this.repositionSiblings(parentId);
      // Use simple direct connection update
      this.updateConnectionsSimple(parentId);
      
      return nodeId;
    });
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
        // Schedule efficient connection update during animation
        this.scheduleSmartConnectionUpdate();
      },
      onFinish: () => {
        // Final connection update
        this.scheduleSmartConnectionUpdate();
      }
    });

    tween.play();
  }

  // Simple connection update that works
  private updateConnectionsSimple(parentId: string): void {
    const children = this.positioner.getChildren(parentId);
    const parentPos = this.positioner.getNodePosition(parentId);

    if (!parentPos) return;

    children.forEach((childId) => {
      const childPos = this.positioner.getNodePosition(childId);
      if (!childPos) return;

      const connectionId = `${parentId}-${childId}`;

      // Remove old connection
      const oldConnection = this.connections.get(connectionId);
      if (oldConnection) {
        oldConnection.destroy();
      }

      // Get actual node dimensions
      const parentNode = this.konvaNodes.get(parentId);
      const childNode = this.konvaNodes.get(childId);
      if (!parentNode || !childNode) return;
      
      const parentGroup = parentNode.getGroup();
      const childGroup = childNode.getGroup();
      const parentRect = parentGroup.findOne('Rect') as Konva.Rect;
      const childRect = childGroup.findOne('Rect') as Konva.Rect;
      const parentWidth = parentRect.width();
      const parentHeight = parentRect.height();
      const childWidth = childRect.width();
      const childHeight = childRect.height();

      // Calculate center positions for both nodes using actual dimensions
      const parentCenterX = parentPos.x + parentWidth / 2;
      const parentCenterY = parentPos.y + parentHeight / 2;
      const childCenterX = childPos.x + childWidth / 2;
      const childCenterY = childPos.y + childHeight / 2;

      // Create simple curved connection
      const newConnection = new Konva.Shape({
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

      this.connections.set(connectionId, newConnection);
      this.layer.add(newConnection);
      newConnection.moveToBottom();
    });

    this.layer.draw();
  }

  // Schedule a connection update (batched and optimized)
  private scheduleConnectionUpdate(parentId: string): void {
    console.log(`Scheduling connection update for parent: ${parentId}`);
    this.batchProcessor.addBatchCallback(() => {
      console.log(`Executing batch callback for connection update: ${parentId}`);
      this.updateConnectionsOptimized([parentId]);
    });
  }

  // Optimized connection update for specific parents
  private updateConnectionsOptimized(parentIds: string[]): void {
    const viewport = this.getViewportBounds();
    console.log(`Viewport bounds:`, viewport);
    let hasVisibleChanges = false;

    parentIds.forEach(parentId => {
      const children = this.positioner.getChildren(parentId);
      const parentPos = this.positioner.getNodePosition(parentId);
      if (!parentPos) return;

      children.forEach((childId) => {
        const childPos = this.positioner.getNodePosition(childId);
        if (!childPos) return;

        const connectionId = `${parentId}-${childId}`;
        
        // Get actual node dimensions
        const parentNode = this.konvaNodes.get(parentId);
        const childNode = this.konvaNodes.get(childId);
        if (!parentNode || !childNode) return;

        const parentGroup = parentNode.getGroup();
        const childGroup = childNode.getGroup();
        const parentRect = parentGroup.findOne('Rect') as Konva.Rect;
        const childRect = childGroup.findOne('Rect') as Konva.Rect;
        const parentWidth = parentRect.width();
        const parentHeight = parentRect.height();
        const childWidth = childRect.width();
        const childHeight = childRect.height();

        // Calculate center positions for both nodes using actual dimensions
        const parentCenterX = parentPos.x + parentWidth / 2;
        const parentCenterY = parentPos.y + parentHeight / 2;
        const childCenterX = childPos.x + childWidth / 2;
        const childCenterY = childPos.y + childHeight / 2;

        // TODO: Debug - temporarily disable viewport culling to test connections
        // Check if connection is visible before processing
        const isVisible = this.connectionCache.isConnectionVisible(
          connectionId, parentCenterX, parentCenterY, childCenterX, childCenterY, viewport
        );
        console.log(`Connection ${connectionId} visibility:`, isVisible, { parentPos, childPos, viewport });
        
        if (!isVisible) {
          // Remove off-screen connection if it exists
          const oldConnection = this.connections.get(connectionId);
          if (oldConnection) {
            oldConnection.destroy();
            this.connections.delete(connectionId);
          }
          // For debugging, let's still create connections even if "not visible"
          // return; // Skip off-screen connections
        }

        console.log(`Creating connection for ${connectionId}:`, { parentPos, childPos });
        
        const newConnection = this.connectionCache.getCachedConnection(
          parentPos.x, parentPos.y, parentWidth, parentHeight,
          childPos.x, childPos.y, childWidth, childHeight
        );

        console.log(`Created connection shape:`, newConnection);

        // Remove old connection
        const oldConnection = this.connections.get(connectionId);
        if (oldConnection) {
          oldConnection.destroy();
        }

        // Add new connection
        this.connections.set(connectionId, newConnection);
        this.layer.add(newConnection);
        newConnection.moveToBottom();
        hasVisibleChanges = true;
        
        console.log(`Added connection ${connectionId} to layer, total connections:`, this.connections.size);
      });
    });

    // Only redraw if there were visible changes
    if (hasVisibleChanges) {
      this.scheduleDraw();
    }
  }

  // Smart connection update - only updates visible connections during animations
  private scheduleSmartConnectionUpdate(): void {
    if (this.pendingRedraw) return; // Already scheduled
    
    this.pendingRedraw = true;
    requestAnimationFrame(() => {
      this.updateVisibleConnections();
      this.pendingRedraw = false;
    });
  }

  // Update only visible connections with current visual positions
  private updateVisibleConnections(): void {
    const viewport = this.getViewportBounds();
    let hasChanges = false;

    // Process only visible connections
    this.connections.forEach((connection, connectionId) => {
      const [parentId, childId] = connectionId.split('-');
      const parentNode = this.konvaNodes.get(parentId);
      const childNode = this.konvaNodes.get(childId);
      
      if (!parentNode || !childNode) return;

      // Get current visual positions from Konva groups
      const parentGroup = parentNode.getGroup();
      const childGroup = childNode.getGroup();
      
      // Get actual node dimensions from the rectangle elements
      const parentRect = parentGroup.findOne('Rect') as Konva.Rect;
      const childRect = childGroup.findOne('Rect') as Konva.Rect;
      const parentWidth = parentRect.width();
      const parentHeight = parentRect.height();
      const childWidth = childRect.width();
      const childHeight = childRect.height();
      
      
      const parentCenterX = parentGroup.x() + parentWidth / 2;
      const parentCenterY = parentGroup.y() + parentHeight / 2;
      const childCenterX = childGroup.x() + childWidth / 2;
      const childCenterY = childGroup.y() + childHeight / 2;

      // Check if connection is visible
      if (!this.connectionCache.isConnectionVisible(
        connectionId, parentCenterX, parentCenterY, childCenterX, childCenterY, viewport
      )) {
        return; // Skip off-screen connections
      }

      // Get cached connection with current positions
      const newConnection = this.connectionCache.getCachedConnection(
        parentGroup.x(), parentGroup.y(), parentWidth, parentHeight,
        childGroup.x(), childGroup.y(), childWidth, childHeight
      );
      
      // Replace connection
      connection.destroy();
      this.connections.set(connectionId, newConnection);
      this.layer.add(newConnection);
      newConnection.moveToBottom();
      hasChanges = true;
    });

    // Single draw call for all changes
    if (hasChanges) {
      this.layer.draw();
    }
  }

  // Get current viewport bounds for culling calculations
  private getViewportBounds() {
    const stage = this.layer.getStage();
    if (!stage) {
      return { x: 0, y: 0, width: 1000, height: 1000, margin: 100 };
    }

    const stageBox = stage.getClientRect();
    const scale = stage.scaleX(); // Assume uniform scaling
    const margin = Math.min(stageBox.width, stageBox.height) * 0.1;

    return {
      x: -stage.x() / scale,
      y: -stage.y() / scale,
      width: stageBox.width / scale,
      height: stageBox.height / scale,
      margin: margin / scale
    };
  }

  // Simplified connection creation (now handled by ConnectionCache)
  private createConnectionLine(
    parentPos: NodePosition,
    childPos: NodePosition,
    parentId: string,
    childId: string
  ): Konva.Shape {
    // Use cached connection creation
    return this.connectionCache.getCachedConnection(
      parentPos.x, parentPos.y, LAYOUT_CONFIG.width, LAYOUT_CONFIG.height,
      childPos.x, childPos.y, LAYOUT_CONFIG.width, LAYOUT_CONFIG.height
    );
  }

  // Optimized draw scheduling to prevent multiple redraws
  private scheduleDraw(): void {
    if (this.pendingRedraw) return;
    
    this.pendingRedraw = true;
    requestAnimationFrame(() => {
      this.layer.draw();
      this.pendingRedraw = false;
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
      // Efficiently update connections while dragging
      this.scheduleSmartConnectionUpdate();
    });
    
    group.on("dragend", () => {
      this.handleNodeDrop(nodeId, group.x(), group.y());
    });
  }

  private handleNodeDrop(nodeId: string, dropX: number, dropY: number): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition || !nodePosition.parentId) {
      // Root node or invalid position - snap back to original
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    // Get all siblings (including the dragged node)
    const parentId = nodePosition.parentId;
    const siblings = this.positioner.getChildren(parentId);
    
    if (siblings.length <= 1) {
      // No siblings to reorder with - snap back to original
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    // Find the closest sibling based on drop position
    let closestSiblingId: string | null = null;
    let insertIndex = -1;
    let minDistance = Infinity;

    siblings.forEach((siblingId, index) => {
      if (siblingId === nodeId) return; // Skip the dragged node itself
      
      const siblingPosition = this.positioner.getNodePosition(siblingId);
      if (!siblingPosition) return;
      
      // Calculate distance between drop position and sibling
      const distance = Math.sqrt(
        Math.pow(dropX - siblingPosition.x, 2) + 
        Math.pow(dropY - siblingPosition.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestSiblingId = siblingId;
        
        // Determine if we should insert above or below this sibling
        if (dropY < siblingPosition.y) {
          insertIndex = index; // Insert above (before) this sibling
        } else {
          insertIndex = index + 1; // Insert below (after) this sibling
        }
      }
    });

    // If we found a valid drop target, reorder the siblings
    if (closestSiblingId && insertIndex >= 0) {
      this.reorderSiblings(parentId, nodeId, insertIndex);
    } else {
      // No valid drop target - snap back to original position
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
    }
  }

  private reorderSiblings(parentId: string, nodeId: string, newIndex: number): void {
    // Remove the node from its current position in the children array
    this.positioner.removeFromChildrenMap(parentId, nodeId);
    
    // Get the updated siblings list (without the moved node)
    const siblings = this.positioner.getChildren(parentId);
    
    // Insert the node at the new position
    const adjustedIndex = Math.min(newIndex, siblings.length);
    siblings.splice(adjustedIndex, 0, nodeId);
    
    // Update the children map with the new order
    this.positioner.setChildrenArray(parentId, siblings);
    
    // Reposition all siblings to reflect the new order
    this.repositionSiblings(parentId);
    
    // Update connections
    this.updateConnectionsSimple(parentId);
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

    // Schedule optimized redraw
    this.scheduleDraw();
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

  public getCacheStats() {
    return this.connectionCache.getCacheStats();
  }

  public clearCaches(): void {
    this.connectionCache.clearCache();
  }

  public removeNode(nodeId: string): void {
    // Store parent info before recursive deletion for repositioning
    const nodePosition = this.positioner.getNodePosition(nodeId);
    const parentId = nodePosition?.parentId;
    
    // Recursively remove this node and all its descendants
    this.removeNodeRecursive(nodeId);
    
    // Reposition remaining siblings to fill the gap (only for top-level deletion)
    if (parentId) {
      this.repositionSiblings(parentId);
      // Update connections for the parent after repositioning
      this.updateConnectionsSimple(parentId);
    }
    
    this.scheduleDraw();
  }

  private removeNodeRecursive(nodeId: string): void {
    // Recursively remove all children first - create a copy to avoid issues with list modification during iteration
    const children = [...this.positioner.getChildren(nodeId)];
    children.forEach((childId) => {
      this.removeNodeRecursive(childId); // Recursive call to remove child and its descendants
    });

    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.remove();
      this.konvaNodes.delete(nodeId);
    }

    // Clear selection if the deleted node was selected
    if (this.selectedNodeId === nodeId) {
      this.selectedNodeId = null;
      if (this.onNodeSelected) {
        this.onNodeSelected(null);
      }
    }

    // Remove connections from this node to its children (should be empty now after recursive deletion)
    const remainingChildren = this.positioner.getChildren(nodeId);
    remainingChildren.forEach((childId) => {
      const connectionId = `${nodeId}-${childId}`;
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.destroy();
        this.connections.delete(connectionId);
      }
    });

    // Remove connection from parent to this node
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const parentConnectionId = `${nodePosition.parentId}-${nodeId}`;
      const parentConnection = this.connections.get(parentConnectionId);
      if (parentConnection) {
        parentConnection.destroy();
        this.connections.delete(parentConnectionId);
      }

      // Remove from parent's children map
      this.positioner.removeFromChildrenMap(nodePosition.parentId, nodeId);
    }
    
    // Remove from positioner and clear caches
    this.positioner.removeNode(nodeId);
    
    // Add removal operation to batch if in batch mode
    if (this.batchProcessor.isInBatchMode()) {
      this.batchProcessor.addOperation({
        type: 'nodeRemove',
        nodeId,
        data: { childrenIds: [] } // Children already processed recursively
      });
    }
  }
}
