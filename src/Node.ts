import Konva from "konva";

export class Node {
  private group: Konva.Group;
  private layer: Konva.Layer;
  private padding: number = 8;
  private isRoot: boolean;
  private isSelected: boolean = false;
  private isActivated: boolean = false;
  private isCollapsed: boolean = false;

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
  }) {
    const { x, y, text, isRoot = false, layer, customColor } = params;

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

    label.x(this.padding);
    label.y(this.padding);

    this.group.add(rect);
    this.group.add(label);
    this.layer.add(this.group);
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
    this.updateVisualState();
  }

  public setActivated(activated: boolean): void {
    this.isActivated = activated;
    this.updateVisualState();
  }

  public setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.updateVisualState();
  }

  // Update visual state based on current flags
  private updateVisualState(): void {
    const rect = this.group.findOne("Rect") as Konva.Rect;
    if (rect) {
      rect.stroke(this.isActivated ? "#2E9AFE" : "#888");
      rect.strokeWidth(this.isActivated ? 3 : 1);
      rect.shadowBlur(this.isSelected ? 0 : 10);
      rect.shadowOffset({
        x: 4,
        y: this.isCollapsed ? 3 : 4,
      });
      rect.shadowOpacity(this.isSelected ? 1.0 : 0.4);
    }
    this.layer.draw();
  }

  public getGroup(): Konva.Group {
    return this.group;
  }

  public move(deltaX: number, deltaY: number): void {
    this.group.x(this.group.x() + deltaX);
    this.group.y(this.group.y() + deltaY);
    this.layer.draw();
  }

  public remove(): void {
    this.group.destroy();
    this.layer.draw();
  }
}
