import { NodePosition, LAYOUT_CONFIG } from "./NodePosition";

export class HierarchicalPositioner {
  private nodePositions: Map<string, NodePosition> = new Map();
  private childrenMap: Map<string, string[]> = new Map();
  private nodeSides: Map<string, "left" | "right"> = new Map();

  calculateNodePosition(
    nodeId: string,
    parentId: string | null,
    side: "left" | "right",
    rootX: number,
    rootY: number
  ): NodePosition {
    if (!parentId) {
      // Root node - always centered
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
    const siblings = this.childrenMap.get(parentId) || [];
    const stackIndex = siblings.length;

    let nodeSide: "left" | "right";
    let baseX: number;

    if (parentPos.level === 0) {
      // Parent is root - use provided side
      nodeSide = side;
      const direction = side === "right" ? 1 : -1;
      baseX = rootX + direction * LAYOUT_CONFIG.horizontalSpacing;
    } else {
      // Parent is not root - inherit parent's side and continue in same direction
      nodeSide = parentPos.side;
      const direction = nodeSide === "right" ? 1 : -1;
      baseX =
        rootX +
        direction * (parentPos.level + 1) * LAYOUT_CONFIG.horizontalSpacing;
    }

    // Store the side for this node
    this.nodeSides.set(nodeId, nodeSide);

    // Calculate vertical stacking
    const { nodeY } = this.calculateVerticalStack(
      siblings.length + 1,
      stackIndex,
      parentPos.y
    );

    const position: NodePosition = {
      x: baseX,
      y: nodeY,
      level: parentPos.level + 1,
      parentId,
      stackIndex,
      side: nodeSide,
    };

    this.nodePositions.set(nodeId, position);
    return position;
  }

  private calculateVerticalStack(
    totalNodes: number,
    nodeIndex: number,
    parentY: number
  ): { centerY: number; nodeY: number } {
    if (totalNodes === 1) {
      // Single node aligns with parent
      return { centerY: parentY, nodeY: parentY };
    }

    // Calculate the stack's center (should align with parent)
    const stackHeight = (totalNodes - 1) * LAYOUT_CONFIG.verticalSpacing;
    const stackTop = parentY - stackHeight / 2;

    // Position this node within the stack
    const nodeY = stackTop + nodeIndex * LAYOUT_CONFIG.verticalSpacing;

    return { centerY: parentY, nodeY };
  }

  repositionSiblings(
    parentId: string,
    rootX: number,
    rootY: number
  ): NodePosition[] {
    const siblings = this.childrenMap.get(parentId) || [];
    const parentPos = this.nodePositions.get(parentId)!;
    const updatedPositions: NodePosition[] = [];

    siblings.forEach((siblingId, index) => {
      const { nodeY } = this.calculateVerticalStack(
        siblings.length,
        index,
        parentPos.y
      );

      // Update position
      const siblingPos = this.nodePositions.get(siblingId)!;
      siblingPos.y = nodeY;
      siblingPos.stackIndex = index;

      updatedPositions.push(siblingPos);
    });

    return updatedPositions;
  }

  addToChildrenMap(parentId: string, childId: string): void {
    const siblings = this.childrenMap.get(parentId) || [];
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

  removeNode(nodeId: string): void {
    this.nodePositions.delete(nodeId);
    this.nodeSides.delete(nodeId);
    this.childrenMap.delete(nodeId);
  }
}
