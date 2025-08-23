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

  // Default styles from layout.js
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
  }) {
    const { x, y, text, isRoot = false, layer, customColor, onTextChange, onSizeChange } = params;
    this.onTextChange = onTextChange;
    this.onSizeChange = onSizeChange;
    this.currentText = text;

    this.layer = layer;
    this.isRoot = isRoot;
    this.group = new Konva.Group({
      x,
      y,
      draggable: true,
      listening: true,
      name: "mindmap-node",
    });

    // Wrap text according to 25 character limit
    const wrappedText = this.wrapText(text, 25);

    // Determine background color
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

    // Measure text dimensions
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

  // Helper function to wrap text at 25 character limit
  private wrapText(text: string, maxChars: number = 25): string {
    if (text.length <= maxChars) return text;

    const words = text.split(" ");
    let result = "";
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + word).length <= maxChars) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        result += (result ? "\n" : "") + currentLine;
        currentLine = word;
      }
    }

    return result + (currentLine ? (result ? "\n" : "") + currentLine : "");
  }

  // Helper function to calculate text color based on background luminosity
  private getTextColor(backgroundColor: string): string {
    const luminosity = this.calculateLuminosity(backgroundColor);

    if (luminosity < 0.3) {
      return "#EEEEEE"; // Light text for dark backgrounds
    } else if (luminosity < 0.7) {
      return "#4F4F4F"; // Dark gray for medium backgrounds
    } else {
      return "#000000"; // Black for light backgrounds
    }
  }

  // Helper function to calculate luminosity
  private calculateLuminosity(hex: string): number {
    // Remove # if present
    hex = hex.replace("#", "");

    // Convert hex to RGB
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    // Calculate relative luminosity using sRGB formula
    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    const rLinear = toLinear(r);
    const gLinear = toLinear(g);
    const bLinear = toLinear(b);

    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  // State management methods
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

  // Update visual state and redraw layer
  private updateVisualState(): void {
    this.updateVisualStateOnly();
    this.layer.draw();
  }

  // Update visual state without redrawing (for batch operations)
  private updateVisualStateOnly(): void {
    const rect = this.group.findOne("Rect") as Konva.Rect;
    if (rect) {
      if (this.isDropTarget) {
        // Drop target: bright green border with glow
        rect.stroke("#00FF88");
        rect.strokeWidth(3);
        rect.dash([]);
        rect.shadowColor("#00FF88");
        rect.shadowBlur(15);
        rect.shadowOpacity(0.8);
      } else if (this.isDragging) {
        // Dragging: semi-transparent with blue glow
        rect.opacity(0.7);
        rect.stroke("#2E9AFE");
        rect.strokeWidth(2);
        rect.dash([]);
        rect.shadowColor("#2E9AFE");
        rect.shadowBlur(20);
        rect.shadowOpacity(0.6);
      } else if (this.isSelected) {
        // Selected: dashed border with root node color
        rect.opacity(1);
        rect.stroke(Node.defaultStyles.root.background);
        rect.strokeWidth(2);
        rect.dash([8, 4]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      } else if (this.isActivated) {
        // Activated: solid blue border
        rect.opacity(1);
        rect.stroke("#2E9AFE");
        rect.strokeWidth(3);
        rect.dash([]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      } else {
        // Default: solid gray border
        rect.opacity(1);
        rect.stroke("#888");
        rect.strokeWidth(1);
        rect.dash([]);
        rect.shadowColor("black");
        rect.shadowBlur(10);
        rect.shadowOpacity(0.4);
      }
      
      // Consistent shadow offset
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
    // Start editing mode when node is created with empty text
    if (this.currentText === "" || this.currentText === "New Node") {
      // Start editing immediately but allow the node to be rendered first
      requestAnimationFrame(() => {
        this.startEditing();
      });
    }
    
    // Set up double-click to edit
    this.group.on('dblclick', () => {
      this.startEditing();
    });
  }

  public startEditing(): void {
    if (this.isEditing) return;
    
    // console.log('🎯 Starting edit mode for node with text:', this.currentText);
    this.isEditing = true;
    this.currentText = this.textElement.text();
    
    // Add keyboard event listener with high priority capture
    document.addEventListener('keydown', this.handleKeydown, true);
    
    // Visual feedback for editing mode
    this.rectElement.stroke("#00FF88");
    this.rectElement.strokeWidth(2);
    this.layer.draw();
    
    // console.log('✅ Edit mode active, listening for keyboard events');
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (!this.isEditing) return;
    
    // console.log('⌨️ Node keydown event:', e.key, 'code:', e.code);
    e.preventDefault();
    e.stopPropagation();
    
    // Handle special keys
    switch (e.key) {
      case 'Enter':
        // console.log('📝 Finishing edit');
        this.finishEditing();
        return;
      case 'Escape':
        // console.log('❌ Canceling edit');
        this.cancelEditing();
        return;
      case 'Backspace':
        // console.log('⬅️ Backspace - removing character');
        this.currentText = this.currentText.slice(0, -1);
        this.updateDisplayText();
        return;
      case 'Delete':
        // console.log('🗑️ Delete - removing character');
        this.currentText = this.currentText.slice(0, -1);
        this.updateDisplayText();
        return;
    }
    
    // Handle printable characters
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Check length limit
      if (this.currentText.length < LAYOUT_CONFIG.maxNodeTextLength) {
        // console.log('➕ Adding character:', e.key, 'to text:', this.currentText);
        this.currentText += e.key;
        this.updateDisplayText();
      } else {
        // console.log('⚠️ Text length limit reached');
      }
    }
  };

  private updateDisplayText(): void {
    const wrappedText = this.wrapText(this.currentText, 25);
    this.textElement.text(wrappedText);
    
    // Store previous dimensions to check if size changed
    const oldWidth = this.rectElement.width();
    const oldHeight = this.rectElement.height();
    
    // Measure new text dimensions
    const textWidth = this.textElement.width();
    const textHeight = this.textElement.height();
    const nodeWidth = textWidth + this.padding * 2;
    const nodeHeight = textHeight + this.padding * 2;
    
    // Update rectangle size
    this.rectElement.width(nodeWidth);
    this.rectElement.height(nodeHeight);
    
    // Keep text centered
    this.textElement.x(this.padding);
    this.textElement.y(this.padding);
    
    this.layer.draw();
    
    // Notify about size changes for connection updates
    if ((oldWidth !== nodeWidth || oldHeight !== nodeHeight) && this.onSizeChange) {
      this.onSizeChange();
    }
  }

  private finishEditing(): void {
    if (!this.isEditing) return;
    
    // console.log('📝 Finishing edit with text:', this.currentText);
    this.isEditing = false;
    document.removeEventListener('keydown', this.handleKeydown, true);
    
    // Restore normal appearance
    this.updateVisualStateOnly();
    
    // Notify parent of text change
    if (this.onTextChange) {
      this.onTextChange(this.currentText);
    }
    
    this.layer.draw();
  }

  private cancelEditing(): void {
    if (!this.isEditing) return;
    
    // console.log('❌ Canceling edit');
    this.isEditing = false;
    document.removeEventListener('keydown', this.handleKeydown, true);
    
    // Restore original text
    const wrappedText = this.wrapText(this.textElement.text(), 25);
    this.textElement.text(wrappedText);
    this.currentText = this.textElement.text();
    
    // Restore normal appearance
    this.updateVisualStateOnly();
    this.layer.draw();
  }

  public getText(): string {
    return this.currentText;
  }

  public setText(text: string): void {
    this.currentText = text;
    const wrappedText = this.wrapText(text, 25);
    this.textElement.text(wrappedText);
    this.updateDisplayText();
  }

  public getIsEditing(): boolean {
    return this.isEditing;
  }

  public remove(): void {
    // Clean up event listeners
    if (this.isEditing) {
      document.removeEventListener('keydown', this.handleKeydown, true);
    }
    this.group.destroy();
    this.layer.draw();
  }
}
