export interface NodePosition {
  x: number;
  y: number;
  level: number;
  parentId?: string;
  stackIndex: number;
  side: "left" | "right";
}

export enum NodeType {
  TASK = "task",
  IDEA = "idea",
  RESOURCE = "resource",
  DEADLINE = "deadline",
  ROOT = "root",
  LINK = "link",
}

export interface NodeConfig {
  color: string;
  shape: "rectangle" | "circle" | "diamond";
  clickBehavior?: (node: unknown) => void;
}

export const NODE_CONFIGS: Record<NodeType, NodeConfig> = {
  [NodeType.ROOT]: {
    color: "#22AAE0",
    shape: "rectangle",
  },
  [NodeType.TASK]: {
    color: "#4CAF50",
    shape: "rectangle",
  },
  [NodeType.IDEA]: {
    color: "#FF9800",
    shape: "circle",
  },
  [NodeType.RESOURCE]: {
    color: "#9C27B0",
    shape: "rectangle",
  },
  [NodeType.DEADLINE]: {
    color: "#F44336",
    shape: "diamond",
  },
  [NodeType.LINK]: {
    color: "#2196F3",
    shape: "circle",
  },
};

export const LAYOUT_CONFIG = {
  width: 120,
  height: 40,
  horizontalSpacing: 20,
  verticalSpacing: 20,
  maxTextLength: 25,
  maxNodeTextLength: 120,
};
