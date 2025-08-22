import Konva from "konva";
import { Node } from "./Node";

export class MindMap {
  private stage: Konva.Stage;
  private layer: Konva.Layer;
  private nodes: Node[] = [];
  private edges: Konva.Line[] = [];

  constructor(containerId: string, width: number, height: number) {
    this.stage = new Konva.Stage({
      container: containerId,
      width,
      height,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.initEvents();
  }

  private initEvents() {
    this.stage.on("click", (e) => {
      console.log(
        "Clicked on:",
        e.target.getClassName(),
        "Name:",
        e.target.name()
      );

      if (e.target === this.stage) {
        const pos = this.stage.getPointerPosition();
        if (pos) {
          this.addNode(pos.x, pos.y, "Node", "Lightgray");
        }
      } else {
        e.evt.stopPropagation();
      }
    });
  }

  public addNode(x: number, y: number, text: string, color: string) {
    const node = new Node({
      x,
      y,
      text,
      layer: this.layer,
      customColor: color,
    });
    this.nodes.push(node);
  }

  public render() {
    this.layer.draw();
  }
}
