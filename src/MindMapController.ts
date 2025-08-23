import Konva from "konva";
import { Node } from "./Node";
import { HierarchicalPositioner } from "./HierarchicalPositioner";
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
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private nodeCounter = 0;
  private selectedNodeId: string | null = null;
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
        // Update connections during animation
        this.updateAllConnections();
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

      // Create new connection
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
    // Update all connections by redrawing them based on current visual node positions
    this.connections.forEach((connection, connectionId) => {
      const [parentId, childId] = connectionId.split('-');
      const parentNode = this.konvaNodes.get(parentId);
      const childNode = this.konvaNodes.get(childId);
      
      if (parentNode && childNode) {
        // Get current visual positions from Konva groups
        const parentGroup = parentNode.getGroup();
        const childGroup = childNode.getGroup();
        
        // Convert visual positions back to logical center positions
        const parentPos = {
          x: parentGroup.x() + parentGroup.width() / 2,
          y: parentGroup.y() + parentGroup.height() / 2,
          level: 0, // These fields aren't used for connection drawing
          stackIndex: 0,
          side: "right" as const
        };
        
        const childPos = {
          x: childGroup.x() + childGroup.width() / 2,
          y: childGroup.y() + childGroup.height() / 2,
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
    this.layer.draw();
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

    const parentWidth = parentNode.getGroup().width();
    const parentHeight = parentNode.getGroup().height();
    const childWidth = childNode.getGroup().width();
    const childHeight = childNode.getGroup().height();

    // Calculate actual visual positions (nodes are positioned at center - width/2)
    const parentX = parentPos.x - parentWidth / 2;
    const parentY = parentPos.y - parentHeight / 2;
    const childX = childPos.x - childWidth / 2;
    const childY = childPos.y - childHeight / 2;

    // Calculate connection points using the smart algorithm
    const connector = this.calculateConnector(
      parentX, parentY, parentWidth, parentHeight,
      childX, childY, childWidth, childHeight
    );

    // Create curved line using Konva.Shape with custom drawing
    return new Konva.Shape({
      sceneFunc: (context, shape) => {
        context.beginPath();
        context.moveTo(connector.from.x, connector.from.y);
        
        // Calculate control point offset
        const baseOffset = connector.controlPointOffset * (connector.from.y - connector.to.y);
        const maxOffset = Math.min(childHeight, parentHeight) * 1.5;
        const offset = Math.max(-maxOffset, Math.min(maxOffset, baseOffset));
        
        // Draw quadratic Bézier curve
        context.quadraticCurveTo(
          connector.from.x,
          connector.to.y - offset,
          connector.to.x,
          connector.to.y
        );
        
        context.fillStrokeShape(shape);
      },
      stroke: "#838383ff",
      strokeWidth: 1,
      listening: false,
    });
  }

  private calculateConnector(
    parentX: number, parentY: number, parentWidth: number, parentHeight: number,
    childX: number, childY: number, childWidth: number, childHeight: number
  ) {
    const tolerance = 10;
    const childMid = childY + childHeight * 0.5;
    const parentMid = parentY + parentHeight * 0.5;

    // Check if nodes are horizontally aligned
    if (Math.abs(parentMid - childMid) + tolerance < Math.max(childHeight, parentHeight * 0.75)) {
      return this.horizontalConnector(
        parentX, parentY, parentWidth, parentHeight,
        childX, childY, childWidth, childHeight
      );
    } else {
      return this.verticalConnector(
        parentX, parentY, parentWidth, parentHeight,
        childX, childY, childWidth, childHeight
      );
    }
  }

  private horizontalConnector(
    parentX: number, parentY: number, parentWidth: number, parentHeight: number,
    childX: number, childY: number, childWidth: number, childHeight: number
  ) {
    const childHorizontalOffset = parentX < childX ? 0.1 : 0.9;
    const parentHorizontalOffset = 1 - childHorizontalOffset;
    
    return {
      from: {
        x: parentX + parentHorizontalOffset * parentWidth,  // Edge connection
        y: parentY + 0.5 * parentHeight                     // Vertical center
      },
      to: {
        x: childX + childHorizontalOffset * childWidth,
        y: childY + 0.5 * childHeight
      },
      controlPointOffset: 0  // Minimal curve for horizontal alignment
    };
  }

  private verticalConnector(
    parentX: number, parentY: number, parentWidth: number, parentHeight: number,
    childX: number, childY: number, childWidth: number, childHeight: number
  ) {
    const childHorizontalOffset = parentX < childX ? 0.1 : 0.9;
    
    return {
      from: {
        x: parentX + 0.5 * parentWidth,      // Horizontal center
        y: parentY + 0.5 * parentHeight      // Vertical center
      },
      to: {
        x: childX + childHorizontalOffset * childWidth,  // Left/right edge
        y: childY + 0.5 * childHeight                     // Vertical center
      },
      controlPointOffset: 0.75  // Strong curve for vertical separation
    };
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
}
