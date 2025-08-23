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
  private dragUpdateThrottle = 0;
  private lastDropTargetId: string | null = null;
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

  private animateToPositionWithCallback(node: Node, targetPosition: NodePosition, onComplete: () => void): void {
    const group = node.getGroup();
    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - LAYOUT_CONFIG.width / 2,
      y: targetPosition.y - LAYOUT_CONFIG.height / 2,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        // Keep connections visible during animation by updating them
        this.scheduleSmartConnectionUpdate();
      },
      onFinish: () => {
        onComplete();
      }
    });

    tween.play();
  }

  // Simple connection update that works - now uses visual positions
  private updateConnectionsSimple(parentId: string): void {
    const children = this.positioner.getChildren(parentId);

    children.forEach((childId) => {
      const connectionId = `${parentId}-${childId}`;

      // Remove old connection
      const oldConnection = this.connections.get(connectionId);
      if (oldConnection) {
        oldConnection.destroy();
      }

      // Create new connection using current visual positions
      this.createConnectionFromVisualPositions(parentId, childId);
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
    group.on("dragstart", () => {
      // Set dragging state for visual feedback
      const node = this.konvaNodes.get(nodeId);
      if (node) {
        node.setDragging(true);
      }
    });
    
    group.on("dragmove", () => {
      // Throttle expensive operations during drag
      this.throttledDragUpdate(nodeId, group);
    });
    
    group.on("dragend", () => {
      // Clear dragging state
      const node = this.konvaNodes.get(nodeId);
      if (node) {
        node.setDragging(false);
      }
      
      // Clear all drop target highlighting
      this.clearDropTargetHighlighting();
      
      // Use center of the dragged node for drop detection
      const rect = group.findOne('Rect') as Konva.Rect;
      const centerX = group.x() + (rect ? rect.width() / 2 : 50);
      const centerY = group.y() + (rect ? rect.height() / 2 : 25);
      
      this.handleNodeDrop(nodeId, centerX, centerY);
      
      // Always ensure the dragged node's connection is properly restored after drag
      setTimeout(() => {
        this.updateSingleNodeConnection(nodeId);
      }, 100);
    });
  }

  private handleNodeDrop(nodeId: string, dropX: number, dropY: number): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) {
      return;
    }

    // Don't allow root node to be reparented
    if (nodeId === this.rootId) {
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    // First, check if the node is being dropped on another node for reparenting
    const dropTargetId = this.findNodeAtPosition(dropX, dropY, nodeId);
    if (dropTargetId && this.canReparent(nodeId, dropTargetId)) {
      this.reparentNode(nodeId, dropTargetId);
      return;
    }

    // If no reparenting, handle sibling reordering
    if (!nodePosition.parentId) {
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

  private findNodeAtPosition(x: number, y: number, excludeNodeId?: string): string | null {
    for (const [nodeId, node] of this.konvaNodes) {
      if (nodeId === excludeNodeId) continue;
      
      const group = node.getGroup();
      const rect = group.findOne('Rect') as Konva.Rect;
      if (!rect) continue;
      
      // Get node bounds
      const nodeX = group.x();
      const nodeY = group.y();
      const nodeWidth = rect.width();
      const nodeHeight = rect.height();
      
      // Check if position is within node bounds
      if (x >= nodeX && x <= nodeX + nodeWidth &&
          y >= nodeY && y <= nodeY + nodeHeight) {
        return nodeId;
      }
    }
    return null;
  }

  private canReparent(sourceNodeId: string, targetNodeId: string): boolean {
    // Cannot reparent to itself
    if (sourceNodeId === targetNodeId) return false;
    
    // Cannot reparent to own descendant (would create cycle)
    return !this.isDescendant(targetNodeId, sourceNodeId);
  }

  private isDescendant(nodeId: string, ancestorId: string): boolean {
    const children = this.positioner.getChildren(ancestorId);
    for (const childId of children) {
      if (childId === nodeId) return true;
      if (this.isDescendant(nodeId, childId)) return true;
    }
    return false;
  }

  private reparentNode(nodeId: string, newParentId: string): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) return;

    const oldParentId = nodePosition.parentId;
    
    // Remove from old parent
    if (oldParentId) {
      this.positioner.removeFromChildrenMap(oldParentId, nodeId);
      
      // Remove old connection
      const oldConnectionId = `${oldParentId}-${nodeId}`;
      const oldConnection = this.connections.get(oldConnectionId);
      if (oldConnection) {
        oldConnection.destroy();
        this.connections.delete(oldConnectionId);
      }
    }

    // Add to new parent
    this.positioner.addToChildrenMap(newParentId, nodeId);
    
    // Update the node's parentId in its position
    nodePosition.parentId = newParentId;
    this.positioner.updateNodePosition(nodeId, nodePosition);
    
    // Update the node's side to match the new parent's side
    const newParentSide = this.positioner.getNodeSide(newParentId);
    this.updateNodeAndDescendantsSides(nodeId, newParentSide || "right");

    // Create a temporary connection immediately so it's visible during animation
    // This will be replaced with the correct position after animations complete
    this.createConnectionFromVisualPositions(newParentId, nodeId);

    // Trigger a full layout recalculation from the root
    // This will properly position the reparented node and all its descendants
    const updatedPositions = this.positioner.repositionSiblings(
      this.rootId!,
      this.rootX,
      this.rootY
    );

    // Track animation completion to update connections after all animations finish
    let animationsRemaining = updatedPositions.length;
    
    // Animate all nodes to their new positions
    updatedPositions.forEach((position) => {
      const positionNodeId = this.findNodeIdByPosition(position);
      if (positionNodeId) {
        const konvaNode = this.konvaNodes.get(positionNodeId);
        if (konvaNode) {
          this.animateToPositionWithCallback(konvaNode, position, () => {
            animationsRemaining--;
            if (animationsRemaining === 0) {
              // All animations complete - now clear and recreate all connections
              this.connections.forEach(connection => connection.destroy());
              this.connections.clear();
              this.updateAllConnections();
            }
          });
        } else {
          animationsRemaining--;
        }
      } else {
        animationsRemaining--;
      }
    });

    // If no animations were started, clear and recreate connections immediately
    if (animationsRemaining === 0) {
      this.connections.forEach(connection => connection.destroy());
      this.connections.clear();
      this.updateAllConnections();
    }
  }

  private updateNodeAndDescendantsSides(nodeId: string, side: "left" | "right"): void {
    // Update the node's side in the positioner
    this.positioner.updateNodeSide(nodeId, side);
    
    // Recursively update all descendants to the same side and ensure parent relationships
    const children = this.positioner.getChildren(nodeId);
    children.forEach(childId => {
      // Ensure the child knows its correct parent
      const childPosition = this.positioner.getNodePosition(childId);
      if (childPosition && childPosition.parentId !== nodeId) {
        childPosition.parentId = nodeId;
        this.positioner.updateNodePosition(childId, childPosition);
      }
      
      this.updateNodeAndDescendantsSides(childId, side);
    });
  }

  private updateAllConnections(): void {
    // Recreate all connections using current visual positions
    // (connections should already be cleared by caller)
    this.konvaNodes.forEach((node, nodeId) => {
      const children = this.positioner.getChildren(nodeId);
      children.forEach(childId => {
        this.createConnectionFromVisualPositions(nodeId, childId);
      });
    });
    
    this.layer.draw();
  }

  private createConnectionFromVisualPositions(parentId: string, childId: string): void {
    const parentNode = this.konvaNodes.get(parentId);
    const childNode = this.konvaNodes.get(childId);
    
    if (!parentNode || !childNode) return;
    
    const parentGroup = parentNode.getGroup();
    const childGroup = childNode.getGroup();
    const parentRect = parentGroup.findOne('Rect') as Konva.Rect;
    const childRect = childGroup.findOne('Rect') as Konva.Rect;
    
    if (!parentRect || !childRect) return;
    
    // Use current visual positions
    const parentCenterX = parentGroup.x() + parentRect.width() / 2;
    const parentCenterY = parentGroup.y() + parentRect.height() / 2;
    const childCenterX = childGroup.x() + childRect.width() / 2;
    const childCenterY = childGroup.y() + childRect.height() / 2;
    
    const connectionId = `${parentId}-${childId}`;
    
    // Create connection using visual positions
    const connection = new Konva.Shape({
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
    
    this.connections.set(connectionId, connection);
    this.layer.add(connection);
    connection.moveToBottom();
  }

  private repositionDescendants(parentId: string): void {
    const children = this.positioner.getChildren(parentId);
    children.forEach(childId => {
      const parentSide = this.positioner.getNodeSide(parentId);
      const childPosition = this.positioner.calculateNodePosition(
        childId,
        parentId,
        parentSide || "right",
        this.rootX,
        this.rootY
      );
      
      this.positioner.updateNodePosition(childId, childPosition);
      
      const childNode = this.konvaNodes.get(childId);
      if (childNode) {
        this.animateToPosition(childNode, childPosition);
      }
      
      // Recursively reposition grandchildren
      this.repositionDescendants(childId);
    });
    
    this.updateConnectionsSimple(parentId);
  }


  private throttledDragUpdate(nodeId: string, group: Konva.Group): void {
    // Only update connection of the dragged node, not all connections
    this.updateSingleNodeConnection(nodeId);
    
    // Throttle drop target highlighting to every 100ms
    const now = Date.now();
    if (now - this.dragUpdateThrottle > 100) {
      this.dragUpdateThrottle = now;
      
      // Get center of dragged node
      const rect = group.findOne('Rect') as Konva.Rect;
      const centerX = group.x() + (rect ? rect.width() / 2 : 50);
      const centerY = group.y() + (rect ? rect.height() / 2 : 25);
      
      // Only update highlighting if the target has changed
      this.updateDropTargetHighlightingOptimized(nodeId, centerX, centerY);
    }
  }

  private updateSingleNodeConnection(nodeId: string): void {
    // Update connection FROM parent TO this node (if it has a parent)
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const connectionId = `${nodePosition.parentId}-${nodeId}`;
      const oldConnection = this.connections.get(connectionId);
      
      if (oldConnection) {
        // Remove old connection and create new one with current visual positions
        oldConnection.destroy();
        this.createConnectionFromVisualPositions(nodePosition.parentId, nodeId);
      }
    }
    
    // Update connections FROM this node TO its children
    const children = this.positioner.getChildren(nodeId);
    children.forEach(childId => {
      const connectionId = `${nodeId}-${childId}`;
      const oldConnection = this.connections.get(connectionId);
      
      if (oldConnection) {
        // Remove old connection and create new one with current visual positions
        oldConnection.destroy();
        this.createConnectionFromVisualPositions(nodeId, childId);
      }
    });
    
    this.layer.draw();
  }

  private updateDropTargetHighlightingOptimized(draggedNodeId: string, dragX: number, dragY: number): void {
    // Find potential drop target
    const dropTargetId = this.findNodeAtPosition(dragX, dragY, draggedNodeId);
    const validTarget = dropTargetId && this.canReparent(draggedNodeId, dropTargetId) ? dropTargetId : null;
    
    // Only update if target changed
    if (this.lastDropTargetId !== validTarget) {
      // Clear previous target
      if (this.lastDropTargetId) {
        const prevTargetNode = this.konvaNodes.get(this.lastDropTargetId);
        if (prevTargetNode) {
          prevTargetNode.setDropTarget(false);
        }
      }
      
      // Set new target
      if (validTarget) {
        const targetNode = this.konvaNodes.get(validTarget);
        if (targetNode) {
          targetNode.setDropTarget(true);
        }
      }
      
      this.lastDropTargetId = validTarget;
    }
  }

  private clearDropTargetHighlighting(): void {
    if (this.lastDropTargetId) {
      const targetNode = this.konvaNodes.get(this.lastDropTargetId);
      if (targetNode) {
        targetNode.setDropTarget(false);
      }
      this.lastDropTargetId = null;
    }
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
