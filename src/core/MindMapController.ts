import Konva from "konva";
import { v4 as uuidv4 } from "uuid";
import { Node } from "../components/Node";
import { HierarchicalPositioner } from "../layout/HierarchicalPositioner";
import { ConnectionCache } from "../utils/ConnectionCache";
import { BatchProcessor } from "../utils/BatchProcessor";
import {
  NodePosition,
  NodeType,
  NODE_CONFIGS,
  LAYOUT_CONFIG,
} from "../types/NodePosition";

export interface TreeNodeData {
  id: string;
  text: string;
  type: NodeType;
  level: number;
  side: string;
  isSelected: boolean;
  data?: Record<string, unknown>;
  children: TreeNodeData[];
}

export class MindmapController {
  private positioner = new HierarchicalPositioner();
  private konvaNodes: Map<string, Node> = new Map();
  private nodeTypes: Map<string, NodeType> = new Map();
  private nodeData: Map<string, Record<string, unknown>> = new Map();
  private connections: Map<string, Konva.Shape> = new Map();
  private connectionCache = new ConnectionCache();
  private batchProcessor = new BatchProcessor();
  private layer: Konva.Layer;
  private rootId: string | null = null;
  private rootX: number;
  private rootY: number;
  private selectedNodeId: string | null = null;
  private pendingRedraw = false;
  private highlightUpdateThrottle = 0;
  private connectionUpdatePending = false;
  private lastDropTargetId: string | null = null;
  private isDragInProgress = false;
  public onNodeSelected?: (nodeId: string | null) => void;
  public onNodeTextChange?: (nodeId: string, newText: string) => void;
  public onNodeDoubleClick?: (nodeId: string) => void;
  public onNodeRightClick?: (nodeId: string, x: number, y: number) => void;
  public onLinkClick?: (nodeId: string) => void;

  constructor(layer: Konva.Layer, rootX: number, rootY: number) {
    this.layer = layer;
    this.rootX = rootX;
    this.rootY = rootY;
  }

  private smartAnimationFrame(callback: () => void): void {
    if (this.isDragInProgress) {
      setTimeout(callback, 1000 / 60);
    } else {
      requestAnimationFrame(callback);
    }
  }

  createRootNode(text: string, data: Record<string, unknown> = {}): string {
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
    this.nodeData.set(nodeId, data);
    return nodeId;
  }

  addNodeToRoot(
    text: string,
    type: NodeType,
    side: "left" | "right",
    data: Record<string, unknown> = {}
  ): string {
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

      this.createAndPositionNode(nodeId, position, text, type, text === "");
      this.nodeData.set(nodeId, data);
      this.initializeCubeChildren(nodeId, type);
      this.updateChildrenMap(this.rootId!, nodeId);

      this.batchProcessor.addOperation({
        type: "nodeAdd",
        nodeId,
        data: { parentId: this.rootId },
      });

      this.repositionSiblings(this.rootId!);

      this.updateConnectionsSimple(this.rootId!);

      return nodeId;
    });
  }

  addNodeToExisting(
    parentId: string,
    text: string,
    type: NodeType,
    data: Record<string, unknown> = {}
  ): string {
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

      this.createAndPositionNode(nodeId, position, text, type, text === "");
      this.nodeData.set(nodeId, data);
      this.initializeCubeChildren(nodeId, type);
      this.updateChildrenMap(parentId, nodeId);

      this.batchProcessor.addOperation({
        type: "nodeAdd",
        nodeId,
        data: { parentId },
      });

      this.repositionSiblings(parentId);

      this.updateConnectionsSimple(parentId);

      return nodeId;
    });
  }

  private createAndPositionNode(
    nodeId: string,
    position: NodePosition,
    text: string,
    type: NodeType,
    isNewNode: boolean = false
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
      onTextChange: (newText: string) =>
        this.handleNodeTextChange(nodeId, newText),
      onSizeChange: () => this.handleNodeSizeChange(nodeId),
      onDoubleClick: () => this.onNodeDoubleClick?.(nodeId),
      onRightClick: (x: number, y: number) =>
        this.onNodeRightClick?.(nodeId, x, y),
      onLinkClick:
        type === NodeType.LINK ? () => this.onLinkClick?.(nodeId) : undefined,
      isLinkNode: type === NodeType.LINK,
      isNewNode: isNewNode,
      nodeType: type,
    });

    this.konvaNodes.set(nodeId, node);
    this.nodeTypes.set(nodeId, type);

    const group = node.getGroup();
    const rect = group.findOne("Rect") as Konva.Rect;
    if (rect) {
      this.positioner.updateNodeDimensions(nodeId, rect.width(), rect.height());
    }

    this.setupNodeInteractions(nodeId);
  }

  private initializeCubeChildren(nodeId: string, type: NodeType): void {
    if (type === NodeType.CUBE) {
      const cubeData = this.nodeData.get(nodeId) || {};
      if (!cubeData.cubeChildren) {
        cubeData.cubeChildren = {
          face1: null,
          face2: null,
          face3: null,
          face4: null,
          face5: null,
          face6: null,
        };
        this.nodeData.set(nodeId, cubeData);
      }
    }
  }

  private updateChildrenMap(parentId: string, childId: string): void {
    this.positioner.addToChildrenMap(parentId, childId);
  }

  private updateAllNodeDimensions(): void {
    this.konvaNodes.forEach((node, nodeId) => {
      const group = node.getGroup();
      const rect = group.findOne("Rect") as Konva.Rect;
      if (rect) {
        this.positioner.updateNodeDimensions(
          nodeId,
          rect.width(),
          rect.height()
        );
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
    const rect = group.findOne("Rect") as Konva.Rect;

    const nodeWidth = rect ? rect.width() : LAYOUT_CONFIG.width;
    const nodeHeight = rect ? rect.height() : LAYOUT_CONFIG.height;

    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - nodeWidth / 2,
      y: targetPosition.y - nodeHeight / 2,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        this.scheduleSmartConnectionUpdate();
      },
      onFinish: () => {
        this.scheduleSmartConnectionUpdate();
      },
    });

    tween.play();
  }

  private animateToPositionWithCallback(
    node: Node,
    targetPosition: NodePosition,
    onComplete: () => void
  ): void {
    const group = node.getGroup();
    const rect = group.findOne("Rect") as Konva.Rect;

    const nodeWidth = rect ? rect.width() : LAYOUT_CONFIG.width;
    const nodeHeight = rect ? rect.height() : LAYOUT_CONFIG.height;

    const tween = new Konva.Tween({
      node: group,
      duration: 0.4,
      x: targetPosition.x - nodeWidth / 2,
      y: targetPosition.y - nodeHeight / 2,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        this.scheduleSmartConnectionUpdate();
      },
      onFinish: () => {
        onComplete();
      },
    });

    tween.play();
  }

  private updateConnectionsSimple(parentId: string): void {
    const children = this.positioner.getChildren(parentId);

    children.forEach((childId) => {
      const connectionId = `${parentId}|${childId}`;

      const oldConnection = this.connections.get(connectionId);
      if (oldConnection) {
        oldConnection.destroy();
      }

      this.createConnectionFromVisualPositions(parentId, childId);
    });

    this.layer.draw();
  }



  private scheduleSmartConnectionUpdate(): void {
    if (this.pendingRedraw) return;

    this.pendingRedraw = true;
    this.smartAnimationFrame(() => {
      this.updateVisibleConnections();
      this.pendingRedraw = false;
    });
  }

  private updateVisibleConnections(): void {
    const viewport = this.getViewportBounds();
    let hasChanges = false;

    this.connections.forEach((connection, connectionId) => {
      const [parentId, childId] = connectionId.split("|");
      const parentNode = this.konvaNodes.get(parentId);
      const childNode = this.konvaNodes.get(childId);

      if (!parentNode || !childNode) return;

      const parentGroup = parentNode.getGroup();
      const childGroup = childNode.getGroup();

      const parentRect = parentGroup.findOne("Rect") as Konva.Rect;
      const childRect = childGroup.findOne("Rect") as Konva.Rect;
      const parentWidth = parentRect.width();
      const parentHeight = parentRect.height();
      const childWidth = childRect.width();
      const childHeight = childRect.height();

      const parentCenterX = parentGroup.x() + parentWidth / 2;
      const parentCenterY = parentGroup.y() + parentHeight / 2;
      const childCenterX = childGroup.x() + childWidth / 2;
      const childCenterY = childGroup.y() + childHeight / 2;

      if (
        !this.connectionCache.isConnectionVisible(
          connectionId,
          parentCenterX,
          parentCenterY,
          childCenterX,
          childCenterY,
          viewport
        )
      ) {
        return;
      }

      const newConnection = this.connectionCache.getCachedConnection(
        parentGroup.x(),
        parentGroup.y(),
        parentWidth,
        parentHeight,
        childGroup.x(),
        childGroup.y(),
        childWidth,
        childHeight
      );

      connection.destroy();
      this.connections.set(connectionId, newConnection);
      this.layer.add(newConnection);
      newConnection.moveToBottom();
      hasChanges = true;
    });

    if (hasChanges) {
      this.layer.draw();
    }
  }

  private getViewportBounds() {
    const stage = this.layer.getStage();
    if (!stage) {
      return { x: 0, y: 0, width: 1000, height: 1000, margin: 100 };
    }

    const stageBox = stage.getClientRect();
    const scale = stage.scaleX();
    const margin = Math.min(stageBox.width, stageBox.height) * 0.1;

    return {
      x: -stage.x() / scale,
      y: -stage.y() / scale,
      width: stageBox.width / scale,
      height: stageBox.height / scale,
      margin: margin / scale,
    };
  }

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

    group.on("click", (e) => {
      e.cancelBubble = true;
      this.selectNode(nodeId);
    });

    group.on("dragstart", () => {
      this.isDragInProgress = true;

      const node = this.konvaNodes.get(nodeId);
      if (node) {
        node.setDragging(true);
      }
    });

    group.on("dragmove", () => {
      this.throttledDragUpdate(nodeId, group);
    });

    group.on("dragend", () => {
      this.isDragInProgress = false;

      const node = this.konvaNodes.get(nodeId);
      if (node) {
        node.setDragging(false);
      }

      this.clearDropTargetHighlighting();

      const rect = group.findOne("Rect") as Konva.Rect;
      const centerX = group.x() + (rect ? rect.width() / 2 : 50);
      const centerY = group.y() + (rect ? rect.height() / 2 : 25);

      this.handleNodeDrop(nodeId, centerX, centerY);

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

    if (nodeId === this.rootId) {
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    const dropTargetId = this.findNodeAtPosition(dropX, dropY, nodeId);

    if (dropTargetId && this.canReparent(nodeId, dropTargetId)) {
      this.reparentNode(nodeId, dropTargetId);
      return;
    }

    if (!nodePosition.parentId) {
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    const parentId = nodePosition.parentId;

    if (nodePosition.level === 1 && parentId === this.rootId) {
      const shouldSwitchSides = this.shouldSwitchSides(nodeId, dropX);
      if (shouldSwitchSides) {
        this.moveRootChildToOppositeSide(nodeId, dropX, dropY);
        return;
      }
    }

    const siblings = this.positioner.getChildren(parentId);

    if (siblings.length <= 1) {
      if (nodePosition.level === 1 && parentId === this.rootId) {
        const shouldSwitchSides = this.shouldSwitchSides(nodeId, dropX);
        if (shouldSwitchSides) {
          this.moveRootChildToOppositeSide(nodeId, dropX, dropY);
          return;
        }
      }

      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
      return;
    }

    let closestSiblingId: string | null = null;
    let insertIndex = -1;
    let minDistance = Infinity;

    siblings.forEach((siblingId, index) => {
      if (siblingId === nodeId) return;

      const siblingPosition = this.positioner.getNodePosition(siblingId);
      if (!siblingPosition) return;

      const distance = Math.sqrt(
        Math.pow(dropX - siblingPosition.x, 2) +
          Math.pow(dropY - siblingPosition.y, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestSiblingId = siblingId;

        if (dropY < siblingPosition.y) {
          insertIndex = index;
        } else {
          insertIndex = index + 1;
        }
      }
    });

    if (closestSiblingId && insertIndex >= 0) {
      this.reorderSiblings(parentId, nodeId, insertIndex);
    } else {
      const position = this.positioner.getNodePosition(nodeId);
      if (position) {
        const node = this.konvaNodes.get(nodeId);
        if (node) this.animateToPosition(node, position);
      }
    }
  }

  private reorderSiblings(
    parentId: string,
    nodeId: string,
    newIndex: number
  ): void {
    this.positioner.removeFromChildrenMap(parentId, nodeId);

    const siblings = this.positioner.getChildren(parentId);

    const adjustedIndex = Math.min(newIndex, siblings.length);
    siblings.splice(adjustedIndex, 0, nodeId);

    this.positioner.setChildrenArray(parentId, siblings);

    this.updateAllNodeDimensions();

    this.repositionSiblings(parentId);

    this.updateConnectionsSimple(parentId);
  }

  public selectNode(nodeId: string): void {
    this.konvaNodes.forEach((node) => {
      if (node.isCurrentlyEditing()) {
        node.finishEditing();
      }
      node.setSelected(false);
    });

    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.setSelected(true);
      this.selectedNodeId = nodeId;
    }

    if (this.onNodeSelected) {
      this.onNodeSelected(nodeId);
    }

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

  public deselectAllNodes(): void {
    this.konvaNodes.forEach((node) => {
      if (node.isCurrentlyEditing()) {
        node.finishEditing();
      }
      node.setSelected(false);
    });

    this.selectedNodeId = null;

    if (this.onNodeSelected) {
      this.onNodeSelected(null);
    }

    this.layer.draw();
  }

  public clear(): void {
    this.konvaNodes.forEach((node) => node.remove());
    this.connections.forEach((connection) => connection.destroy());

    Array.from(this.konvaNodes.keys()).forEach((nodeId) => {
      this.positioner.removeNode(nodeId);
    });

    this.konvaNodes.clear();
    this.nodeTypes.clear();
    this.nodeData.clear();
    this.connections.clear();
    this.connectionCache.clearCache();

    this.rootId = null;
    this.selectedNodeId = null;

    this.layer.draw();
  }

  public importFromTreeStructure(treeData: TreeNodeData): void {
    this.batchProcessor.batch(() => {
      this.clear();

      const rootId = this.createRootNode(treeData.text, treeData.data || {});

      const nodeQueue: Array<{ nodeData: TreeNodeData; parentId: string }> = [];

      treeData.children.forEach((child) => {
        nodeQueue.push({ nodeData: child, parentId: rootId });
      });

      while (nodeQueue.length > 0) {
        const { nodeData, parentId } = nodeQueue.shift()!;

        let newNodeId: string;

        const isRootChild = parentId === rootId;

        if (isRootChild) {
          newNodeId = this.addNodeToRoot(
            nodeData.text,
            nodeData.type,
            nodeData.side as "left" | "right",
            nodeData.data || {}
          );
        } else {
          newNodeId = this.addNodeToExisting(
            parentId,
            nodeData.text,
            nodeData.type,
            nodeData.data || {}
          );
        }

        if (nodeData.children && nodeData.children.length > 0) {
          nodeData.children.forEach((child: TreeNodeData) => {
            nodeQueue.push({ nodeData: child, parentId: newNodeId });
          });
        }
      }

      // Force repositioning of all child nodes

      this.positioner.repositionSiblings(this.rootId!, this.rootX, this.rootY);

      Array.from(this.konvaNodes.keys()).forEach((nodeId) => {
        const position = this.positioner.getNodePosition(nodeId);
        const node = this.konvaNodes.get(nodeId);
        if (node && node.getGroup() && position) {
          node.getGroup().x(position.x - LAYOUT_CONFIG.width / 2);
          node.getGroup().y(position.y - LAYOUT_CONFIG.height / 2);
        }
      });
    });

    this.layer.draw();
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

  public getRootChildren(): Array<{
    nodeId: string;
    side: "left" | "right";
    text: string;
  }> {
    if (!this.rootId) return [];

    const rootChildren = this.positioner.getChildren(this.rootId);
    return rootChildren.map((nodeId) => {
      const side = this.positioner.getNodeSide(nodeId) || "right";
      const node = this.konvaNodes.get(nodeId);
      const text = node?.getText() || "Unknown";
      return { nodeId, side, text };
    });
  }

  public getSelectedNodeId(): string | null {
    return this.selectedNodeId;
  }

  public getParentId(nodeId: string): string | null {
    const position = this.positioner.getNodePosition(nodeId);
    return position?.parentId || null;
  }

  public getNodeText(nodeId: string): string | null {
    const node = this.konvaNodes.get(nodeId);
    return node ? node.getText() : null;
  }

  public getNodeType(nodeId: string): NodeType | null {
    return this.nodeTypes.get(nodeId) || null;
  }

  public getNodeData(nodeId: string): Record<string, unknown> {
    return this.nodeData.get(nodeId) || {};
  }

  public setNodeData(nodeId: string, data: Record<string, unknown>): void {
    this.nodeData.set(nodeId, data);
  }

  public setCubeChildData(
    cubeNodeId: string,
    faceNumber: number,
    childData: Record<string, unknown>
  ): void {
    if (faceNumber < 1 || faceNumber > 6) {
      throw new Error("Face number must be between 1 and 6");
    }

    const nodeType = this.nodeTypes.get(cubeNodeId);
    if (nodeType !== NodeType.CUBE) {
      throw new Error("Node must be of type CUBE to set cube child data");
    }

    const cubeData = this.nodeData.get(cubeNodeId) || {};
    if (!cubeData.cubeChildren) {
      this.initializeCubeChildren(cubeNodeId, NodeType.CUBE);
    }

    const cubeChildren = cubeData.cubeChildren as Record<string, unknown>;
    cubeChildren[`face${faceNumber}`] = childData;
    this.nodeData.set(cubeNodeId, cubeData);
  }

  public getCubeChildData(
    cubeNodeId: string,
    faceNumber: number
  ): Record<string, unknown> | null {
    if (faceNumber < 1 || faceNumber > 6) {
      throw new Error("Face number must be between 1 and 6");
    }

    const cubeData = this.nodeData.get(cubeNodeId) || {};
    const cubeChildren = cubeData.cubeChildren as Record<string, unknown>;

    if (!cubeChildren) {
      return null;
    }

    return (
      (cubeChildren[`face${faceNumber}`] as Record<string, unknown>) || null
    );
  }

  public getAllCubeChildren(
    cubeNodeId: string
  ): Record<string, Record<string, unknown> | null> {
    const cubeData = this.nodeData.get(cubeNodeId) || {};
    return (
      (cubeData.cubeChildren as Record<
        string,
        Record<string, unknown> | null
      >) || {}
    );
  }

  public getKonvaNode(nodeId: string) {
    return this.konvaNodes.get(nodeId);
  }

  public changeNodeType(nodeId: string, newType: NodeType): void {
    const node = this.konvaNodes.get(nodeId);

    if (!node) return;

    // Prevent changing root node type
    if (nodeId === this.rootId) return;

    const group = node.getGroup();
    const currentX = group.x();
    const currentY = group.y();
    const currentText = node.getText();

    // Remove old node
    node.remove();
    this.konvaNodes.delete(nodeId);

    const config = NODE_CONFIGS[newType];
    const truncatedText = this.formatNodeText(currentText);

    const newNode = new Node({
      x: currentX,
      y: currentY,
      text: truncatedText,
      isRoot: newType === NodeType.ROOT,
      layer: this.layer,
      customColor: config.color,
      onTextChange: (newText: string) =>
        this.handleNodeTextChange(nodeId, newText),
      onSizeChange: () => this.handleNodeSizeChange(nodeId),
      onDoubleClick: () => this.onNodeDoubleClick?.(nodeId),
      onRightClick: (x: number, y: number) =>
        this.onNodeRightClick?.(nodeId, x, y),
      onLinkClick:
        newType === NodeType.LINK
          ? () => this.onLinkClick?.(nodeId)
          : undefined,
      isLinkNode: newType === NodeType.LINK,
      isNewNode: false,
      nodeType: newType,
    });

    this.konvaNodes.set(nodeId, newNode);
    this.nodeTypes.set(nodeId, newType);

    const newGroup = newNode.getGroup();
    const rect = newGroup.findOne("Rect") as Konva.Rect;
    if (rect) {
      this.positioner.updateNodeDimensions(nodeId, rect.width(), rect.height());
    }

    // Restore proper interactions and connections
    this.setupNodeInteractions(nodeId);
    this.initializeCubeChildren(nodeId, newType);
  }

  public moveRootChildToOppositeSide(
    nodeId: string,
    dropX?: number,
    dropY?: number
  ): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (!nodePosition) {
      return;
    }

    if (nodePosition.level !== 1) {
      return;
    }

    const currentSide = this.positioner.getNodeSide(nodeId);
    if (!currentSide) {
      return;
    }

    const newSide = currentSide === "left" ? "right" : "left";

    this.updateNodeAndDescendantsSides(nodeId, newSide);

    if (dropX !== undefined && dropY !== undefined) {
      this.positionNodeOptimallyOnNewSide(nodeId, newSide, dropY);
    }

    this.positioner.repositionSiblings(this.rootId!, this.rootX, this.rootY);

    Array.from(this.konvaNodes.keys()).forEach((id) => {
      const position = this.positioner.getNodePosition(id);
      const node = this.konvaNodes.get(id);
      if (node && node.getGroup() && position) {
        this.animateToPosition(node, position);
      }
    });

    setTimeout(() => {
      this.connections.forEach((connection) => connection.destroy());
      this.connections.clear();

      this.updateAllConnections();
    }, 300);
  }

  public getCacheStats() {
    return this.connectionCache.getCacheStats();
  }

  private shouldSwitchSides(nodeId: string, dropX: number): boolean {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    const rootPosition = this.positioner.getNodePosition(this.rootId!);

    if (!nodePosition || !rootPosition) {
      return false;
    }

    const currentSide = nodePosition.side;
    const rootCenterX = rootPosition.x;

    const droppedOnLeftSide = dropX < rootCenterX;
    const droppedOnRightSide = dropX > rootCenterX;

    const shouldMoveToLeft = currentSide === "right" && droppedOnLeftSide;
    const shouldMoveToRight = currentSide === "left" && droppedOnRightSide;

    const threshold = 50;
    const distanceFromCenter = Math.abs(dropX - rootCenterX);

    if (distanceFromCenter < threshold) {
      return false;
    }

    return shouldMoveToLeft || shouldMoveToRight;
  }

  private positionNodeOptimallyOnNewSide(
    nodeId: string,
    newSide: "left" | "right",
    dropY: number
  ): void {
    if (!this.rootId) return;

    const allRootChildren = this.positioner.getChildren(this.rootId);
    const newSideSiblings = allRootChildren.filter((siblingId) => {
      if (siblingId === nodeId) return false;
      const siblingPosition = this.positioner.getNodePosition(siblingId);
      return siblingPosition && siblingPosition.side === newSide;
    });

    if (newSideSiblings.length === 0) {
      return;
    }

    let insertIndex = 0;
    let minDistance = Infinity;

    newSideSiblings.forEach((siblingId, index) => {
      const siblingPosition = this.positioner.getNodePosition(siblingId);
      if (!siblingPosition) return;

      const distance = Math.abs(dropY - siblingPosition.y);

      if (distance < minDistance) {
        minDistance = distance;

        if (dropY < siblingPosition.y) {
          insertIndex = index;
        } else {
          insertIndex = index + 1;
        }
      }
    });

    this.positioner.removeFromChildrenMap(this.rootId, nodeId);

    const updatedRootChildren = this.positioner.getChildren(this.rootId);

    const leftSideNodes = updatedRootChildren.filter((childId) => {
      const childPosition = this.positioner.getNodePosition(childId);
      return childPosition && childPosition.side === "left";
    });

    const rightSideNodes = updatedRootChildren.filter((childId) => {
      const childPosition = this.positioner.getNodePosition(childId);
      return childPosition && childPosition.side === "right";
    });

    if (newSide === "left") {
      leftSideNodes.splice(insertIndex, 0, nodeId);
    } else {
      rightSideNodes.splice(insertIndex, 0, nodeId);
    }

    const reorderedChildren = [...leftSideNodes, ...rightSideNodes];
    this.positioner.setChildrenArray(this.rootId, reorderedChildren);
  }

  public clearCaches(): void {
    this.connectionCache.clearCache();
  }

  public isAnyNodeEditing(): boolean {
    for (const [, node] of this.konvaNodes) {
      if (node.isCurrentlyEditing()) {
        return true;
      }
    }
    return false;
  }

  public removeNode(nodeId: string): void {
    // Prevent removing root node
    if (nodeId === this.rootId) return;

    const nodePosition = this.positioner.getNodePosition(nodeId);
    const parentId = nodePosition?.parentId;

    this.removeNodeRecursive(nodeId);

    if (parentId) {
      this.repositionSiblings(parentId);

      this.updateConnectionsSimple(parentId);
    }

    this.scheduleDraw();
  }

  private findNodeAtPosition(
    x: number,
    y: number,
    excludeNodeId?: string
  ): string | null {
    for (const [nodeId, node] of this.konvaNodes) {
      if (nodeId === excludeNodeId) continue;

      const group = node.getGroup();
      const rect = group.findOne("Rect") as Konva.Rect;
      if (!rect) continue;

      const nodeX = group.x();
      const nodeY = group.y();
      const nodeWidth = rect.width();
      const nodeHeight = rect.height();

      if (
        x >= nodeX &&
        x <= nodeX + nodeWidth &&
        y >= nodeY &&
        y <= nodeY + nodeHeight
      ) {
        return nodeId;
      }
    }
    return null;
  }

  private canReparent(sourceNodeId: string, targetNodeId: string): boolean {
    if (sourceNodeId === targetNodeId) return false;

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

    if (oldParentId) {
      this.positioner.removeFromChildrenMap(oldParentId, nodeId);

      const oldConnectionId = `${oldParentId}|${nodeId}`;
      const oldConnection = this.connections.get(oldConnectionId);
      if (oldConnection) {
        oldConnection.destroy();
        this.connections.delete(oldConnectionId);
      }
    }

    this.positioner.addChildAtEnd(newParentId, nodeId);

    nodePosition.parentId = newParentId;
    this.positioner.updateNodePosition(nodeId, nodePosition);

    const newParentSide = this.positioner.getNodeSide(newParentId);
    this.updateNodeAndDescendantsSides(nodeId, newParentSide || "right");

    this.updateNodeAndDescendantsLevels(nodeId);

    this.createConnectionFromVisualPositions(newParentId, nodeId);

    const updatedPositions = this.positioner.repositionSiblings(
      this.rootId!,
      this.rootX,
      this.rootY
    );

    let animationsRemaining = updatedPositions.length;

    updatedPositions.forEach((position) => {
      const positionNodeId = this.findNodeIdByPosition(position);
      if (positionNodeId) {
        const konvaNode = this.konvaNodes.get(positionNodeId);
        if (konvaNode) {
          this.animateToPositionWithCallback(konvaNode, position, () => {
            animationsRemaining--;
            if (animationsRemaining === 0) {
              this.connections.forEach((connection) => connection.destroy());
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

    if (animationsRemaining === 0) {
      this.connections.forEach((connection) => connection.destroy());
      this.connections.clear();
      this.updateAllConnections();
    }
  }

  private updateNodeAndDescendantsSides(
    nodeId: string,
    side: "left" | "right"
  ): void {
    this.positioner.updateNodeSide(nodeId, side);

    const children = this.positioner.getChildren(nodeId);
    children.forEach((childId) => {
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

    if (nodePosition.parentId) {
      const parentPosition = this.positioner.getNodePosition(
        nodePosition.parentId
      );
      if (parentPosition) {
        nodePosition.level = parentPosition.level + 1;
        this.positioner.updateNodePosition(nodeId, nodePosition);
      }
    }

    const children = this.positioner.getChildren(nodeId);
    children.forEach((childId) => {
      this.updateNodeAndDescendantsLevels(childId);
    });
  }

  private updateAllConnections(): void {
    this.konvaNodes.forEach((_, nodeId) => {
      const children = this.positioner.getChildren(nodeId);
      children.forEach((childId) => {
        this.createConnectionFromVisualPositions(nodeId, childId);
      });
    });

    this.layer.draw();
  }

  private createConnectionFromVisualPositions(
    parentId: string,
    childId: string
  ): void {
    const parentNode = this.konvaNodes.get(parentId);
    const childNode = this.konvaNodes.get(childId);

    if (!parentNode || !childNode) return;

    const parentGroup = parentNode.getGroup();
    const childGroup = childNode.getGroup();
    const parentRect = parentGroup.findOne("Rect") as Konva.Rect;
    const childRect = childGroup.findOne("Rect") as Konva.Rect;

    if (!parentRect || !childRect) return;

    const parentCenterX = parentGroup.x() + parentRect.width() / 2;
    const parentCenterY = parentGroup.y() + parentRect.height() / 2;
    const childCenterX = childGroup.x() + childRect.width() / 2;
    const childCenterY = childGroup.y() + childRect.height() / 2;

    const connectionId = `${parentId}|${childId}`;

    const connection = new Konva.Shape({
      sceneFunc: (context, shape) => {
        context.beginPath();
        context.moveTo(parentCenterX, parentCenterY);

        const controlX = parentCenterX;
        const controlY = childCenterY - (parentCenterY - childCenterY) * 0.5;

        context.quadraticCurveTo(
          controlX,
          controlY,
          childCenterX,
          childCenterY
        );

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
    children.forEach((childId) => {
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

      this.repositionDescendants(childId);
    });

    this.updateConnectionsSimple(parentId);
  }

  private throttledDragUpdate(nodeId: string, group: Konva.Group): void {
    this.scheduleDragConnectionUpdate(nodeId);

    const now = Date.now();
    if (now - this.highlightUpdateThrottle > 150) {
      this.highlightUpdateThrottle = now;

      const rect = group.findOne("Rect") as Konva.Rect;
      const centerX = group.x() + (rect ? rect.width() / 2 : 50);
      const centerY = group.y() + (rect ? rect.height() / 2 : 25);

      this.updateDropTargetHighlightingOptimized(nodeId, centerX, centerY);
    }
  }

  private scheduleDragConnectionUpdate(nodeId: string): void {
    if (this.connectionUpdatePending) return;

    this.connectionUpdatePending = true;

    requestAnimationFrame(() => {
      this.updateSingleNodeConnection(nodeId);
      this.connectionUpdatePending = false;
    });
  }

  private updateSingleNodeConnection(nodeId: string): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const connectionId = `${nodePosition.parentId}|${nodeId}`;
      this.updateConnectionPath(connectionId, nodePosition.parentId, nodeId);
    }

    const children = this.positioner.getChildren(nodeId);
    children.forEach((childId) => {
      const connectionId = `${nodeId}|${childId}`;
      this.updateConnectionPath(connectionId, nodeId, childId);
    });

    this.layer.draw();
  }

  private updateConnectionPath(
    connectionId: string,
    parentId: string,
    childId: string
  ): void {
    const oldConnection = this.connections.get(connectionId);
    if (!oldConnection) return;

    oldConnection.destroy();
    this.createConnectionFromVisualPositions(parentId, childId);
  }

  private updateDropTargetHighlightingOptimized(
    draggedNodeId: string,
    dragX: number,
    dragY: number
  ): void {
    const dropTargetId = this.findNodeAtPosition(dragX, dragY, draggedNodeId);
    const validTarget =
      dropTargetId && this.canReparent(draggedNodeId, dropTargetId)
        ? dropTargetId
        : null;

    if (this.lastDropTargetId !== validTarget) {
      if (this.lastDropTargetId) {
        const prevTargetNode = this.konvaNodes.get(this.lastDropTargetId);
        if (prevTargetNode) {
          prevTargetNode.setDropTarget(false);
        }
      }

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
    const node = this.konvaNodes.get(nodeId);
    if (!node) return;

    if (this.onNodeTextChange) {
      this.onNodeTextChange(nodeId, newText);
    }

    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      setTimeout(() => {
        this.repositionSiblings(nodePosition.parentId!);
        this.updateConnectionsSimple(nodePosition.parentId!);
      }, 50);
    }
  }

  private sizeChangeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  private handleNodeSizeChange(nodeId: string): void {
    this.updateSingleNodeConnectionImmediate(nodeId);

    const existingTimeout = this.sizeChangeTimeouts.get(nodeId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      const nodePosition = this.positioner.getNodePosition(nodeId);
      if (nodePosition && nodePosition.parentId) {
        const node = this.konvaNodes.get(nodeId);
        if (node) {
          const group = node.getGroup();
          const rect = group.findOne("Rect") as Konva.Rect;
          if (rect) {
            this.positioner.updateNodeDimensions(
              nodeId,
              rect.width(),
              rect.height()
            );
          }
        }

        this.repositionSiblings(nodePosition.parentId);
        this.updateConnectionsSimple(nodePosition.parentId);
      }

      this.sizeChangeTimeouts.delete(nodeId);
    }, 150);

    this.sizeChangeTimeouts.set(nodeId, timeout);
  }

  private updateSingleNodeConnectionImmediate(nodeId: string): void {
    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const connectionId = `${nodePosition.parentId}|${nodeId}`;
      this.updateConnectionPathImmediate(
        connectionId,
        nodePosition.parentId,
        nodeId
      );
    }

    const children = this.positioner.getChildren(nodeId);
    children.forEach((childId) => {
      const connectionId = `${nodeId}|${childId}`;
      this.updateConnectionPathImmediate(connectionId, nodeId, childId);
    });

    this.layer.draw();
  }

  private updateConnectionPathImmediate(
    connectionId: string,
    parentId: string,
    childId: string
  ): void {
    const oldConnection = this.connections.get(connectionId);
    if (!oldConnection) return;

    oldConnection.destroy();
    this.createConnectionFromVisualPositions(parentId, childId);
  }

  private removeNodeRecursive(nodeId: string): void {
    const children = [...this.positioner.getChildren(nodeId)];
    children.forEach((childId) => {
      this.removeNodeRecursive(childId);
    });

    const node = this.konvaNodes.get(nodeId);
    if (node) {
      node.remove();
      this.konvaNodes.delete(nodeId);
      this.nodeTypes.delete(nodeId);
      this.nodeData.delete(nodeId);
    }

    if (this.selectedNodeId === nodeId) {
      this.selectedNodeId = null;
      if (this.onNodeSelected) {
        this.onNodeSelected(null);
      }
    }

    const remainingChildren = this.positioner.getChildren(nodeId);
    remainingChildren.forEach((childId) => {
      const connectionId = `${nodeId}|${childId}`;
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.destroy();
        this.connections.delete(connectionId);
      }
    });

    const nodePosition = this.positioner.getNodePosition(nodeId);
    if (nodePosition && nodePosition.parentId) {
      const parentConnectionId = `${nodePosition.parentId}|${nodeId}`;
      const parentConnection = this.connections.get(parentConnectionId);
      if (parentConnection) {
        parentConnection.destroy();
        this.connections.delete(parentConnectionId);
      }

      this.positioner.removeFromChildrenMap(nodePosition.parentId, nodeId);
    }

    this.positioner.removeNode(nodeId);

    if (this.batchProcessor.isInBatchMode()) {
      this.batchProcessor.addOperation({
        type: "nodeRemove",
        nodeId,
        data: { childrenIds: [] },
      });
    }
  }

  public getTreeStructure(): TreeNodeData | null {
    if (!this.rootId) return null;

    return this.buildTreeNode(this.rootId);
  }

  private buildTreeNode(nodeId: string): TreeNodeData {
    const node = this.konvaNodes.get(nodeId);
    const position = this.positioner.getNodePosition(nodeId);
    const childrenIds = this.positioner.getChildren(nodeId);

    const children = childrenIds.map((childId) => this.buildTreeNode(childId));

    return {
      id: nodeId,
      text: node?.getText() || "",
      type: this.nodeTypes.get(nodeId) || NodeType.TASK,
      level: position?.level || 0,
      side: position?.side || "right",
      isSelected: nodeId === this.selectedNodeId,
      data: this.nodeData.get(nodeId) || {},
      children: children,
    };
  }
}
