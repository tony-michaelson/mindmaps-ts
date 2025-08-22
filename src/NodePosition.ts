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
}

export interface NodeConfig {
  color: string;
  shape: "rectangle" | "circle" | "diamond";
  clickBehavior?: (node: any) => void;
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
};

export const LAYOUT_CONFIG = {
  width: 120,
  height: 40,
  horizontalSpacing: 100, // Reduced by 50% (200 * 0.5 = 100)
  verticalSpacing: 17.5, // Reduced by 65% (50 * 0.35 = 17.5)
  maxTextLength: 25,
};
