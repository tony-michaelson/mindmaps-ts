import { NodePosition, LAYOUT_CONFIG } from "./NodePosition";
import { TreeLayoutCalculator, TreeNode } from "./TreeLayout";

export class HierarchicalPositioner {
  private nodePositions: Map<string, NodePosition> = new Map();
  private childrenMap: Map<string, string[]> = new Map();
  private nodeSides: Map<string, "left" | "right"> = new Map();
  private layoutCalculator = new TreeLayoutCalculator();
  private nodeData: Map<string, { width: number; height: number }> = new Map();

  calculateNodePosition(
    nodeId: string,
    parentId: string | null,
    side: "left" | "right",
    rootX: number,
    rootY: number
  ): NodePosition {
    if (!this.nodeData.has(nodeId)) {
      this.nodeData.set(nodeId, {
        width: LAYOUT_CONFIG.width,
        height: LAYOUT_CONFIG.height,
      });
    }

    if (!parentId) {
      const position: NodePosition = {
        x: rootX,
        y: rootY,
        level: 0,
        stackIndex: 0,
        side: "right",
      };
      this.nodePositions.set(nodeId, position);
      this.nodeSides.set(nodeId, "right");
      return position;
    }

    const parentPos = this.nodePositions.get(parentId)!;
    const stackIndex = (this.childrenMap.get(parentId) || []).length;

    let nodeSide: "left" | "right";
    if (parentPos.level === 0) {
      nodeSide = side;
    } else {
      nodeSide = parentPos.side;
    }

    this.nodeSides.set(nodeId, nodeSide);

    const position: NodePosition = {
      x: parentPos.x,
      y: parentPos.y,
      level: parentPos.level + 1,
      parentId,
      stackIndex,
      side: nodeSide,
    };

    this.nodePositions.set(nodeId, position);
    return position;
  }

  repositionSiblings(
    parentId: string,
    rootX: number,
    rootY: number
  ): NodePosition[] {
    return this.recalculateLayout(rootX, rootY);
  }

  private recalculateLayout(rootX: number, rootY: number): NodePosition[] {
    const rootId = this.findRootNode();
    if (!rootId) return [];

    const leftNodes = this.buildTreeStructure(rootId, "left");
    const rightNodes = this.buildTreeStructure(rootId, "right");
    const rootNode = this.createTreeNode(rootId);

    const layoutResults = this.layoutCalculator.calculateLayout(
      leftNodes,
      rightNodes,
      rootNode,
      rootX,
      rootY
    );

    const updatedPositions: NodePosition[] = [];
    layoutResults.forEach((result) => {
      const nodePos = this.nodePositions.get(result.nodeId);
      if (nodePos) {
        nodePos.x = result.x;
        nodePos.y = result.y;
        updatedPositions.push(nodePos);
      }
    });

    return updatedPositions;
  }

  private buildTreeStructure(
    nodeId: string,
    side: "left" | "right"
  ): TreeNode[] {
    const children = this.childrenMap.get(nodeId) || [];
    const sideChildren = children.filter((childId) => {
      const childSide = this.nodeSides.get(childId);
      return childSide === side;
    });

    return sideChildren.map((childId) => this.createTreeNode(childId, side));
  }

  private createTreeNode(
    nodeId: string,
    filterBySide?: "left" | "right"
  ): TreeNode {
    const nodeData = this.nodeData.get(nodeId) || {
      width: LAYOUT_CONFIG.width,
      height: LAYOUT_CONFIG.height,
    };
    let children = this.childrenMap.get(nodeId) || [];

    if (filterBySide) {
      children = children.filter((childId) => {
        const childSide = this.nodeSides.get(childId);
        return childSide === filterBySide;
      });
    }

    return {
      id: nodeId,
      width: nodeData.width,
      height: nodeData.height,
      children: children.map((childId) =>
        this.createTreeNode(childId, filterBySide)
      ),
    };
  }

  private findRootNode(): string | null {
    for (const [nodeId, position] of this.nodePositions) {
      if (position.level === 0) {
        return nodeId;
      }
    }
    return null;
  }

  addToChildrenMap(parentId: string, childId: string): void {
    const siblings = this.childrenMap.get(parentId) || [];
    siblings.push(childId);
    this.childrenMap.set(parentId, siblings);
  }

  addChildAtEnd(parentId: string, childId: string): void {
    const siblings = this.childrenMap.get(parentId) || [];

    const existingIndex = siblings.indexOf(childId);
    if (existingIndex > -1) {
      siblings.splice(existingIndex, 1);
    }

    siblings.push(childId);
    this.childrenMap.set(parentId, siblings);
  }

  removeFromChildrenMap(parentId: string, childId: string): void {
    const siblings = this.childrenMap.get(parentId) || [];
    const index = siblings.indexOf(childId);
    if (index > -1) {
      siblings.splice(index, 1);
      this.childrenMap.set(parentId, siblings);
    }
  }

  getNodePosition(nodeId: string): NodePosition | undefined {
    return this.nodePositions.get(nodeId);
  }

  getNodeSide(nodeId: string): "left" | "right" | undefined {
    return this.nodeSides.get(nodeId);
  }

  getChildren(nodeId: string): string[] {
    return this.childrenMap.get(nodeId) || [];
  }

  setChildrenArray(parentId: string, children: string[]): void {
    this.childrenMap.set(parentId, children);
  }

  updateNodePosition(nodeId: string, position: NodePosition): void {
    this.nodePositions.set(nodeId, position);
    if (position.side) {
      this.nodeSides.set(nodeId, position.side);
    }
  }

  updateNodeSide(nodeId: string, side: "left" | "right"): void {
    this.nodeSides.set(nodeId, side);

    const position = this.nodePositions.get(nodeId);
    if (position) {
      position.side = side;
      this.nodePositions.set(nodeId, position);
    }
  }

  removeNode(nodeId: string): void {
    this.nodePositions.delete(nodeId);
    this.nodeSides.delete(nodeId);
    this.childrenMap.delete(nodeId);
    this.nodeData.delete(nodeId);
  }

  updateNodeDimensions(nodeId: string, width: number, height: number): void {
    this.nodeData.set(nodeId, { width, height });
  }
}
