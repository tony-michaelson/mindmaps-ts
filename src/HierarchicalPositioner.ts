import { NodePosition, LAYOUT_CONFIG } from "./NodePosition";
import { TreeLayoutCalculator, TreeNode, LayoutResult } from "./TreeLayout";
import { PerformanceUtils } from "./PerformanceUtils";

export class HierarchicalPositioner {
  private nodePositions: Map<string, NodePosition> = new Map();
  private childrenMap: Map<string, string[]> = new Map();
  private nodeSides: Map<string, "left" | "right"> = new Map();
  private layoutCalculator = new TreeLayoutCalculator();
  private nodeData: Map<string, { width: number; height: number }> = new Map();
  
  // Fast-path mode for large datasets - skips complex outline calculations
  private fastPathMode = false;
  private readonly FAST_PATH_THRESHOLD = 100; // Switch to fast path after 100 nodes

  calculateNodePosition(
    nodeId: string,
    parentId: string | null,
    side: "left" | "right",
    rootX: number,
    rootY: number
  ): NodePosition {
    // Use memoized calculation for position if possible
    const cachedPosition = PerformanceUtils.calculateLayoutPosition(
      nodeId,
      parentId,
      side,
      rootX,
      rootY,
      (this.childrenMap.get(parentId || '') || []).length,
      parentId ? (this.nodePositions.get(parentId)?.level || 0) + 1 : 0
    );

    // Store node dimensions for layout calculations
    this.nodeData.set(nodeId, { 
      width: LAYOUT_CONFIG.width, 
      height: LAYOUT_CONFIG.height 
    });

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
    const stackIndex = (this.childrenMap.get(parentId) || []).length;

    let nodeSide: "left" | "right";
    if (parentPos.level === 0) {
      nodeSide = side;
    } else {
      nodeSide = parentPos.side;
    }

    this.nodeSides.set(nodeId, nodeSide);

    // Use cached position if available, otherwise create temporary position
    const position: NodePosition = {
      x: cachedPosition.x || rootX, // Use cached or fallback
      y: cachedPosition.y || rootY, // Use cached or fallback  
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
    // Check if we should enable fast-path mode
    this.updateFastPathMode();
    
    // Use incremental updates instead of full recalculation
    return this.repositionSiblingsIncremental(parentId, rootX, rootY);
  }

  private updateFastPathMode(): void {
    const totalNodes = this.nodePositions.size;
    this.fastPathMode = totalNodes > this.FAST_PATH_THRESHOLD;
  }

  // Incremental repositioning - only affects siblings of the parent node
  private repositionSiblingsIncremental(
    parentId: string,
    rootX: number,
    rootY: number
  ): NodePosition[] {
    const children = this.childrenMap.get(parentId) || [];
    if (children.length === 0) return [];

    const parentPosition = this.nodePositions.get(parentId);
    if (!parentPosition) return [];

    const updatedPositions: NodePosition[] = [];
    const isRootParent = parentPosition.level === 0;

    // For root children, separate left and right sides
    if (isRootParent) {
      const leftChildren = children.filter(id => this.nodeSides.get(id) === "left");
      const rightChildren = children.filter(id => this.nodeSides.get(id) === "right");

      // Position left side children
      if (leftChildren.length > 0) {
        const leftPositions = this.positionSiblings(leftChildren, parentPosition, "left", rootX, rootY);
        updatedPositions.push(...leftPositions);
      }

      // Position right side children  
      if (rightChildren.length > 0) {
        const rightPositions = this.positionSiblings(rightChildren, parentPosition, "right", rootX, rootY);
        updatedPositions.push(...rightPositions);
      }
    } else {
      // For non-root parents, position all children on same side
      const positions = this.positionSiblings(children, parentPosition, parentPosition.side, rootX, rootY);
      updatedPositions.push(...positions);
    }

    return updatedPositions;
  }

  // Position a set of sibling nodes with simple vertical stacking
  private positionSiblings(
    siblings: string[],
    parentPos: NodePosition,
    side: "left" | "right",
    rootX: number,
    rootY: number
  ): NodePosition[] {
    if (siblings.length === 0) return [];

    const updatedPositions: NodePosition[] = [];
    
    if (this.fastPathMode) {
      return this.positionSiblingsFastPath(siblings, parentPos, side);
    } else {
      return this.positionSiblingsNormal(siblings, parentPos, side);
    }
  }

  // Fast path positioning - simple grid layout for performance
  private positionSiblingsFastPath(
    siblings: string[],
    parentPos: NodePosition,
    side: "left" | "right"
  ): NodePosition[] {
    const updatedPositions: NodePosition[] = [];
    const horizontal = LAYOUT_CONFIG.width + Math.min(LAYOUT_CONFIG.horizontalSpacing, 40); // Reduce spacing for compactness
    const vertical = Math.min(LAYOUT_CONFIG.verticalSpacing, 20); // Reduce vertical spacing

    // Calculate starting position - more compact layout
    const baseX = parentPos.x + (side === "right" ? horizontal : -horizontal);
    const totalHeight = siblings.length * (LAYOUT_CONFIG.height + vertical) - vertical;
    let currentY = parentPos.y - totalHeight / 2;

    // Position each sibling with minimal calculations
    siblings.forEach((childId, index) => {
      const position = this.nodePositions.get(childId);
      if (position) {
        position.x = baseX;
        position.y = currentY + LAYOUT_CONFIG.height / 2;
        position.level = parentPos.level + 1;
        position.stackIndex = index;
        position.side = side;
        
        updatedPositions.push(position);
        currentY += LAYOUT_CONFIG.height + vertical;
      }
    });

    return updatedPositions;
  }

  // Normal positioning with proper spacing
  private positionSiblingsNormal(
    siblings: string[],
    parentPos: NodePosition,
    side: "left" | "right"
  ): NodePosition[] {
    const updatedPositions: NodePosition[] = [];
    const horizontal = LAYOUT_CONFIG.width + LAYOUT_CONFIG.horizontalSpacing;
    const vertical = LAYOUT_CONFIG.verticalSpacing;

    // Calculate starting position
    const baseX = parentPos.x + (side === "right" ? horizontal : -horizontal);
    const totalHeight = siblings.length * (LAYOUT_CONFIG.height + vertical) - vertical;
    let currentY = parentPos.y - totalHeight / 2;

    // Position each sibling
    siblings.forEach((childId, index) => {
      const position = this.nodePositions.get(childId);
      if (position) {
        position.x = baseX;
        position.y = currentY + LAYOUT_CONFIG.height / 2;
        position.level = parentPos.level + 1;
        position.stackIndex = index;
        position.side = side;
        
        updatedPositions.push(position);
        currentY += LAYOUT_CONFIG.height + vertical;
      }
    });

    return updatedPositions;
  }

  // Recalculate entire layout using outline-based system
  private recalculateLayout(rootX: number, rootY: number): NodePosition[] {
    const rootId = this.findRootNode();
    if (!rootId) return [];

    // Build tree structures for left and right sides
    const leftNodes = this.buildTreeStructure(rootId, "left");
    const rightNodes = this.buildTreeStructure(rootId, "right");
    const rootNode = this.createTreeNode(rootId);

    // Calculate layout using outline-based algorithm
    const layoutResults = this.layoutCalculator.calculateLayout(
      leftNodes,
      rightNodes,
      rootNode,
      rootX,
      rootY
    );

    // Update stored positions
    const updatedPositions: NodePosition[] = [];
    layoutResults.forEach(result => {
      const nodePos = this.nodePositions.get(result.nodeId);
      if (nodePos) {
        // TreeLayout returns top-left coordinates, convert to center coordinates
        nodePos.x = result.x + result.width / 2;
        nodePos.y = result.y + result.height / 2;
        updatedPositions.push(nodePos);
      }
    });

    return updatedPositions;
  }

  // Build tree structure for outline calculation
  private buildTreeStructure(nodeId: string, side: "left" | "right"): TreeNode[] {
    const children = this.childrenMap.get(nodeId) || [];
    const sideChildren = children.filter(childId => {
      const childSide = this.nodeSides.get(childId);
      return childSide === side;
    });

    return sideChildren.map(childId => this.createTreeNode(childId));
  }

  // Create tree node for layout calculation
  private createTreeNode(nodeId: string): TreeNode {
    const nodeData = this.nodeData.get(nodeId) || { width: LAYOUT_CONFIG.width, height: LAYOUT_CONFIG.height };
    const children = this.childrenMap.get(nodeId) || [];
    
    return {
      id: nodeId,
      width: nodeData.width,
      height: nodeData.height,
      children: children.map(childId => this.createTreeNode(childId))
    };
  }

  // Find root node
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
    this.nodeData.delete(nodeId);
    
    // Update fast path mode after removal
    this.updateFastPathMode();
  }

  // Expose fast path status for debugging/monitoring
  isFastPathMode(): boolean {
    return this.fastPathMode;
  }

  // Get total node count
  getTotalNodeCount(): number {
    return this.nodePositions.size;
  }

  // Force enable/disable fast path mode (for testing)
  setFastPathMode(enabled: boolean): void {
    this.fastPathMode = enabled;
  }
}
