import Konva from "konva";
import { MindmapController } from "./MindMapController";
import { NodeType } from "./NodePosition";

export enum ActionType {
  NODE_ADD = "Node::Add",
  NODE_DELETE = "Node::Delete", 
  NODE_TITLE_CHANGE = "Node::TitleChange",
  NODE_MOVE = "Node::Move",
  NODE_CLICK = "Node::Click",
  NODE_DOUBLE_CLICK = "Node::DblClick",
  NODE_RIGHT_CLICK = "Node::RightClick"
}

export type CallbackFunction = (nodeData: string) => void | Promise<void>;

export class MindMap {
  private stage: Konva.Stage;
  private layer: Konva.Layer;
  private controller: MindmapController;
  private centerX: number;
  private centerY: number;
  private selectedNodeId: string | null = null;
  private callbacks: Map<ActionType, CallbackFunction[]> = new Map();

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
    this.controller.onNodeSelected = async (nodeId: string | null) => {
      this.selectedNodeId = nodeId;
      if (nodeId) {
        await this.triggerCallbacks(ActionType.NODE_CLICK, nodeId);
      }
    };

    // Set up text change callback
    this.controller.onNodeTextChange = async (nodeId: string, newText: string) => {
      await this.triggerCallbacks(ActionType.NODE_TITLE_CHANGE, nodeId);
    };

    // Set up double-click callback
    this.controller.onNodeDoubleClick = async (nodeId: string) => {
      await this.triggerCallbacks(ActionType.NODE_DOUBLE_CLICK, nodeId);
    };

    // Set up right-click callback
    this.controller.onNodeRightClick = async (nodeId: string) => {
      await this.triggerCallbacks(ActionType.NODE_RIGHT_CLICK, nodeId);
    };

    this.initEvents();
    this.createInitialRoot();
  }

  private initEvents(): void {
    // Enable stage dragging for panning the mindmap
    this.stage.draggable(true);

    // Add click handler for stage to deselect nodes and finish editing
    this.stage.on('click', (e) => {
      // Only handle clicks on the stage itself, not on nodes
      if (e.target === this.stage) {
        this.controller.deselectAllNodes();
      }
    });

    // Add keyboard shortcuts
    this.initKeyboardShortcuts();
  }

  private initKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const isEditing = this.controller.isAnyNodeEditing();
      
      // Only handle shortcuts when no input is focused and no node is being edited
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        isEditing
      ) {
        return;
      }

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
          this.addSiblingToSelected("", NodeType.TASK);
          break;
        case "Tab":
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

  private async addNodeToSide(side: "left" | "right"): Promise<void> {
    const nodeText = ""; // Start with empty text for immediate editing
    const nodeType = this.getRandomNodeType();

    try {
      const nodeId = this.controller.addNodeToRoot(nodeText, nodeType, side);
      // Select the newly created node
      this.controller.selectNode(nodeId);
      this.layer.draw();
      await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
    } catch (error) {
    }
  }

  private async addChildToSelected(text: string = "", type: NodeType = NodeType.TASK): Promise<void> {
    if (this.selectedNodeId) {
      // Add child to the selected node
      try {
        const nodeId = this.controller.addNodeToExisting(this.selectedNodeId, text, type);
        // Select the newly created child node
        this.controller.selectNode(nodeId);
        this.layer.draw();
        await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
      } catch (error) {
        // Fallback to adding to root
        await this.addRootChild(text, type);
      }
    } else {
      // No node selected, add to root
      await this.addRootChild(text, type);
    }
  }

  private async addSiblingToSelected(text: string = "", type: NodeType = NodeType.TASK): Promise<void> {
    if (this.selectedNodeId) {
      // Find the parent of the selected node to add a sibling
      const parentId = this.controller.getParentId(this.selectedNodeId);
      
      if (parentId) {
        // Add sibling by adding to the parent
        try {
          const nodeId = this.controller.addNodeToExisting(parentId, text, type);
          // Select the newly created sibling node
          this.controller.selectNode(nodeId);
          this.layer.draw();
          await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
        } catch (error) {
          // Fallback to adding to root
          await this.addRootChild(text, type);
        }
      } else {
        // Selected node is root or has no parent, add to root side
        const rootChildren = this.controller.getRootChildren();
        const selectedChild = rootChildren.find(child => child.nodeId === this.selectedNodeId);
        const side = selectedChild?.side || "right";
        const nodeId = await this.addRootChild(text, type, side);
        // Select the newly created root child
        this.controller.selectNode(nodeId);
      }
    } else {
      // No node selected, add to root
      await this.addRootChild(text, type);
    }
  }

  private async deleteSelectedNode(): Promise<void> {
    const selectedNodeId = this.controller.getSelectedNodeId();
    const rootId = this.controller.getRootId();
    
    // Don't allow deleting the root node
    if (!selectedNodeId || selectedNodeId === rootId) {
      return;
    }
    
    // Trigger callback before removing the node
    await this.triggerCallbacks(ActionType.NODE_DELETE, selectedNodeId);
    
    // Remove the selected node
    this.controller.removeNode(selectedNodeId);
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

  public async addChildToNode(
    parentId: string,
    text: string = "",
    type: NodeType = NodeType.TASK
  ): Promise<string> {
    const nodeId = this.controller.addNodeToExisting(parentId, text, type);
    await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
    return nodeId;
  }

  public async addRootChild(
    text: string = "",
    type: NodeType = NodeType.TASK,
    side: "left" | "right" = "right"
  ): Promise<string> {
    const nodeId = this.controller.addNodeToRoot(text, type, side);
    await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
    return nodeId;
  }

  public async removeNode(nodeId: string): Promise<void> {
    await this.triggerCallbacks(ActionType.NODE_DELETE, nodeId);
    this.controller.removeNode(nodeId);
  }

  public async moveRootChildToOppositeSide(nodeId: string): Promise<void> {
    this.controller.moveRootChildToOppositeSide(nodeId);
    this.layer.draw();
    await this.triggerCallbacks(ActionType.NODE_MOVE, nodeId);
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

  public registerCallback(actionType: ActionType, callback: CallbackFunction): void {
    if (!this.callbacks.has(actionType)) {
      this.callbacks.set(actionType, []);
    }
    this.callbacks.get(actionType)!.push(callback);
  }

  public unregisterCallback(actionType: ActionType, callback: CallbackFunction): void {
    const callbacks = this.callbacks.get(actionType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private async triggerCallbacks(actionType: ActionType, nodeId: string): Promise<void> {
    const callbacks = this.callbacks.get(actionType);
    if (!callbacks || callbacks.length === 0) return;

    const nodeData = this.getNodeDataAsJson(nodeId);
    const promises = callbacks.map(callback => {
      try {
        const result = callback(nodeData);
        return Promise.resolve(result);
      } catch (error) {
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }

  private getNodeDataAsJson(nodeId: string): string {
    const treeStructure = this.controller.getTreeStructure();
    const nodeData = this.findNodeInTree(treeStructure, nodeId);
    return JSON.stringify(nodeData, null, 2);
  }

  private findNodeInTree(node: any, targetId: string): any {
    if (node.id === targetId) {
      return node;
    }
    
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this.findNodeInTree(child, targetId);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
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
    
    // Required fields
    const requiredFields = ['id', 'text', 'type', 'level', 'side', 'children'];
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
    
    if (typeof tree.type !== 'string') {
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

}
