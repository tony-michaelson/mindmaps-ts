import Konva from "konva";
import { LAYOUT_CONFIG } from "./NodePosition";

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
    } = params;
    this.onTextChange = onTextChange;
    this.onSizeChange = onSizeChange;
    this.onDoubleClick = onDoubleClick;
    this.onRightClick = onRightClick;

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

    const rect = new Konva.Rect({
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

    this.rectElement = rect;

    label.x(this.padding);
    label.y(this.padding);

    this.group.add(rect);
    this.group.add(label);
    this.layer.add(this.group);
    this.setupTextEditing();
    this.layer.draw();
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
    const rect = this.group.findOne("Rect") as Konva.Rect;
    if (rect) {
      if (this.isDropTarget) {
        rect.stroke("#00FF88");
        rect.strokeWidth(3);
        rect.dash([]);
        rect.shadowColor("#00FF88");
        rect.shadowBlur(15);
        rect.shadowOpacity(0.8);
      } else if (this.isDragging) {
        rect.opacity(0.25);
        rect.stroke("#2E9AFE");
        rect.strokeWidth(2);
        rect.dash([]);
        rect.shadowColor("#2E9AFE");
        rect.shadowBlur(20);
        rect.shadowOpacity(0.6);

        this.textElement.opacity(0.25);
      } else if (this.isSelected) {
        rect.opacity(1);
        this.textElement.opacity(1);
        rect.stroke(Node.defaultStyles.root.background);
        rect.strokeWidth(2);
        rect.dash([8, 4]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      } else if (this.isActivated) {
        rect.opacity(1);
        this.textElement.opacity(1);
        rect.stroke("#2E9AFE");
        rect.strokeWidth(3);
        rect.dash([]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      } else {
        rect.opacity(1);
        this.textElement.opacity(1);
        rect.stroke("#888");
        rect.strokeWidth(1);
        rect.dash([]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      }

      rect.shadowOffset({
        x: 4,
        y: this.isCollapsed ? 3 : 4,
      });
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
      requestAnimationFrame(() => {
        this.startEditing();
      });
    }

    this.group.on("dblclick", () => {
      if (this.onDoubleClick) {
        this.onDoubleClick();
      }
      this.startEditing();
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

    this.isEditing = true;

    const displayText = this.textElement.text();
    this.currentText = displayText.replace(/\n/g, " ");

    document.addEventListener("keydown", this.handleKeydown, true);

    this.rectElement.stroke("#00FF88");
    this.rectElement.strokeWidth(2);
    this.layer.draw();
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (!this.isEditing) return;

    e.preventDefault();
    e.stopPropagation();

    switch (e.key) {
      case "Enter":
        this.finishEditing();
        return;
      case "Escape":
        this.cancelEditing();
        return;
      case "Backspace":
        this.currentText = this.currentText.slice(0, -1);
        this.updateDisplayText();
        return;
      case "Delete":
        this.currentText = this.currentText.slice(0, -1);
        this.updateDisplayText();
        return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.currentText.length < LAYOUT_CONFIG.maxNodeTextLength) {
        this.currentText += e.key;
        this.updateDisplayText();
      }
    }
  };

  private updateDisplayText(): void {
    const wrappedText = this.wrapText(this.currentText, 25);
    this.textElement.text(wrappedText);

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
  }

  public finishEditing(): void {
    if (!this.isEditing) return;

    this.isEditing = false;
    document.removeEventListener("keydown", this.handleKeydown, true);

    this.updateVisualStateOnly();

    if (this.onTextChange) {
      this.onTextChange(this.currentText);
    }

    this.layer.draw();
  }

  private cancelEditing(): void {
    if (!this.isEditing) return;

    this.isEditing = false;
    document.removeEventListener("keydown", this.handleKeydown, true);

    this.currentText = this.textElement.text().replace(/\n/g, " ");

    this.updateVisualStateOnly();
    this.layer.draw();
  }

  public isCurrentlyEditing(): boolean {
    return this.isEditing;
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
    if (this.isEditing) {
      document.removeEventListener("keydown", this.handleKeydown, true);
    }
    this.group.destroy();
    this.layer.draw();
  }
}
