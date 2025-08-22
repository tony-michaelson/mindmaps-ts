import Konva from "konva";

export class Node {
  private group: Konva.Group;
  private layer: Konva.Layer;
  private padding: number = 20;

  constructor(
    x: number,
    y: number,
    text: string,
    color: string,
    layer: Konva.Layer
  ) {
    this.layer = layer;
    this.group = new Konva.Group({
      x,
      y,
      draggable: true,
      listening: true,
      name: "mindmap-node",
    });

    const label = new Konva.Text({
      text,
      fontSize: 16,
      fill: "#fff",
      align: "center",
      verticalAlign: "middle",
      listening: false,
    });

    const textWidth = label.width();
    const textHeight = label.height();

    // Measure text dimensions manually
    label.width(label.textWidth);
    label.height(label.textHeight);

    const nodeWidth = label.width() + this.padding * 2;
    const nodeHeight = label.height() + this.padding * 2;

    const rect = new Konva.Rect({
      width: nodeWidth,
      height: nodeHeight,
      fill: color,
      stroke: "#333",
      strokeWidth: 2,
      cornerRadius: 10,
      listening: true,
    });

    label.x(this.padding);
    label.y(this.padding);

    this.group.add(rect);
    this.group.add(label);
    this.layer.add(this.group);
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
