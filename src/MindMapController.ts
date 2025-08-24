import Konva from "konva";
import { v4 as uuidv4 } from "uuid";
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
  private nodeTypes: Map<string, NodeType> = new Map();
  private connections: Map<string, Konva.Shape> = new Map();
  private connectionCache = new ConnectionCache();
  private batchProcessor = new BatchProcessor();
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private selectedNodeId: string | null = null;
  private pendingRedraw = false;
  private dragUpdateThrottle = 0;
  private highlightUpdateThrottle = 0;
  private connectionUpdatePending = false;
  private lastDropTargetId: string | null = null;
  private isDragInProgress = false;
  public onNodeSelected?: (nodeId: string | null) => void;
  public onNodeTextChange?: (nodeId: string, newText: string) => void;
  public onNodeDoubleClick?: (nodeId: string) => void;
  public onNodeRightClick?: (nodeId: string) => void;

  constructor(layer: Konva.Layer, rootX: number, rootY: number) {
    this.layer = layer;
    this.rootX = rootX;
    this.rootY = rootY;
  }

  // Smart animation frame function - uses fixed 60 FPS during dragging for consistent performance
  private smartAnimationFrame(callback: () => void): void {
    if (this.isDragInProgress) {
      // Fixed 60 FPS during dragging for consistent performance
      setTimeout(callback, 1000 / 60); // 16.67ms intervals
    } else {
      // Use browser's optimized requestAnimationFrame for normal operations
      requestAnimationFrame(callback);
    }
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
      console.log('📍 Position calculated for', nodeId, ':', position);

      this.createAndPositionNode(nodeId, position, text, type);
      console.log('🎯 Node created and positioned at', position.x, position.y);
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
      console.log('📍 Position calculated for child', nodeId, 'parent:', parentId, 'position:', position);

      this.createAndPositionNode(nodeId, position, text, type);
      console.log('🎯 Child node positioned at', position.x, position.y);
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
      onTextChange: (newText: string) => this.handleNodeTextChange(nodeId, newText),
      onSizeChange: () => this.handleNodeSizeChange(nodeId),
      onDoubleClick: () => this.onNodeDoubleClick?.(nodeId),
      onRightClick: () => this.onNodeRightClick?.(nodeId),
    });

    this.konvaNodes.set(nodeId, node);
    this.nodeTypes.set(nodeId, type);

    // Update the positioner with the node's actual dimensions after creation
    const group = node.getGroup();
    const rect = group.findOne('Rect') as Konva.Rect;
    if (rect) {
      this.positioner.updateNodeDimensions(nodeId, rect.width(), rect.height());
    }

    this.setupNodeInteractions(nodeId);
  }

  private updateChildrenMap(parentId: string, childId: string): void {
    this.positioner.addToChildrenMap(parentId, childId);
  }

  private updateAllNodeDimensions(): void {
    // Update the positioner with current dimensions from all visual nodes
    this.konvaNodes.forEach((node, nodeId) => {
      const group = node.getGroup();
      const rect = group.findOne('Rect') as Konva.Rect;
      if (rect) {
        this.positioner.updateNodeDimensions(nodeId, rect.width(), rect.height());
      }
    });
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
    const rect = group.findOne('Rect') as Konva.Rect;
    
    // Use actual node dimensions for positioning
    const nodeWidth = rect ? rect.width() : LAYOUT_CONFIG.width;
    const nodeHeight = rect ? rect.height() : LAYOUT_CONFIG.height;
    
    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - nodeWidth / 2,
      y: targetPosition.y - nodeHeight / 2,
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
    const rect = group.findOne('Rect') as Konva.Rect;
    
    // Use actual node dimensions for positioning
    const nodeWidth = rect ? rect.width() : LAYOUT_CONFIG.width;
    const nodeHeight = rect ? rect.height() : LAYOUT_CONFIG.height;
    
    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - nodeWidth / 2,
      y: targetPosition.y - nodeHeight / 2,
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
      const connectionId = `${parentId}|${childId}`;

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

        const connectionId = `${parentId}|${childId}`;
        
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
    this.smartAnimationFrame(() => {
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
      const [parentId, childId] = connectionId.split('|');
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
    this.smartAnimationFrame(() => {
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
      // Set global drag state for fixed 60 FPS animation
      this.isDragInProgress = true;
      
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
      // Clear global drag state - return to optimized requestAnimationFrame
      this.isDragInProgress = false;
      
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
    console.log(`🎯 handleNodeDrop: nodeId=${nodeId}, dropX=${dropX}, dropY=${dropY}`);
    
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) {
      console.log(`❌ No position found for node ${nodeId}`);
      return;
    }

    console.log(`📍 Node position: level=${nodePosition.level}, side=${nodePosition.side}, parentId=${nodePosition.parentId}`);

    // Don't allow root node to be reparented
    if (nodeId === this.rootId) {
      console.log(`🚫 Cannot drag root node`);
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    // First, check if the node is being dropped on another node for reparenting
    const dropTargetId = this.findNodeAtPosition(dropX, dropY, nodeId);
    console.log(`🔍 Drop target search: found=${dropTargetId}`);
    
    if (dropTargetId && this.canReparent(nodeId, dropTargetId)) {
      console.log(`👨‍👩‍👧‍👦 Reparenting ${nodeId} to ${dropTargetId}`);
      this.reparentNode(nodeId, dropTargetId);
      return;
    }

    // If no reparenting, first check if root child should switch sides (higher priority)
    if (!nodePosition.parentId) {
      console.log(`❌ No parent ID found for node ${nodeId} - snapping back`);
      // Root node or invalid position - snap back to original
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    const parentId = nodePosition.parentId;
    console.log(`👪 Processing for parentId=${parentId}`);
    console.log(`🔢 Root ID is: ${this.rootId}`);

    // Check if root child should switch sides FIRST (higher priority than sibling reordering)
    if (nodePosition.level === 1 && parentId === this.rootId) {
      console.log(`✅ This is a root child (level 1) - checking side switch first`);
      const shouldSwitchSides = this.shouldSwitchSides(nodeId, dropX, dropY);
      if (shouldSwitchSides) {
        console.log(`🔄 Switching sides for node ${nodeId} based on drag position`);
        this.moveRootChildToOppositeSide(nodeId, dropX, dropY);
        return;
      } else {
        console.log(`🤔 Side switch conditions not met, checking sibling reordering`);
      }
    }

    // Get all siblings (including the dragged node)
    const siblings = this.positioner.getChildren(parentId);
    
    if (siblings.length <= 1) {
      console.log(`🤔 No siblings to reorder with (only ${siblings.length} sibling)`);
      
      // No siblings to reorder with - check if root child should switch sides
      if (nodePosition.level === 1 && parentId === this.rootId) {
        console.log(`✅ This is a root child (level 1) with no siblings - checking side switch`);
        const shouldSwitchSides = this.shouldSwitchSides(nodeId, dropX, dropY);
        if (shouldSwitchSides) {
          console.log(`🔄 Switching sides for node ${nodeId} based on drag position`);
          this.moveRootChildToOppositeSide(nodeId, dropX, dropY);
          return;
        } else {
          console.log(`❌ Side switch conditions not met`);
        }
      } else {
        console.log(`❌ Not a root child: level=${nodePosition.level}, parentId=${parentId}, rootId=${this.rootId}`);
      }
      
      // Snap back to original position
      console.log(`📍 Snapping back to original position`);
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
      console.log(`↕️ Reordering siblings: moving ${nodeId} to index ${insertIndex} near ${closestSiblingId}`);
      this.reorderSiblings(parentId, nodeId, insertIndex);
    } else {
      console.log(`🤔 No valid sibling reordering target found - snapping back`);
      
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
    
    // Update all node dimensions before repositioning to prevent overlaps
    this.updateAllNodeDimensions();
    
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
    return text.length > LAYOUT_CONFIG.maxNodeTextLength
      ? text.substring(0, LAYOUT_CONFIG.maxNodeTextLength - 3) + "..."
      : text;
  }

  private generateNodeId(): string {
    return uuidv4();
  }


  public clear(): void {
    // Clear all visual elements
    this.konvaNodes.forEach(node => node.remove());
    this.connections.forEach(connection => connection.destroy());
    
    // Clear positioner data BEFORE clearing konvaNodes - CRITICAL FIX
    Array.from(this.konvaNodes.keys()).forEach(nodeId => {
      this.positioner.removeNode(nodeId);
    });
    
    // Clear all data structures
    this.konvaNodes.clear();
    this.nodeTypes.clear();
    this.connections.clear();
    this.connectionCache.clearCache();
    
    // Reset state
    this.rootId = null;
    this.selectedNodeId = null;
    
    this.layer.draw();
  }

  public importFromTreeStructure(treeData: {
    id: string;
    text: string;
    type: NodeType;
    level: number;
    side: string;
    isSelected: boolean;
    children: Array<any>;
  }): void {
    console.log('🔄 Starting import with tree data:', treeData);
    
    // Wrap entire import in a single batch to avoid positioning conflicts
    this.batchProcessor.batch(() => {
      // Clear existing mindmap
      this.clear();
      console.log('✅ Cleared existing mindmap');
      
      // Create root first
      const rootId = this.createRootNode(treeData.text);
      console.log('✅ Created root node:', rootId, 'with text:', treeData.text);
      
      // Create a queue of nodes to process with their parent IDs
      const nodeQueue: Array<{nodeData: any, parentId: string}> = [];
      
      // Add all root children to the queue
      treeData.children.forEach(child => {
        nodeQueue.push({ nodeData: child, parentId: rootId });
        console.log('📝 Added to queue:', child.text, 'parent:', rootId, 'side:', child.side);
      });
      
      console.log('📊 Processing queue with', nodeQueue.length, 'items');
      
      // Process the queue iteratively
      let processCount = 0;
      while (nodeQueue.length > 0) {
        const { nodeData, parentId } = nodeQueue.shift()!;
        processCount++;
        
        console.log(`🔨 Processing node ${processCount}:`, nodeData.text, 'parent:', parentId);
        
        let newNodeId: string;
        
        // Determine if this is a direct child of root
        const isRootChild = parentId === rootId;
        console.log('🎯 Is root child:', isRootChild, 'level:', nodeData.level);
        
        if (isRootChild) {
          // Use addNodeToRoot for proper side handling
          console.log('➡️ Calling addNodeToRoot with side:', nodeData.side);
          newNodeId = this.addNodeToRoot(
            nodeData.text, 
            nodeData.type, 
            nodeData.side as "left" | "right"
          );
          console.log('✅ Created root child:', newNodeId);
        } else {
          // Use addNodeToExisting for deeper nodes
          console.log('⬇️ Calling addNodeToExisting, parent:', parentId);
          newNodeId = this.addNodeToExisting(parentId, nodeData.text, nodeData.type);
          console.log('✅ Created child node:', newNodeId);
        }
        
        // Add this node's children to the queue
        if (nodeData.children && nodeData.children.length > 0) {
          console.log('👶 Adding', nodeData.children.length, 'children to queue');
          nodeData.children.forEach((child: any) => {
            nodeQueue.push({ nodeData: child, parentId: newNodeId });
            console.log('  📝 Queued child:', child.text);
          });
        }
      }
      
      console.log('🎉 Import completed! Processed', processCount, 'nodes');
      
      // Trigger full layout recalculation to properly position all nodes
      console.log('🗖️ Triggering layout recalculation...');
      
      // Debug: Check what the positioner sees
      console.log('🔍 Positioner state before layout:');
      console.log('  Root ID:', this.rootId);
      console.log('  Root children:', this.positioner.getChildren(this.rootId!));
      this.positioner.getChildren(this.rootId!).forEach(childId => {
        console.log('    Child', childId, 'children:', this.positioner.getChildren(childId));
      });
      
      const layoutResults = this.positioner.repositionSiblings(this.rootId!, this.rootX, this.rootY);
      console.log('✅ Layout recalculated,', layoutResults.length, 'positions updated');
      
      // Update all node positions with the recalculated layout
      // layoutResults contains the updated NodePosition objects
      // Get all node IDs and update their visual positions
      Array.from(this.konvaNodes.keys()).forEach(nodeId => {
        const position = this.positioner.getNodePosition(nodeId);
        const node = this.konvaNodes.get(nodeId);
        if (node && node.getGroup() && position) {
          console.log('📍 Updating', nodeId, 'to position', position.x, position.y);
          node.getGroup().x(position.x - LAYOUT_CONFIG.width / 2);
          node.getGroup().y(position.y - LAYOUT_CONFIG.height / 2);
        }
      });
    });
    
    // Redraw the layer
    this.layer.draw();
  }

  private importNode(nodeData: {
    id: string;
    text: string;
    type: NodeType;
    level: number;
    side: string;
    isSelected: boolean;
    children: Array<any>;
  }, parentId: string | null): string {
    const nodeId = this.generateNodeId(); // Generate new UUID instead of using old one
    
    // Create position for the node
    let position: NodePosition;
    
    if (parentId === null) {
      // Root node
      position = {
        x: this.rootX,
        y: this.rootY,
        level: 0,
        stackIndex: 0,
        side: "right" as const
      };
    } else {
      // Child node - need to manually calculate position during import
      const parentPos = this.positioner.getNodePosition(parentId);
      if (!parentPos) {
        throw new Error(`Parent node position not found for ${parentId}`);
      }
      
      // Get sibling count for stack positioning
      const siblings = this.positioner.getChildren(parentId);
      const stackIndex = siblings.length;
      
      // Calculate child position based on parent and side
      const side = nodeData.side as "left" | "right";
      const horizontalOffset = side === "left" ? -(LAYOUT_CONFIG.width + LAYOUT_CONFIG.horizontalSpacing) : (LAYOUT_CONFIG.width + LAYOUT_CONFIG.horizontalSpacing);
      const verticalOffset = stackIndex * (LAYOUT_CONFIG.height + LAYOUT_CONFIG.verticalSpacing);
      
      position = {
        x: parentPos.x + horizontalOffset,
        y: parentPos.y + verticalOffset,
        level: parentPos.level + 1,
        stackIndex,
        side,
        parentId
      };
    }
    
    // Update positioner with the node position before creating the visual node
    this.positioner.updateNodePosition(nodeId, position);
    
    // Add to children map if has parent
    if (parentId) {
      this.updateChildrenMap(parentId, nodeId);
    }
    
    // Create and position the node
    this.createAndPositionNode(nodeId, position, nodeData.text, nodeData.type);
    
    // Note: Selection state is not preserved during import
    // since we generate new UUIDs
    
    // Import children recursively
    nodeData.children.forEach(childData => {
      this.importNode(childData, nodeId);
    });
    
    return nodeId;
    
    // Update connections for this node
    if (parentId) {
      this.updateConnectionsSimple(parentId);
    }
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

  public getRootChildren(): Array<{nodeId: string, side: "left" | "right", text: string}> {
    if (!this.rootId) return [];
    
    const rootChildren = this.positioner.getChildren(this.rootId);
    return rootChildren.map(nodeId => {
      const side = this.positioner.getNodeSide(nodeId) || "right";
      const node = this.konvaNodes.get(nodeId);
      const text = node?.getText() || "Unknown";
      return { nodeId, side, text };
    });
  }

  public getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }

  // Move a root child to the opposite side
  public moveRootChildToOppositeSide(nodeId: string, dropX?: number, dropY?: number): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) {
      console.warn('Node not found:', nodeId);
      return;
    }

    // Only allow moving root children (level 1)
    if (nodePosition.level !== 1) {
      console.warn('Can only move root children (level 1 nodes)');
      return;
    }

    const currentSide = this.positioner.getNodeSide(nodeId);
    if (!currentSide) {
      console.warn('Node side not found:', nodeId);
      return;
    }

    const newSide = currentSide === "left" ? "right" : "left";
    
    console.log(`Moving node ${nodeId} from ${currentSide} to ${newSide}`);
    
    // Update the node's side and all its descendants
    this.updateNodeAndDescendantsSides(nodeId, newSide);
    
    // If drop coordinates provided, find optimal vertical position on new side
    if (dropX !== undefined && dropY !== undefined) {
      this.positionNodeOptimallyOnNewSide(nodeId, newSide, dropY);
    }
    
    // Trigger layout recalculation to update positions
    const layoutResults = this.positioner.repositionSiblings(this.rootId!, this.rootX, this.rootY);
    
    // Update visual positions
    Array.from(this.konvaNodes.keys()).forEach(id => {
      const position = this.positioner.getNodePosition(id);
      const node = this.konvaNodes.get(id);
      if (node && node.getGroup() && position) {
        this.animateToPosition(node, position);
      }
    });
    
    // Update connections after animation
    setTimeout(() => {
      // Clear all existing connections first to prevent duplicates
      this.connections.forEach(connection => connection.destroy());
      this.connections.clear();
      
      // Now recreate all connections
      this.updateAllConnections();
    }, 300); // Match animation duration
  }

  public getCacheStats() {
    return this.connectionCache.getCacheStats();
  }

  private shouldSwitchSides(nodeId: string, dropX: number, dropY: number): boolean {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    const rootPosition = this.positioner.getNodePosition(this.rootId!);
    
    if (!nodePosition || !rootPosition) {
      return false;
    }

    const currentSide = nodePosition.side;
    const rootCenterX = rootPosition.x;
    
    // Determine which side the drop position is on relative to root
    const droppedOnLeftSide = dropX < rootCenterX;
    const droppedOnRightSide = dropX > rootCenterX;
    
    // Check if the node was dragged to the opposite side
    const shouldMoveToLeft = currentSide === "right" && droppedOnLeftSide;
    const shouldMoveToRight = currentSide === "left" && droppedOnRightSide;
    
    // Add a small threshold to prevent accidental switches near the center
    const threshold = 50; // pixels
    const distanceFromCenter = Math.abs(dropX - rootCenterX);
    
    if (distanceFromCenter < threshold) {
      return false; // Too close to center, don't switch
    }
    
    console.log(`🎯 Drop analysis: dropX=${dropX}, rootX=${rootCenterX}, currentSide=${currentSide}, distance=${distanceFromCenter}`);
    
    return shouldMoveToLeft || shouldMoveToRight;
  }

  private positionNodeOptimallyOnNewSide(nodeId: string, newSide: "left" | "right", dropY: number): void {
    if (!this.rootId) return;
    
    // Get all siblings on the new side (excluding the node being moved)
    const allRootChildren = this.positioner.getChildren(this.rootId);
    const newSideSiblings = allRootChildren.filter(siblingId => {
      if (siblingId === nodeId) return false; // Exclude the node being moved
      const siblingPosition = this.positioner.getNodePosition(siblingId);
      return siblingPosition && siblingPosition.side === newSide;
    });

    console.log(`🎯 Positioning node on ${newSide} side among ${newSideSiblings.length} siblings`);

    if (newSideSiblings.length === 0) {
      console.log(`📍 No siblings on ${newSide} side - node will be positioned normally`);
      return; // No siblings to position relative to
    }

    // Find the optimal insertion index based on dropY
    let insertIndex = 0;
    let minDistance = Infinity;

    newSideSiblings.forEach((siblingId, index) => {
      const siblingPosition = this.positioner.getNodePosition(siblingId);
      if (!siblingPosition) return;

      // Calculate distance between drop position and sibling
      const distance = Math.abs(dropY - siblingPosition.y);
      
      if (distance < minDistance) {
        minDistance = distance;
        // Determine if we should insert above or below this sibling
        if (dropY < siblingPosition.y) {
          insertIndex = index; // Insert above (before) this sibling
        } else {
          insertIndex = index + 1; // Insert below (after) this sibling
        }
      }
    });

    console.log(`📐 Optimal insertion index: ${insertIndex} out of ${newSideSiblings.length} siblings`);

    // Reorder the children array to place the moved node at the optimal position
    // First, remove the node from current position
    this.positioner.removeFromChildrenMap(this.rootId, nodeId);
    
    // Get updated root children (without the moved node)
    const updatedRootChildren = this.positioner.getChildren(this.rootId);
    
    // Separate into left and right sides
    const leftSideNodes = updatedRootChildren.filter(childId => {
      const childPosition = this.positioner.getNodePosition(childId);
      return childPosition && childPosition.side === "left";
    });
    
    const rightSideNodes = updatedRootChildren.filter(childId => {
      const childPosition = this.positioner.getNodePosition(childId);
      return childPosition && childPosition.side === "right";
    });

    // Insert the moved node into the correct side at the optimal index
    if (newSide === "left") {
      leftSideNodes.splice(insertIndex, 0, nodeId);
    } else {
      rightSideNodes.splice(insertIndex, 0, nodeId);
    }

    // Rebuild the complete children array (left side first, then right side)
    const reorderedChildren = [...leftSideNodes, ...rightSideNodes];
    this.positioner.setChildrenArray(this.rootId, reorderedChildren);
    
    console.log(`✅ Reordered children for optimal positioning`);
  }

  public clearCaches(): void {
    this.connectionCache.clearCache();
  }

  public isAnyNodeEditing(): boolean {
    for (const [nodeId, node] of this.konvaNodes) {
      if (node.getIsEditing()) {
        return true;
      }
    }
    return false;
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
      const oldConnectionId = `${oldParentId}|${nodeId}`;
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
    
    // Update levels for the reparented node and all its descendants
    this.updateNodeAndDescendantsLevels(nodeId);

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

  private updateNodeAndDescendantsLevels(nodeId: string): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) return;
    
    // Calculate the new level based on the parent's level
    if (nodePosition.parentId) {
      const parentPosition = this.positioner.getNodePosition(nodePosition.parentId);
      if (parentPosition) {
        nodePosition.level = parentPosition.level + 1;
        this.positioner.updateNodePosition(nodeId, nodePosition);
      }
    }
    
    // Recursively update all descendants' levels
    const children = this.positioner.getChildren(nodeId);
    children.forEach(childId => {
      this.updateNodeAndDescendantsLevels(childId);
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
    
    const connectionId = `${parentId}|${childId}`;
    
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
    // Use requestAnimationFrame for smooth connection updates
    this.scheduleDragConnectionUpdate(nodeId);
    
    // Update drop target highlighting less frequently (every 150ms) for performance
    const now = Date.now();
    if (now - this.highlightUpdateThrottle > 150) {
      this.highlightUpdateThrottle = now;
      
      // Get center of dragged node
      const rect = group.findOne('Rect') as Konva.Rect;
      const centerX = group.x() + (rect ? rect.width() / 2 : 50);
      const centerY = group.y() + (rect ? rect.height() / 2 : 25);
      
      // Only update highlighting if the target has changed
      this.updateDropTargetHighlightingOptimized(nodeId, centerX, centerY);
    }
  }

  private scheduleDragConnectionUpdate(nodeId: string): void {
    if (this.connectionUpdatePending) return;
    
    this.connectionUpdatePending = true;
    // Use direct requestAnimationFrame for drag connection updates to maintain responsiveness
    requestAnimationFrame(() => {
      this.updateSingleNodeConnection(nodeId);
      this.connectionUpdatePending = false;
    });
  }

  private updateSingleNodeConnection(nodeId: string): void {
    // Update connection FROM parent TO this node (if it has a parent)
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const connectionId = `${nodePosition.parentId}|${nodeId}`;
      this.updateConnectionPath(connectionId, nodePosition.parentId, nodeId);
    }
    
    // Update connections FROM this node TO its children
    const children = this.positioner.getChildren(nodeId);
    children.forEach(childId => {
      const connectionId = `${nodeId}|${childId}`;
      this.updateConnectionPath(connectionId, nodeId, childId);
    });
    
    this.layer.draw();
  }

  private updateConnectionPath(connectionId: string, parentId: string, childId: string): void {
    const oldConnection = this.connections.get(connectionId);
    if (!oldConnection) return;
    
    // Remove old connection and create new one with current visual positions
    // This approach is more reliable than modifying sceneFunc
    oldConnection.destroy();
    this.createConnectionFromVisualPositions(parentId, childId);
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

  private handleNodeTextChange(nodeId: string, newText: string): void {
    // Update the node's text and trigger a layout update if the text size changed significantly
    const node = this.konvaNodes.get(nodeId);
    if (!node) return;

    // Notify the MindMap about the text change
    if (this.onNodeTextChange) {
      this.onNodeTextChange(nodeId, newText);
    }

    // Get the parent to trigger repositioning of siblings if needed
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      // Reposition siblings to account for size changes
      setTimeout(() => {
        this.repositionSiblings(nodePosition.parentId!);
        this.updateConnectionsSimple(nodePosition.parentId!);
      }, 50);
    }
  }

  private handleNodeSizeChange(nodeId: string): void {
    // Update connections in real-time as the node size changes
    this.updateSingleNodeConnectionImmediate(nodeId);
  }

  private updateSingleNodeConnectionImmediate(nodeId: string): void {
    // Update connection FROM parent TO this node (if it has a parent)
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const connectionId = `${nodePosition.parentId}|${nodeId}`;
      this.updateConnectionPathImmediate(connectionId, nodePosition.parentId, nodeId);
    }
    
    // Update connections FROM this node TO its children
    const children = this.positioner.getChildren(nodeId);
    children.forEach(childId => {
      const connectionId = `${nodeId}|${childId}`;
      this.updateConnectionPathImmediate(connectionId, nodeId, childId);
    });
    
    // Single draw call for all connection updates
    this.layer.draw();
  }

  private updateConnectionPathImmediate(connectionId: string, parentId: string, childId: string): void {
    const oldConnection = this.connections.get(connectionId);
    if (!oldConnection) return;
    
    // Remove old connection and create new one with current visual positions
    // This approach is more reliable than modifying sceneFunc
    oldConnection.destroy();
    this.createConnectionFromVisualPositions(parentId, childId);
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
      this.nodeTypes.delete(nodeId);
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
      const connectionId = `${nodeId}|${childId}`;
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.destroy();
        this.connections.delete(connectionId);
      }
    });

    // Remove connection from parent to this node
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const parentConnectionId = `${nodePosition.parentId}|${nodeId}`;
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

  public getTreeStructure(): {
    id: string;
    text: string;
    type: NodeType;
    level: number;
    side: string;
    isSelected: boolean;
    children: Array<any>;
  } | null {
    if (!this.rootId) return null;
    
    return this.buildTreeNode(this.rootId);
  }

  private buildTreeNode(nodeId: string): {
    id: string;
    text: string;
    type: NodeType;
    level: number;
    side: string;
    isSelected: boolean;
    children: Array<any>;
  } {
    const node = this.konvaNodes.get(nodeId);
    const position = this.positioner.getNodePosition(nodeId);
    const childrenIds = this.positioner.getChildren(nodeId);
    
    const children = childrenIds.map(childId => this.buildTreeNode(childId));
    
    return {
      id: nodeId,
      text: node?.getText() || '',
      type: this.nodeTypes.get(nodeId) || NodeType.TASK,
      level: position?.level || 0,
      side: position?.side || 'right',
      isSelected: nodeId === this.selectedNodeId,
      children: children
    };
  }

  private importNodeSimple(nodeData: {
    id: string;
    text: string;
    type: NodeType;
    level: number;
    side: string;
    isSelected: boolean;
    children: Array<any>;
  }, parentId: string | null): string {
    let nodeId: string;
    
    if (parentId === null) {
      // Create root node
      nodeId = this.createRootNode(nodeData.text);
    } else {
      // For root children, use addNodeToRoot to get proper side handling
      if (nodeData.level === 1) {
        nodeId = this.addNodeToRoot(nodeData.text, nodeData.type, nodeData.side as "left" | "right");
      } else {
        // For deeper children, use addNodeToExisting
        nodeId = this.addNodeToExisting(parentId, nodeData.text, nodeData.type);
      }
    }
    
    // Import children recursively
    nodeData.children.forEach(childData => {
      this.importNodeSimple(childData, nodeId);
    });
    
    return nodeId;
  }
}
