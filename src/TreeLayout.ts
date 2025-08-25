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
  calculateTree(
    node: TreeNode,
    margin: number = LAYOUT_CONFIG.verticalSpacing,
    side: "left" | "right" = "right"
  ): SubtreeLayout {
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

    const childLayouts = node.children.map((child) =>
      this.calculateTree(child, margin, side)
    );

    // For container nodes (left-container, right-container), use a default width
    // since they are virtual nodes with no visual representation
    const parentWidth = node.id.includes("-container")
      ? LAYOUT_CONFIG.width
      : node.width;

    const positionedChildren = this.appendSubtrees(
      childLayouts,
      parentWidth,
      margin,
      side
    );

    const nodeOutline = Outline.forRectangle(node.width, node.height);
    const combinedOutline = this.combineNodeWithChildren(
      nodeOutline,
      positionedChildren
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

  private appendSubtrees(
    subtrees: SubtreeLayout[],
    parentWidth: number,
    margin: number,
    side: "left" | "right" = "right"
  ): SubtreeLayout[] {
    if (subtrees.length === 0) return [];

    // Use fixed horizontal spacing for consistent edge-to-edge distances
    const horizontalSpacing = LAYOUT_CONFIG.horizontalSpacing;

    // Calculate positioning based on edge-to-edge spacing:
    // - Right side: parent right edge + spacing + half child width to get child center
    // - Left side: parent left edge - spacing - half child width to get child center
    const maxChildWidth = Math.max(...subtrees.map((subtree) => subtree.width));

    const horizontal =
      side === "left"
        ? -(parentWidth / 2 + horizontalSpacing + maxChildWidth / 2)
        : parentWidth / 2 + horizontalSpacing + maxChildWidth / 2;
    const positioned: SubtreeLayout[] = [];

    if (subtrees.length === 1) {
      positioned.push({
        ...subtrees[0],
        deltaX: horizontal,
        deltaY: 0,
      });
      return positioned;
    }

    let totalHeight = 0;

    subtrees.forEach((subtree, index) => {
      totalHeight += subtree.outline.initialHeight();
      if (index < subtrees.length - 1) {
        totalHeight += margin;
      }
    });

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

  private combineNodeWithChildren(
    nodeOutline: Outline,
    children: SubtreeLayout[]
  ): Outline {
    if (children.length === 0) {
      return nodeOutline;
    }

    let combinedOutline = nodeOutline;

    children.forEach((child) => {
      const childOutline = child.outline.translate(child.deltaX, child.deltaY);
      combinedOutline = combinedOutline.combineHorizontally(childOutline);
    });

    return combinedOutline;
  }

  calculateAbsolutePositions(
    layout: SubtreeLayout,
    parentX: number = 0,
    parentY: number = 0
  ): LayoutResult[] {
    const results: LayoutResult[] = [];

    const absoluteX = parentX + layout.deltaX;
    const absoluteY = parentY + layout.deltaY;

    results.push({
      nodeId: layout.nodeId,
      x: absoluteX,
      y: absoluteY,
      width: layout.width,
      height: layout.height,
      outline: layout.outline,
    });

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

  calculateLayout(
    leftNodes: TreeNode[],
    rightNodes: TreeNode[],
    rootNode: TreeNode,
    rootX: number,
    rootY: number
  ): LayoutResult[] {
    const results: LayoutResult[] = [];
    const margin = LAYOUT_CONFIG.verticalSpacing;

    results.push({
      nodeId: rootNode.id,
      x: rootX - rootNode.width / 2,
      y: rootY - rootNode.height / 2,
      width: rootNode.width,
      height: rootNode.height,
      outline: Outline.forRectangle(rootNode.width, rootNode.height),
    });

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
        rootX,
        rootY - LAYOUT_CONFIG.height / 2
      );

      results.push(
        ...rightResults.filter((r) => r.nodeId !== "right-container")
      );
    }

    if (leftNodes.length > 0) {
      const leftTree: TreeNode = {
        id: "left-container",
        width: 0,
        height: 0,
        children: leftNodes,
      };

      const leftLayout = this.calculateTree(leftTree, margin, "left");

      const tempLeftResults = this.calculateAbsolutePositions(
        leftLayout,
        0,
        rootY - LAYOUT_CONFIG.height / 2
      ).filter((r) => r.nodeId !== "left-container");

      const maxRightEdge = Math.max(
        ...tempLeftResults.map((r) => r.x + r.width)
      );

      const leftResults = tempLeftResults.map((result) => ({
        ...result,
        x: rootX - rootNode.width - (maxRightEdge - result.x), // hack to align better
        y: result.y,
      }));

      results.push(...leftResults);
    }

    return results;
  }
}
