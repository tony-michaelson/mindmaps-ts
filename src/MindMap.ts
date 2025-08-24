import Konva from "konva";
import { MindmapController } from "./MindMapController";
import { NodeType } from "./NodePosition";

export class MindMap {
  private stage: Konva.Stage;
  private layer: Konva.Layer;
  private controller: MindmapController;
  private centerX: number;
  private centerY: number;
  private selectedNodeId: string | null = null;

  constructor(containerId: string, width: number, height: number) {
    this.stage = new Konva.Stage({
      container: containerId,
      width,
      height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // Calculate center position
    this.centerX = width / 2;
    this.centerY = height / 2;

    // Initialize controller
    this.controller = new MindmapController(
      this.layer,
      this.centerX,
      this.centerY
    );

    // Set up selection callback
    this.controller.onNodeSelected = (nodeId: string | null) => {
      this.selectedNodeId = nodeId;
    };

    this.initEvents();
    this.createInitialRoot();
  }

  private initEvents(): void {
    // Enable stage dragging for panning the mindmap
    this.stage.draggable(true);

    // Add keyboard shortcuts
    this.initKeyboardShortcuts();
  }

  private initKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const isEditing = this.controller.isAnyNodeEditing();
      // console.log('🎮 MindMap keydown:', e.key, 'isEditing:', isEditing);
      
      // Only handle shortcuts when no input is focused and no node is being edited
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        isEditing
      ) {
        // console.log('🚫 MindMap skipping key handling - input focused or node editing');
        return;
      }

      // console.log('✅ MindMap handling key:', e.key);
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          this.addNodeToSide("right");
          break;
        case "ArrowLeft":
          e.preventDefault();
          this.addNodeToSide("left");
          break;
        case "Enter":
          e.preventDefault();
          this.addChildToSelected("", NodeType.TASK);
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          this.deleteSelectedNode();
          break;
      }
    });
  }

  private createInitialRoot(): void {
    this.controller.createRootNode("Main Topic");
    this.layer.draw();
  }

  private addNodeToSide(side: "left" | "right"): void {
    const nodeText = ""; // Start with empty text for immediate editing
    const nodeType = this.getRandomNodeType();

    try {
      this.controller.addNodeToRoot(nodeText, nodeType, side);
      this.layer.draw();
    } catch (error) {
      console.error("Failed to add node:", error);
    }
  }

  private addChildToSelected(text: string = "", type: NodeType = NodeType.TASK): void {
    if (this.selectedNodeId) {
      // Add child to the selected node
      try {
        this.controller.addNodeToExisting(this.selectedNodeId, text, type);
        this.layer.draw();
      } catch (error) {
        console.error("Failed to add child to selected node:", error);
        // Fallback to adding to root
        this.addRootChild(text, type);
      }
    } else {
      // No node selected, add to root
      this.addRootChild(text, type);
    }
  }

  private deleteSelectedNode(): void {
    const selectedNodeId = this.controller.getSelectedNodeId();
    const rootId = this.controller.getRootId();
    
    // Don't allow deleting the root node
    if (!selectedNodeId || selectedNodeId === rootId) {
      console.log("Cannot delete root node or no node selected");
      return;
    }
    
    // Remove the selected node
    this.controller.removeNode(selectedNodeId);
    console.log(`Deleted node: ${selectedNodeId}`);
  }

  private getNodeText(): string {
    // For demo purposes, generate random text
    const topics = [
      "Research",
      "Design",
      "Development",
      "Testing",
      "Deployment",
      "Planning",
      "Analysis",
      "Implementation",
      "Review",
      "Documentation",
      "Marketing",
      "Sales",
      "Support",
      "Training",
      "Maintenance",
    ];

    return topics[Math.floor(Math.random() * topics.length)];
  }

  private getRandomNodeType(): NodeType {
    const types = [
      NodeType.TASK,
      NodeType.IDEA,
      NodeType.RESOURCE,
      NodeType.DEADLINE,
    ];
    return types[Math.floor(Math.random() * types.length)];
  }

  // Public API methods
  public createRoot(text: string): string {
    return this.controller.createRootNode(text);
  }

  public addRootNode(text: string): string {
    return this.controller.createRootNode(text);
  }

  public addChildToNode(
    parentId: string,
    text: string = "",
    type: NodeType = NodeType.TASK
  ): string {
    return this.controller.addNodeToExisting(parentId, text, type);
  }

  public addRootChild(
    text: string = "",
    type: NodeType = NodeType.TASK,
    side: "left" | "right" = "right"
  ): string {
    return this.controller.addNodeToRoot(text, type, side);
  }

  public removeNode(nodeId: string): void {
    this.controller.removeNode(nodeId);
  }

  public moveRootChildToOppositeSide(nodeId: string): void {
    this.controller.moveRootChildToOppositeSide(nodeId);
    this.layer.draw();
  }

  public getNodeCount(): number {
    return this.controller.getNodeCount();
  }

  public getRootId(): string | null {
    return this.controller.getRootId();
  }

  public getRootChildren(): Array<{nodeId: string, side: "left" | "right", text: string}> {
    return this.controller.getRootChildren();
  }

  public render(): void {
    this.layer.draw();
  }

  public clear(): void {
    this.controller.clear();
    this.selectedNodeId = null;
  }

  // Utility methods for external control
  public getStage(): Konva.Stage {
    return this.stage;
  }

  public getLayer(): Konva.Layer {
    return this.layer;
  }

  public getController(): MindmapController {
    return this.controller;
  }

  public exportToJson(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      tree: this.controller.getTreeStructure()
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  public importFromJson(jsonString: string): void {
    try {
      const importData = JSON.parse(jsonString);
      
      // Validate the import data structure
      if (!importData || typeof importData !== 'object') {
        throw new Error('Invalid JSON format: Expected object');
      }
      
      if (!importData.tree) {
        throw new Error('Invalid JSON format: Missing tree data');
      }
      
      // Validate tree structure
      this.validateTreeStructure(importData.tree);
      
      // Add missing type information for legacy compatibility
      this.addMissingTypeInfo(importData.tree);
      
      // Import the tree
      this.controller.importFromTreeStructure(importData.tree);
      
      // Redraw the layer
      this.layer.draw();
      
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Import failed: ${error.message}`);
      } else {
        throw new Error('Import failed: Unknown error');
      }
    }
  }

  private validateTreeStructure(tree: any): void {
    if (!tree || typeof tree !== 'object') {
      throw new Error('Invalid tree structure: Expected object');
    }
    
    // Required fields (type is optional for legacy compatibility)
    const requiredFields = ['id', 'text', 'level', 'side', 'children'];
    for (const field of requiredFields) {
      if (!(field in tree)) {
        throw new Error(`Invalid tree structure: Missing field '${field}'`);
      }
    }
    
    if (typeof tree.id !== 'string') {
      throw new Error('Invalid tree structure: id must be a string');
    }
    
    if (typeof tree.text !== 'string') {
      throw new Error('Invalid tree structure: text must be a string');
    }
    
    // Type is optional - will be inferred if missing
    if ('type' in tree && typeof tree.type !== 'string') {
      throw new Error('Invalid tree structure: type must be a string');
    }
    
    if (!Array.isArray(tree.children)) {
      throw new Error('Invalid tree structure: children must be an array');
    }
    
    // Recursively validate children
    tree.children.forEach((child: any, index: number) => {
      try {
        this.validateTreeStructure(child);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Invalid tree structure in child ${index}: ${error.message}`);
        }
        throw error;
      }
    });
  }

  private addMissingTypeInfo(tree: any): void {
    // Infer type if missing
    if (!tree.type) {
      if (tree.level === 0) {
        // Root node
        tree.type = NodeType.ROOT;
      } else {
        // Default to TASK for non-root nodes
        tree.type = NodeType.TASK;
      }
    }
    
    // Recursively process children
    if (tree.children && Array.isArray(tree.children)) {
      tree.children.forEach((child: any) => {
        this.addMissingTypeInfo(child);
      });
    }
  }
}
