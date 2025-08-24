import { Outline } from "./Outline";
import { LAYOUT_CONFIG } from "./NodePosition";

export interface TreeNode {
  id: string;
  width: number;
  height: number;
  children: TreeNode[];
}

export interface LayoutResult {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outline: Outline;
}

export interface SubtreeLayout {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outline: Outline;
  deltaX: number;
  deltaY: number;
  children: SubtreeLayout[];
}

export class TreeLayoutCalculator {
  // Calculate layout for a single tree (either left or right side)
  calculateTree(
    node: TreeNode,
    margin: number = LAYOUT_CONFIG.verticalSpacing,
    side: "left" | "right" = "right"
  ): SubtreeLayout {
    // Base case: leaf node
    if (node.children.length === 0) {
      const outline = Outline.forRectangle(node.width, node.height);
      return {
        nodeId: node.id,
        x: 0,
        y: 0,
        width: node.width,
        height: node.height,
        outline,
        deltaX: 0,
        deltaY: 0,
        children: [],
      };
    }

    // Recursively calculate child layouts
    const childLayouts = node.children.map((child) =>
      this.calculateTree(child, margin, side)
    );

    // Position children with outline-based collision avoidance
    const positionedChildren = this.appendSubtrees(
      childLayouts,
      node.width,
      margin,
      side
    );

    // Create combined outline for this subtree
    const nodeOutline = Outline.forRectangle(node.width, node.height);
    const combinedOutline = this.combineNodeWithChildren(
      nodeOutline,
      positionedChildren,
      margin
    );

    return {
      nodeId: node.id,
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
      outline: combinedOutline,
      deltaX: 0,
      deltaY: 0,
      children: positionedChildren,
    };
  }

  // Append child subtrees with proper vertical spacing to avoid collisions
  private appendSubtrees(
    subtrees: SubtreeLayout[],
    parentWidth: number,
    margin: number,
    side: "left" | "right" = "right"
  ): SubtreeLayout[] {
    if (subtrees.length === 0) return [];

    // Calculate horizontal spacing based on the widest sibling node
    const maxChildWidth = Math.max(...subtrees.map((subtree) => subtree.width));
    const horizontalSpacing = Math.max(
      LAYOUT_CONFIG.horizontalSpacing,
      maxChildWidth * 0.3 + LAYOUT_CONFIG.horizontalSpacing
    );
    // For left side, position children to the left of parent
    const horizontal =
      side === "left"
        ? -(horizontalSpacing + parentWidth)
        : parentWidth + horizontalSpacing;
    const positioned: SubtreeLayout[] = [];


    if (subtrees.length === 1) {
      // Single child aligns with parent
      positioned.push({
        ...subtrees[0],
        deltaX: horizontal,
        deltaY: 0,
      });
      return positioned;
    }

    // Multiple children: calculate total height and center around parent
    let totalHeight = 0;

    // Calculate required height for all subtrees with spacing
    subtrees.forEach((subtree, index) => {
      totalHeight += subtree.outline.initialHeight();
      if (index < subtrees.length - 1) {
        totalHeight += margin; // Add spacing between subtrees
      }
    });

    // Start positioning from top, centered around parent
    let currentY = -totalHeight / 2;

    subtrees.forEach((subtree) => {
      const subtreeHeight = subtree.outline.initialHeight();
      const centerY = currentY + subtreeHeight / 2;

      positioned.push({
        ...subtree,
        deltaX: horizontal,
        deltaY: centerY,
      });

      currentY += subtreeHeight + margin;
    });

    return positioned;
  }

  // Combine node outline with its children outlines
  private combineNodeWithChildren(
    nodeOutline: Outline,
    children: SubtreeLayout[],
    margin: number
  ): Outline {
    if (children.length === 0) {
      return nodeOutline;
    }

    // Start with the node outline
    let combinedOutline = nodeOutline;

    // Combine with each child's outline
    children.forEach((child) => {
      const childOutline = child.outline.translate(child.deltaX, child.deltaY);
      combinedOutline = combinedOutline.combineHorizontally(childOutline, 0);
    });

    return combinedOutline;
  }

  // Calculate final absolute positions from relative deltas
  calculateAbsolutePositions(
    layout: SubtreeLayout,
    parentX: number = 0,
    parentY: number = 0
  ): LayoutResult[] {
    const results: LayoutResult[] = [];

    const absoluteX = parentX + layout.deltaX;
    const absoluteY = parentY + layout.deltaY;

    // Add this node
    results.push({
      nodeId: layout.nodeId,
      x: absoluteX,
      y: absoluteY,
      width: layout.width,
      height: layout.height,
      outline: layout.outline,
    });

    // Recursively process children
    layout.children.forEach((child) => {
      const childResults = this.calculateAbsolutePositions(
        child,
        absoluteX,
        absoluteY
      );
      results.push(...childResults);
    });

    return results;
  }

  // Main layout function that handles both sides
  calculateLayout(
    leftNodes: TreeNode[],
    rightNodes: TreeNode[],
    rootNode: TreeNode,
    rootX: number,
    rootY: number
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    const margin = LAYOUT_CONFIG.verticalSpacing;

    // Add root node
    results.push({
      nodeId: rootNode.id,
      x: rootX - rootNode.width / 2,
      y: rootY - rootNode.height / 2,
      width: rootNode.width,
      height: rootNode.height,
      outline: Outline.forRectangle(rootNode.width, rootNode.height),
    });

    // Calculate right side layout
    if (rightNodes.length > 0) {
      const rightTree: TreeNode = {
        id: "right-container",
        width: 0,
        height: 0,
        children: rightNodes,
      };

      const rightLayout = this.calculateTree(rightTree, margin, "right");
      const rightResults = this.calculateAbsolutePositions(
        rightLayout,
        rootX + rootNode.width / 2,
        rootY - LAYOUT_CONFIG.height / 2
      );

      // Filter out the container node, only add actual nodes
      results.push(
        ...rightResults.filter((r) => r.nodeId !== "right-container")
      );
    }

    // Calculate left side layout (mirror of right side)
    if (leftNodes.length > 0) {
      const leftTree: TreeNode = {
        id: "left-container",
        width: 0,
        height: 0,
        children: leftNodes,
      };

      const leftLayout = this.calculateTree(leftTree, margin, "left");

      // For left side, calculate positions then mirror to align right edges
      const tempLeftResults = this.calculateAbsolutePositions(
        leftLayout,
        0, // Calculate from origin first
        rootY - LAYOUT_CONFIG.height / 2
      ).filter((r) => r.nodeId !== "left-container");

      // Find the rightmost position of any left-side node (this will be our alignment axis)
      const maxRightEdge = Math.max(
        ...tempLeftResults.map((r) => r.x + r.width)
      );

      // Position all left nodes so their right edges align at the calculated distance from root
      const leftResults = tempLeftResults.map((result) => ({
        ...result,
        x: rootX - rootNode.width / 2 - (maxRightEdge - result.x) - 50, // Align right edges consistently
        y: result.y,
      }));

      results.push(...leftResults);
    }

    return results;
  }
}
