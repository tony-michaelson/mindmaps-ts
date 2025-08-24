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

  public getNodeCount(): number {
    return this.controller.getNodeCount();
  }

  public getRootId(): string | null {
    return this.controller.getRootId();
  }

  public render(): void {
    this.layer.draw();
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
}
