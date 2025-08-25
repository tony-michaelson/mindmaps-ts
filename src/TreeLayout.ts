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

    // For container nodes (left-container, right-container), use zero width
    // since they are virtual positioning nodes with no visual representation
    const parentWidth = node.id.includes("-container")
      ? 0
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

    // Test: use identical calculation for both sides to verify symmetry logic
    const baseOffset = parentWidth / 2 + horizontalSpacing + maxChildWidth / 2;
    const horizontal =
      side === "left" ? -baseOffset : baseOffset;
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
      // Position right container at root's actual right edge from results
      const rootResult = results.find(r => r.nodeId === rootNode.id);
      const actualRootRightEdge = rootResult ? rootResult.x + rootResult.width / 2 : rootX + rootNode.width / 2;
      const rightStartX = actualRootRightEdge;
      const rightResults = this.calculateAbsolutePositions(
        rightLayout,
        rightStartX,
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

      // Position left container at root's actual left edge from results  
      const rootResult = results.find(r => r.nodeId === rootNode.id);
      const actualRootLeftEdge = rootResult ? rootResult.x - rootResult.width / 2 : rootX - rootNode.width / 2;
      const leftStartX = actualRootLeftEdge;
      const leftResults = this.calculateAbsolutePositions(
        leftLayout,
        leftStartX,
        rootY - LAYOUT_CONFIG.height / 2
      ).filter((r) => r.nodeId !== "left-container");

      results.push(...leftResults);
    }

    // Add debug lines to visualize spacing (temporary)
    console.log("=== DETAILED SPACING DEBUG ===");
    console.log("Root position:", rootX, "Root node width:", rootNode.width);
    console.log("Right container positioned at:", rootX + rootNode.width / 2);
    console.log("Left container positioned at:", rootX - rootNode.width / 2);
    
    const rootResult = results.find(r => r.nodeId === rootNode.id);
    if (rootResult) {
      const rootLeftEdge = rootResult.x - rootResult.width / 2;
      const rootRightEdge = rootResult.x + rootResult.width / 2;
      console.log("Root actual center:", rootResult.x, "Left edge:", rootLeftEdge, "Right edge:", rootRightEdge);
      
      results.forEach(result => {
        if (result.nodeId === rootNode.id) return;
        
        const childCenter = result.x;
        const childLeftEdge = result.x - result.width / 2;
        const childRightEdge = result.x + result.width / 2;
        
        // Determine if this is a left or right child
        const isRightChild = result.x > rootResult.x;
        
        if (isRightChild) {
          const actualSpacing = childLeftEdge - rootRightEdge;
          console.log(`RIGHT child ${result.nodeId}:`);
          console.log(`  Center: ${childCenter}, Left edge: ${childLeftEdge}, Right edge: ${childRightEdge}`);
          console.log(`  Width: ${result.width}, Spacing: ${actualSpacing.toFixed(2)}px (expected ${LAYOUT_CONFIG.horizontalSpacing}px)`);
        } else {
          const actualSpacing = rootLeftEdge - childRightEdge;
          console.log(`LEFT child ${result.nodeId}:`);
          console.log(`  Center: ${childCenter}, Left edge: ${childLeftEdge}, Right edge: ${childRightEdge}`);
          console.log(`  Width: ${result.width}, Spacing: ${actualSpacing.toFixed(2)}px (expected ${LAYOUT_CONFIG.horizontalSpacing}px)`);
        }
      });
    }

    return results;
  }
}
