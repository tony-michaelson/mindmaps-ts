import { NodeType } from "./NodePosition";

export interface MenuAction {
  id: string;
  label: string;
  icon?: string;
  submenu?: MenuAction[];
  disabled?: boolean;
  separator?: boolean;
}

export interface MenuPosition {
  x: number;
  y: number;
}

export interface MenuContext {
  nodeId: string;
  nodeText: string;
  nodeType: NodeType;
  isRootChild: boolean;
  canMoveToOppositeSide: boolean;
}

export type MenuActionHandler = (
  action: string,
  nodeId: string,
  data?: Record<string, unknown>
) => void | Promise<void>;

export class ContextMenu {
  private element: HTMLDivElement;
  private isVisible: boolean = false;
  private onAction: MenuActionHandler;
  private currentContext: MenuContext | null = null;

  constructor(onAction: MenuActionHandler) {
    this.onAction = onAction;
    this.createElement();
    this.bindEvents();
  }

  private createElement(): void {
    this.element = document.createElement("div");
    this.element.className = "mindmap-context-menu";
    this.element.style.cssText = `
      position: fixed;
      background: white;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 4px 0;
      min-width: 180px;
      z-index: 10000;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      user-select: none;
    `;

    document.body.appendChild(this.element);
  }

  private bindEvents(): void {
    document.addEventListener("click", (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.hide();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible) {
        this.hide();
      }
    });

    this.element.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const menuItem = target.closest("[data-action]") as HTMLElement;

      if (
        menuItem &&
        !menuItem.classList.contains("disabled") &&
        this.currentContext
      ) {
        const action = menuItem.dataset.action!;
        let data = undefined;
        try {
          if (menuItem.dataset.data && menuItem.dataset.data !== "") {
            const unescapedData = menuItem.dataset.data.replace(/&quot;/g, '"');
            data = JSON.parse(unescapedData);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(
            "Failed to parse menu item data:",
            menuItem.dataset.data,
            error
          );
        }

        this.onAction(action, this.currentContext.nodeId, data);
        this.hide();
      }
    });
  }

  public show(position: MenuPosition, context: MenuContext): void {
    this.currentContext = context;
    this.buildMenu(context);

    this.element.style.left = `${position.x}px`;
    this.element.style.top = `${position.y}px`;
    this.element.style.display = "block";
    this.isVisible = true;

    this.adjustPosition();
  }

  public hide(): void {
    this.element.style.display = "none";
    this.isVisible = false;
    this.currentContext = null;
  }

  private buildMenu(context: MenuContext): void {
    const actions: MenuAction[] = [
      { id: "edit", label: "✏️ Edit Text", icon: "✏️" },
      { separator: true, id: "sep1", label: "" },
      {
        id: "change-type",
        label: "🎯 Change Type",
        submenu: [
          { id: "type-task", label: "📋 Task", data: { type: NodeType.TASK } },
          { id: "type-idea", label: "💡 Idea", data: { type: NodeType.IDEA } },
          {
            id: "type-resource",
            label: "📚 Resource",
            data: { type: NodeType.RESOURCE },
          },
          {
            id: "type-deadline",
            label: "⏰ Deadline",
            data: { type: NodeType.DEADLINE },
          },
          {
            id: "type-cube",
            label: "🎲 Cube",
            data: { type: NodeType.CUBE },
          },
        ],
      },
      { separator: true, id: "sep2", label: "" },
      { id: "add-child", label: "➕ Add Child" },
      { id: "add-sibling", label: "↔️ Add Sibling" },
      { separator: true, id: "sep3", label: "" },
    ];

    if (context.canMoveToOppositeSide) {
      actions.push({ id: "move-opposite", label: "↔️ Move to Opposite Side" });
      actions.push({ separator: true, id: "sep4", label: "" });
    }

    actions.push({ id: "delete", label: "🗑️ Delete Node" });

    this.element.innerHTML = this.renderActions(actions);
  }

  private renderActions(actions: MenuAction[]): string {
    return actions
      .map((action) => {
        if (action.separator) {
          return '<div class="menu-separator" style="height: 1px; background: #e0e0e0; margin: 4px 0;"></div>';
        }

        if (action.submenu) {
          return `
          <div class="menu-item has-submenu" data-action="${action.id}" style="
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
          ">
            <span>${action.label}</span>
            <span style="margin-left: 8px;">▶</span>
            <div class="submenu" style="
              position: absolute;
              left: 100%;
              top: 0;
              background: white;
              border: 1px solid #ccc;
              border-radius: 6px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              padding: 4px 0;
              min-width: 140px;
              display: none;
            ">
              ${this.renderActions(action.submenu)}
            </div>
          </div>
        `;
        }

        const data = action.data
          ? JSON.stringify(action.data).replace(/"/g, "&quot;")
          : "";
        const disabledClass = action.disabled ? " disabled" : "";
        const disabledStyle = action.disabled
          ? "opacity: 0.5; cursor: not-allowed;"
          : "";

        return `
        <div class="menu-item${disabledClass}" data-action="${action.id}" data-data="${data}" style="
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          ${disabledStyle}
        ">
          ${action.label}
        </div>
      `;
      })
      .join("");
  }

  private adjustPosition(): void {
    const rect = this.element.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const { left, top } = rect;

    if (left + rect.width > viewport.width) {
      this.element.style.left = `${viewport.width - rect.width - 10}px`;
    }

    if (top + rect.height > viewport.height) {
      this.element.style.top = `${viewport.height - rect.height - 10}px`;
    }
  }

  public destroy(): void {
    document.body.removeChild(this.element);
  }
}
