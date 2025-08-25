import Konva from "konva";
import { NODE_CONFIGS, NodeType } from "./NodePosition";
import { EditDialog } from "./EditDialog";

export class Node {
  private group: Konva.Group;
  private layer: Konva.Layer;
  private padding: number = 8;
  private isRoot: boolean;
  private isSelected: boolean = false;
  private isActivated: boolean = false;
  private isCollapsed: boolean = false;
  private isDragging: boolean = false;
  private isDropTarget: boolean = false;
  private isEditing: boolean = false;
  private currentText: string;
  private textElement: Konva.Text;
  private rectElement: Konva.Rect;
  private onTextChange?: (newText: string) => void;
  private onSizeChange?: () => void;
  private onDoubleClick?: () => void;
  private onRightClick?: (x: number, y: number) => void;
  private onLinkClick?: () => void;
  private isLinkNode: boolean = false;
  private isNewNode: boolean = false;
  private textArea?: HTMLTextAreaElement;
  private editDialog: EditDialog;

  private static readonly defaultStyles = {
    root: { background: "#22AAE0" },
    nonRoot: { background: "#E0E0E0" },
  };

  constructor(params: {
    x: number;
    y: number;
    text: string;
    isRoot?: boolean;
    layer: Konva.Layer;
    customColor?: string;
    onTextChange?: (newText: string) => void;
    onSizeChange?: () => void;
    onDoubleClick?: () => void;
    onRightClick?: (x: number, y: number) => void;
    onLinkClick?: () => void;
    isLinkNode?: boolean;
    isNewNode?: boolean;
    nodeType?: NodeType;
  }) {
    const {
      x,
      y,
      text,
      isRoot = false,
      layer,
      customColor,
      onTextChange,
      onSizeChange,
      onDoubleClick,
      onRightClick,
      onLinkClick,
      isLinkNode = false,
      isNewNode = false,
      nodeType,
    } = params;
    this.onTextChange = onTextChange;
    this.onSizeChange = onSizeChange;
    this.onDoubleClick = onDoubleClick;
    this.onRightClick = onRightClick;
    this.onLinkClick = onLinkClick;
    this.isLinkNode = isLinkNode;
    this.isNewNode = isNewNode;
    this.editDialog = new EditDialog();

    this.currentText = text.replace(/\n/g, " ");

    this.layer = layer;
    this.isRoot = isRoot;
    this.group = new Konva.Group({
      x,
      y,
      draggable: true,
      listening: true,
      name: "mindmap-node",
    });

    const wrappedText = this.wrapText(text, 25);

    const backgroundColor =
      customColor ||
      (isRoot
        ? Node.defaultStyles.root.background
        : Node.defaultStyles.nonRoot.background);

    const label = new Konva.Text({
      text: wrappedText,
      fontFamily: "Helvetica",
      fontSize: 12,
      fontStyle: "bold",
      lineHeight: 1.5,
      align: "center",
      verticalAlign: "middle",
      fill: this.getTextColor(backgroundColor),
      listening: false,
    });

    this.textElement = label;

    const textWidth = label.width();
    const textHeight = label.height();

    const nodeWidth = textWidth + this.padding * 2;
    const nodeHeight = textHeight + this.padding * 2;

    let shapeElement: Konva.Shape;
    
    if (nodeType === NodeType.CUBE) {
      shapeElement = this.createCubeShape(nodeWidth, nodeHeight, backgroundColor);
    } else {
      shapeElement = new Konva.Rect({
        width: nodeWidth,
        height: nodeHeight,
        fill: backgroundColor,
        stroke: this.isActivated ? "#2E9AFE" : "#888",
        strokeWidth: this.isActivated ? 3 : 1,
        cornerRadius: 10,
        listening: true,
        shadowColor: "black",
        shadowBlur: this.isSelected ? 0 : 10,
        shadowOffset: {
          x: 4,
          y: this.isCollapsed ? 3 : 4,
        },
        shadowOpacity: this.isSelected ? 1.0 : 0.4,
      });
    }

    this.rectElement = shapeElement;

    label.x(this.padding);
    label.y(this.padding);

    this.group.add(shapeElement);
    this.group.add(label);
    this.layer.add(this.group);
    this.setupTextEditing();
    this.layer.draw();
  }

  private createCubeShape(width: number, height: number, backgroundColor: string): Konva.Group {
    const cubeGroup = new Konva.Group({
      listening: true,
    });

    const cubeSize = Math.min(width, height);
    const depth = cubeSize * 0.3;

    // Front face (main rectangle)
    const frontFace = new Konva.Rect({
      width: cubeSize,
      height: cubeSize,
      fill: backgroundColor,
      stroke: this.isActivated ? "#2E9AFE" : "#888",
      strokeWidth: this.isActivated ? 3 : 1,
      cornerRadius: 0,
      listening: true,
    });

    // Right face (parallelogram)
    const rightFace = new Konva.Line({
      points: [
        cubeSize, 0,
        cubeSize + depth, -depth,
        cubeSize + depth, cubeSize - depth,
        cubeSize, cubeSize
      ],
      fill: this.darkenColor(backgroundColor, 0.2),
      stroke: this.isActivated ? "#2E9AFE" : "#888",
      strokeWidth: this.isActivated ? 3 : 1,
      closed: true,
      listening: true,
    });

    // Top face (parallelogram)
    const topFace = new Konva.Line({
      points: [
        0, 0,
        depth, -depth,
        cubeSize + depth, -depth,
        cubeSize, 0
      ],
      fill: this.darkenColor(backgroundColor, 0.1),
      stroke: this.isActivated ? "#2E9AFE" : "#888",
      strokeWidth: this.isActivated ? 3 : 1,
      closed: true,
      listening: true,
    });

    cubeGroup.add(rightFace);
    cubeGroup.add(topFace);
    cubeGroup.add(frontFace);

    // Add shadow to the front face instead of the group
    frontFace.shadowColor("black");
    frontFace.shadowBlur(this.isSelected ? 0 : 10);
    frontFace.shadowOffset({
      x: 4,
      y: this.isCollapsed ? 3 : 4,
    });
    frontFace.shadowOpacity(this.isSelected ? 1.0 : 0.4);

    return cubeGroup;
  }

  private darkenColor(hex: string, amount: number): string {
    const color = hex.replace("#", "");
    const r = Math.max(0, parseInt(color.slice(0, 2), 16) - Math.round(255 * amount));
    const g = Math.max(0, parseInt(color.slice(2, 4), 16) - Math.round(255 * amount));
    const b = Math.max(0, parseInt(color.slice(4, 6), 16) - Math.round(255 * amount));
    
    return "#" + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  private wrapText(text: string, maxChars: number = 25): string {
    if (text.length <= maxChars) {
      return text;
    }

    const words = text.split(" ");
    let result = "";
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;

      if (testLine.length <= maxChars) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          result += (result ? "\n" : "") + currentLine;
          currentLine = word;
        } else {
          currentLine = word.substring(0, maxChars);
        }
      }
    }

    if (currentLine) {
      result += (result ? "\n" : "") + currentLine;
    }

    return result;
  }

  private getTextColor(backgroundColor: string): string {
    const luminosity = this.calculateLuminosity(backgroundColor);

    if (luminosity < 0.3) {
      return "#EEEEEE";
    } else if (luminosity < 0.7) {
      return "#4F4F4F";
    } else {
      return "#000000";
    }
  }

  private calculateLuminosity(hex: string): number {
    hex = hex.replace("#", "");

    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    const rLinear = toLinear(r);
    const gLinear = toLinear(g);
    const bLinear = toLinear(b);

    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;
    this.updateVisualStateOnly();
  }

  public setActivated(activated: boolean): void {
    this.isActivated = activated;
    this.updateVisualState();
  }

  public setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.updateVisualState();
  }

  public setDragging(dragging: boolean): void {
    this.isDragging = dragging;
    this.updateVisualState();
  }

  public setDropTarget(isTarget: boolean): void {
    this.isDropTarget = isTarget;
    this.updateVisualState();
  }

  private updateVisualState(): void {
    this.updateVisualStateOnly();
    this.layer.draw();
  }

  private updateVisualStateOnly(): void {
    const shapeElement = this.rectElement;
    if (shapeElement) {
      if (this.isDropTarget) {
        this.updateShapeStroke(shapeElement, "#00FF88", 3, []);
        this.updateShapeShadow(shapeElement, "#00FF88", 15, 0.8);
      } else if (this.isDragging) {
        this.updateShapeOpacity(shapeElement, 0.25);
        this.updateShapeStroke(shapeElement, "#2E9AFE", 2, []);
        this.updateShapeShadow(shapeElement, "#2E9AFE", 20, 0.6);
        this.textElement.opacity(0.25);
      } else if (this.isSelected) {
        this.updateShapeOpacity(shapeElement, 1);
        this.textElement.opacity(1);
        this.updateShapeStroke(shapeElement, Node.defaultStyles.root.background, 2, [8, 4]);
        this.updateShapeShadow(shapeElement, "black", 10, 0.4);
      } else if (this.isActivated) {
        this.updateShapeOpacity(shapeElement, 1);
        this.textElement.opacity(1);
        this.updateShapeStroke(shapeElement, "#2E9AFE", 3, []);
        this.updateShapeShadow(shapeElement, "black", 10, 0.4);
      } else {
        this.updateShapeOpacity(shapeElement, 1);
        this.textElement.opacity(1);
        this.updateShapeStroke(shapeElement, "#888", 1, []);
        this.updateShapeShadow(shapeElement, "black", 10, 0.4);
      }

      this.updateShapeShadowOffset(shapeElement, 4, this.isCollapsed ? 3 : 4);
    }
  }

  private updateShapeStroke(shapeElement: Konva.Shape, color: string, width: number, dash: number[]): void {
    if (shapeElement instanceof Konva.Group) {
      // For cube shapes, update all child elements
      shapeElement.getChildren().forEach((child) => {
        if (child instanceof Konva.Shape) {
          child.stroke(color);
          child.strokeWidth(width);
          child.dash(dash);
        }
      });
    } else {
      // For regular shapes
      shapeElement.stroke(color);
      shapeElement.strokeWidth(width);
      shapeElement.dash(dash);
    }
  }

  private updateShapeOpacity(shapeElement: Konva.Shape, opacity: number): void {
    shapeElement.opacity(opacity);
  }

  private updateShapeShadow(shapeElement: Konva.Shape, color: string, blur: number, opacity: number): void {
    if (shapeElement instanceof Konva.Group) {
      // For cube shapes, update the front face (first Rect child)
      const frontFace = shapeElement.findOne("Rect") as Konva.Rect;
      if (frontFace) {
        frontFace.shadowColor(color);
        frontFace.shadowBlur(blur);
        frontFace.shadowOpacity(opacity);
      }
    } else {
      shapeElement.shadowColor(color);
      shapeElement.shadowBlur(blur);
      shapeElement.shadowOpacity(opacity);
    }
  }

  private updateShapeShadowOffset(shapeElement: Konva.Shape, x: number, y: number): void {
    if (shapeElement instanceof Konva.Group) {
      // For cube shapes, update the front face (first Rect child)
      const frontFace = shapeElement.findOne("Rect") as Konva.Rect;
      if (frontFace) {
        frontFace.shadowOffset({ x, y });
      }
    } else {
      shapeElement.shadowOffset({ x, y });
    }
  }

  public getGroup(): Konva.Group {
    return this.group;
  }

  public move(deltaX: number, deltaY: number): void {
    this.group.x(this.group.x() + deltaX);
    this.group.y(this.group.y() + deltaY);
    this.layer.draw();
  }

  private setupTextEditing(): void {
    if (this.currentText === "" || this.currentText === "New Node") {
      this.setupKeyCapture();
    }

    this.group.on("dblclick", () => {
      if (this.isLinkNode && this.onLinkClick) {
        this.onLinkClick();
      } else {
        this.startEditing();
        
        // Only call the external double-click callback for nodes that will use key capture
        // This prevents unwanted side effects like creating child nodes when using dialog
        const hasContent = this.currentText && this.currentText !== "New Node" && this.currentText !== "";
        const isEmptyNewNode = this.isNewNode && (!this.currentText || this.currentText === "" || this.currentText === "New Node");
        
        if (hasContent && !isEmptyNewNode) {
          // For nodes using dialog, we skip the external callback
        } else if (this.onDoubleClick) {
          // For nodes using key capture, call the callback
          this.onDoubleClick();
        }
      }
    });

    this.group.on("contextmenu", (e) => {
      e.evt.preventDefault();
      if (this.onRightClick) {
        this.onRightClick(e.evt.clientX, e.evt.clientY);
      }
    });
  }

  public startEditing(): void {
    if (this.isEditing) return;

    // Use dialog for nodes that have actual content
    // Use key capture/textarea only for nodes that are truly empty and new
    const hasContent = this.currentText && this.currentText !== "New Node" && this.currentText !== "";
    const isEmptyNewNode = this.isNewNode && (!this.currentText || this.currentText === "" || this.currentText === "New Node");
    
    if (hasContent && !isEmptyNewNode) {
      this.startDialogEditing();
    } else {
      this.startTextAreaEditing();
    }
  }

  private startDialogEditing(): void {
    const currentText = this.currentText;
    
    // Set editing flag to prevent keyboard shortcuts from interfering
    this.isEditing = true;
    
    this.editDialog.show(
      currentText,
      (newText: string) => {
        // Clear editing flag
        this.isEditing = false;
        
        if (newText !== currentText) {
          this.currentText = newText;
          
          // Make sure text element is visible
          this.textElement.show();
          
          this.updateDisplayText();
          
          // Force a layer redraw
          this.layer.draw();
          
          if (this.onTextChange) {
            this.onTextChange(this.currentText);
          }
        }
      },
      () => {
        // Clear editing flag on cancel too
        this.isEditing = false;
      }
    );
  }

  private startTextAreaEditing(): void {
    this.isEditing = true;

    const displayText = this.textElement.text();
    this.currentText = displayText.replace(/\n/g, " ");

    this.textElement.hide();
    this.createTextArea();

    this.rectElement.stroke("#00FF88");
    this.rectElement.strokeWidth(2);
    this.layer.draw();
  }

  private createTextArea(): void {
    const stage = this.layer.getStage();
    if (!stage) return;

    // Use Konva's getClientRect method to get the exact screen position
    const clientRect = this.group.getClientRect();
    const container = stage.container();
    const containerRect = container.getBoundingClientRect();
    
    // Calculate the actual screen position with scroll offsets  
    const scale = clientRect.width / this.rectElement.width();
    const paddingScaled = this.padding * scale;
    
    // Use the actual text element dimensions for precise sizing
    const textWidth = this.textElement.width() * scale;
    const textHeight = this.textElement.height() * scale;
    
    // Center the textarea within the available space (after padding)
    const availableWidth = clientRect.width - (paddingScaled * 2);
    const availableHeight = clientRect.height - (paddingScaled * 2);
    const textXOffset = (availableWidth - textWidth) / 2;
    const textYOffset = (availableHeight - textHeight) / 2;
    
    const nodeX = containerRect.left + clientRect.x + window.scrollX + paddingScaled + textXOffset + 5;
    const nodeY = containerRect.top + clientRect.y + window.scrollY + paddingScaled + textYOffset + 5;
    const nodeWidth = textWidth - 10;
    const nodeHeight = textHeight - 10;
    
    
    
    this.textArea = document.createElement('textarea');
    this.textArea.value = this.currentText;
    
    this.textArea.style.position = 'absolute';
    this.textArea.style.left = `${nodeX}px`;
    this.textArea.style.top = `${nodeY}px`;
    this.textArea.style.width = `${nodeWidth}px`;
    this.textArea.style.height = `${nodeHeight}px`;
    this.textArea.style.fontSize = `${10 * (clientRect.width / this.rectElement.width())}px`;
    this.textArea.style.fontFamily = 'Helvetica';
    this.textArea.style.fontWeight = 'bold';
    this.textArea.style.textAlign = 'center';
    this.textArea.style.border = 'none';
    this.textArea.style.outline = 'none';
    this.textArea.style.background = 'transparent';
    this.textArea.style.color = this.textElement.fill();
    this.textArea.style.zIndex = '1000';
    this.textArea.style.resize = 'none';
    this.textArea.style.padding = '0';
    this.textArea.style.boxSizing = 'border-box';
    this.textArea.style.overflow = 'hidden';
    this.textArea.style.lineHeight = '1.5';
    this.textArea.style.verticalAlign = 'middle';
    
    document.body.appendChild(this.textArea);
    
    this.textArea.addEventListener('blur', () => this.finishEditing());
    this.textArea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.finishEditing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEditing();
      }
    });
    
    this.textArea.focus();
    this.textArea.select();
  }

  private updateDisplayText(): void {
    const wrappedText = this.wrapText(this.currentText, 25);
    this.textElement.text(wrappedText);

    if (!this.isEditing) {
      const oldWidth = this.rectElement.width();
      const oldHeight = this.rectElement.height();

      this.textElement.measureSize();

      const rawTextWidth = this.textElement.width();
      const rawTextHeight = this.textElement.height();

      const textWidth = Math.max(rawTextWidth, 20);
      const textHeight = Math.max(rawTextHeight, 16);
      const nodeWidth = textWidth + this.padding * 2;
      const nodeHeight = textHeight + this.padding * 2;

      this.rectElement.width(nodeWidth);
      this.rectElement.height(nodeHeight);

      this.textElement.x(this.padding);
      this.textElement.y(this.padding);

      this.layer.draw();

      const widthChange = Math.abs(oldWidth - nodeWidth);
      const heightChange = Math.abs(oldHeight - nodeHeight);
      if ((widthChange > 2 || heightChange > 2) && this.onSizeChange) {
        this.onSizeChange();
      }
    } else {
      this.layer.draw();
    }
  }

  public finishEditing(): void {
    if (!this.isEditing) return;
    
    this.isEditing = false;

    if (this.textArea) {
      this.currentText = this.textArea.value;
      if (this.textArea.parentNode) {
        this.textArea.parentNode.removeChild(this.textArea);
      }
      this.textArea = undefined;
    }

    this.textElement.show();
    this.updateDisplayText();
    this.updateVisualStateOnly();

    if (this.onTextChange) {
      this.onTextChange(this.currentText);
    }

    this.layer.draw();
  }

  private cancelEditing(): void {
    if (!this.isEditing) return;
    
    this.isEditing = false;

    if (this.textArea) {
      if (this.textArea.parentNode) {
        this.textArea.parentNode.removeChild(this.textArea);
      }
      this.textArea = undefined;
    }

    this.textElement.show();
    this.currentText = this.textElement.text().replace(/\n/g, " ");

    this.updateVisualStateOnly();
    this.layer.draw();
  }

  public isCurrentlyEditing(): boolean {
    return this.isEditing;
  }

  private setupKeyCapture(): void {
    this.isEditing = true;
    this.rectElement.stroke("#00FF88");
    this.rectElement.strokeWidth(2);
    this.layer.draw();

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Enter") {
        this.finishKeyCapture();
        document.removeEventListener("keydown", handleKeyDown);
      } else if (e.key === "Escape") {
        this.cancelKeyCapture();
        document.removeEventListener("keydown", handleKeyDown);
      } else if (e.key === "Backspace") {
        this.currentText = this.currentText.slice(0, -1);
        this.updateDisplayText();
      } else if (e.key.length === 1) {
        this.currentText += e.key;
        this.updateDisplayText();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
  }

  private finishKeyCapture(): void {
    this.isEditing = false;
    this.updateVisualStateOnly();
    this.layer.draw();

    if (this.onTextChange) {
      this.onTextChange(this.currentText);
    }
  }

  private cancelKeyCapture(): void {
    this.isEditing = false;
    this.currentText = "";
    this.updateDisplayText();
    this.updateVisualStateOnly();
    this.layer.draw();
  }

  public getText(): string {
    return this.currentText;
  }

  public setText(text: string): void {
    this.currentText = text.replace(/\n/g, " ");
    const wrappedText = this.wrapText(this.currentText, 25);
    this.textElement.text(wrappedText);
    this.updateDisplayText();
  }

  public remove(): void {
    if (this.isEditing && this.textArea && this.textArea.parentNode) {
      this.textArea.parentNode.removeChild(this.textArea);
      this.textArea = undefined;
    }
    this.group.destroy();
    this.layer.draw();
  }
}
