import Konva from "konva";
import { MindmapController } from "./MindMapController";
import { NodeType } from "../types/NodePosition";
import { ContextMenu, MenuActionHandler, MenuContext } from "../ui/ContextMenu";

export enum ActionType {
  NODE_ADD = "Node::Add",
  NODE_DELETE = "Node::Delete",
  NODE_TITLE_CHANGE = "Node::TitleChange",
  NODE_MOVE = "Node::Move",
  NODE_CLICK = "Node::Click",
  NODE_DOUBLE_CLICK = "Node::DblClick",
  NODE_RIGHT_CLICK = "Node::RightClick",
}

export type CallbackFunction = (nodeData: string) => void | Promise<void>;
export type LinkCallback = (nodeId: string, data: Record<string, unknown>) => void | Promise<void>;

export class MindMap {
  private stage: Konva.Stage;
  private layer: Konva.Layer;
  private controller: MindmapController;
  private centerX: number;
  private centerY: number;
  private selectedNodeId: string | null = null;
  private callbacks: Map<ActionType, CallbackFunction[]> = new Map();
  private defaultNodeType: NodeType = NodeType.TASK;
  private contextMenu: ContextMenu;
  private linkCallback: LinkCallback;

  constructor(containerId: string, width: number, height: number) {
    this.stage = new Konva.Stage({
      container: containerId,
      width,
      height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.centerX = width / 2;
    this.centerY = height / 2;

    this.controller = new MindmapController(
      this.layer,
      this.centerX,
      this.centerY
    );

    this.contextMenu = new ContextMenu(this.handleMenuAction.bind(this));

    // Set default link callback that opens URLs in new tab
    this.linkCallback = async (nodeId: string, data: Record<string, unknown>) => {
      if (data.url && typeof data.url === 'string') {
        window.open(data.url, '_blank');
      }
    };

    this.controller.onNodeSelected = async (nodeId: string | null) => {
      this.selectedNodeId = nodeId;
      if (nodeId) {
        await this.triggerCallbacks(ActionType.NODE_CLICK, nodeId);
      }
    };

    this.controller.onNodeTextChange = async (nodeId: string) => {
      await this.triggerCallbacks(ActionType.NODE_TITLE_CHANGE, nodeId);
    };

    this.controller.onNodeDoubleClick = async (nodeId: string) => {
      await this.triggerCallbacks(ActionType.NODE_DOUBLE_CLICK, nodeId);
    };

    this.controller.onNodeRightClick = async (
      nodeId: string,
      x: number,
      y: number
    ) => {
      await this.triggerCallbacks(ActionType.NODE_RIGHT_CLICK, nodeId);
      this.showContextMenu(nodeId, x, y);
    };

    this.controller.onLinkClick = async (nodeId: string) => {
      const nodeData = this.controller.getNodeData(nodeId);
      await this.linkCallback(nodeId, nodeData);
    };

    this.initEvents();
    this.createInitialRoot();
  }

  private initEvents(): void {
    this.stage.draggable(true);

    this.stage.on("click", (e) => {
      if (e.target === this.stage) {
        this.controller.deselectAllNodes();
      }
    });

    this.initKeyboardShortcuts();
  }

  private initKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const isEditing = this.controller.isAnyNodeEditing();
      const activeElement = document.activeElement;
      const isInputFocused = activeElement?.tagName === "INPUT" || 
                            activeElement?.tagName === "TEXTAREA" ||
                            activeElement?.contentEditable === "true";

      if (isInputFocused || isEditing) {
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
          this.addSiblingToSelected("");
          break;
        case "Tab":
          e.preventDefault();
          this.addChildToSelected("");
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
    const nodeText = "";
    const nodeType = this.defaultNodeType;

    try {
      const nodeId = this.controller.addNodeToRoot(nodeText, nodeType, side);

      this.controller.selectNode(nodeId);
      this.layer.draw();
      await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
    } catch {
      // Ignore errors during node addition
    }
  }

  private async addChildToSelected(
    text: string = "",
    type?: NodeType
  ): Promise<void> {
    const nodeType = type || this.defaultNodeType;
    if (this.selectedNodeId) {
      try {
        const nodeId = this.controller.addNodeToExisting(
          this.selectedNodeId,
          text,
          nodeType
        );

        this.controller.selectNode(nodeId);
        this.layer.draw();
        await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
      } catch {
        await this.addRootChild(text, nodeType);
      }
    } else {
      await this.addRootChild(text, nodeType);
    }
  }

  private async addSiblingToSelected(
    text: string = "",
    type?: NodeType
  ): Promise<void> {
    const nodeType = type || this.defaultNodeType;
    if (this.selectedNodeId) {
      const parentId = this.controller.getParentId(this.selectedNodeId);

      if (parentId) {
        try {
          const nodeId = this.controller.addNodeToExisting(
            parentId,
            text,
            nodeType
          );

          this.controller.selectNode(nodeId);
          this.layer.draw();
          await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
        } catch {
          await this.addRootChild(text, nodeType);
        }
      } else {
        const rootChildren = this.controller.getRootChildren();
        const selectedChild = rootChildren.find(
          (child) => child.nodeId === this.selectedNodeId
        );
        const side = selectedChild?.side || "right";
        const nodeId = await this.addRootChild(text, nodeType, side);

        this.controller.selectNode(nodeId);
      }
    } else {
      await this.addRootChild(text, nodeType);
    }
  }

  private async deleteSelectedNode(): Promise<void> {
    const selectedNodeId = this.controller.getSelectedNodeId();
    const rootId = this.controller.getRootId();

    if (!selectedNodeId || selectedNodeId === rootId) {
      return;
    }

    await this.triggerCallbacks(ActionType.NODE_DELETE, selectedNodeId);

    this.controller.removeNode(selectedNodeId);
  }

  public createRoot(text: string, data: Record<string, unknown> = {}): string {
    return this.controller.createRootNode(text, data);
  }

  public async addChildToNode(
    parentId: string,
    text: string = "",
    type?: NodeType,
    data: Record<string, unknown> = {}
  ): Promise<string> {
    const nodeType = type || this.defaultNodeType;
    const nodeId = this.controller.addNodeToExisting(parentId, text, nodeType, data);
    await this.triggerCallbacks(ActionType.NODE_ADD, nodeId);
    return nodeId;
  }

  public async addRootChild(
    text: string = "",
    type?: NodeType,
    side: "left" | "right" = "right",
    data: Record<string, unknown> = {}
  ): Promise<string> {
    const nodeType = type || this.defaultNodeType;
    const nodeId = this.controller.addNodeToRoot(text, nodeType, side, data);
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

  public getNodeData(nodeId: string): Record<string, unknown> {
    return this.controller.getNodeData(nodeId);
  }

  public setNodeData(nodeId: string, data: Record<string, unknown>): void {
    this.controller.setNodeData(nodeId, data);
  }

  public setCubeChildData(cubeNodeId: string, faceNumber: number, childData: Record<string, unknown>): void {
    this.controller.setCubeChildData(cubeNodeId, faceNumber, childData);
  }

  public getCubeChildData(cubeNodeId: string, faceNumber: number): Record<string, unknown> | null {
    return this.controller.getCubeChildData(cubeNodeId, faceNumber);
  }

  public getAllCubeChildren(cubeNodeId: string): Record<string, Record<string, unknown> | null> {
    return this.controller.getAllCubeChildren(cubeNodeId);
  }

  public getRootId(): string | null {
    return this.controller.getRootId();
  }

  public getRootChildren(): Array<{
    nodeId: string;
    side: "left" | "right";
    text: string;
  }> {
    return this.controller.getRootChildren();
  }

  public render(): void {
    this.layer.draw();
  }

  public clear(): void {
    this.controller.clear();
    this.selectedNodeId = null;
  }

  public getStage(): Konva.Stage {
    return this.stage;
  }

  public getLayer(): Konva.Layer {
    return this.layer;
  }

  public getController(): MindmapController {
    return this.controller;
  }

  public setDefaultNodeType(nodeType: NodeType): void {
    this.defaultNodeType = nodeType;
  }

  public setLinkCallback(callback: LinkCallback): void {
    this.linkCallback = callback;
  }

  public getDefaultNodeType(): NodeType {
    return this.defaultNodeType;
  }

  public registerCallback(
    actionType: ActionType,
    callback: CallbackFunction
  ): void {
    if (!this.callbacks.has(actionType)) {
      this.callbacks.set(actionType, []);
    }
    this.callbacks.get(actionType)!.push(callback);
  }

  public unregisterCallback(
    actionType: ActionType,
    callback: CallbackFunction
  ): void {
    const callbacks = this.callbacks.get(actionType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private async triggerCallbacks(
    actionType: ActionType,
    nodeId: string
  ): Promise<void> {
    const callbacks = this.callbacks.get(actionType);
    if (!callbacks || callbacks.length === 0) return;

    const nodeData = this.getNodeDataAsJson(nodeId);
    const promises = callbacks.map((callback) => {
      try {
        const result = callback(nodeData);
        return Promise.resolve(result);
      } catch {
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }

  private showContextMenu(nodeId: string, x: number, y: number): void {
    const nodeText = this.controller.getNodeText(nodeId) || "";
    const nodeType = this.controller.getNodeType(nodeId) || NodeType.TASK;
    const rootChildren = this.controller.getRootChildren();
    const isRootChild = rootChildren.some((child) => child.nodeId === nodeId);
    const rootId = this.controller.getRootId();
    const canMoveToOppositeSide = isRootChild && nodeId !== rootId;

    const context: MenuContext = {
      nodeId,
      nodeText,
      nodeType,
      isRootChild,
      canMoveToOppositeSide,
      isRoot: nodeId === rootId,
    };

    this.contextMenu.show({ x, y }, context);
  }

  private handleMenuAction: MenuActionHandler = async (
    action: string,
    nodeId: string,
    data?: Record<string, unknown>
  ) => {
    switch (action) {
      case "edit": {
        const node = this.controller.getKonvaNode(nodeId);
        if (node) {
          node.startEditing();
        }
        break;
      }

      case "type-task":
      case "type-idea":
      case "type-resource":
      case "type-deadline":
      case "type-cube":
        if (data?.type) {
          this.controller.changeNodeType(nodeId, data.type);
          this.layer.draw();
        }
        break;

      case "add-child": {
        this.controller.selectNode(nodeId);
        await this.addChildToSelected("");
        break;
      }

      case "add-sibling": {
        this.controller.selectNode(nodeId);
        await this.addSiblingToSelected("");
        break;
      }

      case "move-opposite":
        this.moveRootChildToOppositeSide(nodeId);
        break;

      case "delete":
        this.removeNode(nodeId);
        break;
    }
  };

  private getNodeDataAsJson(nodeId: string): string {
    const treeStructure = this.controller.getTreeStructure();
    const nodeData = this.findNodeInTree(treeStructure, nodeId);
    return JSON.stringify(nodeData, null, 2);
  }

  private findNodeInTree(node: Record<string, unknown>, targetId: string): Record<string, unknown> | null {
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
      defaultNodeType: this.defaultNodeType,
      tree: this.controller.getTreeStructure(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  public importFromJson(jsonString: string): void {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData || typeof importData !== "object") {
        throw new Error("Invalid JSON format: Expected object");
      }

      if (!importData.tree) {
        throw new Error("Invalid JSON format: Missing tree data");
      }

      if (
        importData.defaultNodeType &&
        Object.values(NodeType).includes(importData.defaultNodeType)
      ) {
        this.defaultNodeType = importData.defaultNodeType;
      }

      this.validateTreeStructure(importData.tree);

      this.controller.importFromTreeStructure(importData.tree);

      this.layer.draw();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Import failed: ${error.message}`);
      } else {
        throw new Error("Import failed: Unknown error");
      }
    }
  }

  private validateTreeStructure(tree: Record<string, unknown>): void {
    if (!tree || typeof tree !== "object") {
      throw new Error("Invalid tree structure: Expected object");
    }

    const requiredFields = ["id", "text", "type", "level", "side", "children"];
    for (const field of requiredFields) {
      if (!(field in tree)) {
        throw new Error(`Invalid tree structure: Missing field '${field}'`);
      }
    }

    if (typeof tree.id !== "string") {
      throw new Error("Invalid tree structure: id must be a string");
    }

    if (typeof tree.text !== "string") {
      throw new Error("Invalid tree structure: text must be a string");
    }

    if (typeof tree.type !== "string") {
      throw new Error("Invalid tree structure: type must be a string");
    }

    if (!Array.isArray(tree.children)) {
      throw new Error("Invalid tree structure: children must be an array");
    }

    tree.children.forEach((child: Record<string, unknown>, index: number) => {
      try {
        this.validateTreeStructure(child);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `Invalid tree structure in child ${index}: ${error.message}`
          );
        }
        throw error;
      }
    });
  }
}
