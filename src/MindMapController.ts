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
  private connections: Map<string, Konva.Line> = new Map();
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private nodeCounter = 0;

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
      const newConnection = this.createConnectionLine(parentPos, childPos);
      this.connections.set(connectionId, newConnection);
      this.layer.add(newConnection);
      newConnection.moveToBottom();
    });

    this.layer.draw();
  }

  private createConnectionLine(
    parentPos: NodePosition,
    childPos: NodePosition
  ): Konva.Line {
    let startX, endX;

    if (childPos.side === "right") {
      startX = parentPos.x + LAYOUT_CONFIG.width / 2;
      endX = childPos.x - LAYOUT_CONFIG.width / 2;
    } else {
      startX = parentPos.x - LAYOUT_CONFIG.width / 2;
      endX = childPos.x + LAYOUT_CONFIG.width / 2;
    }

    return new Konva.Line({
      points: [startX, parentPos.y, endX, childPos.y],
      stroke: "#666",
      strokeWidth: 2,
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

    // Add drag handler for repositioning
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
    // Clear all selections first
    this.konvaNodes.forEach((node) => node.setSelected(false));

    // Select the clicked node
    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.setSelected(true);
    }
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
