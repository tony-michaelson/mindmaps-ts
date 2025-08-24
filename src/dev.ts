import { MindMap } from "./MindMap";
import { NodeType } from "./NodePosition";

const mindMap = new MindMap("container", window.innerWidth, window.innerHeight);

(window as any).mindMap = mindMap;
(window as any).NodeType = NodeType;

(window as any).addRandomNode = (side: "left" | "right" = "right") => {
  const topics = [
    "The fix ensures that when text editing finishes, siblings will reposition based on the edited node's new dimensions,  ma",
    "Testing",
    "Review",
  ];
  const types = [
    NodeType.TASK,
    NodeType.IDEA,
    NodeType.RESOURCE,
    NodeType.DEADLINE,
  ];

  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const randomType = types[Math.floor(Math.random() * types.length)];

  const selectedNodeId = mindMap.getController().getSelectedNodeId();
  const rootId = mindMap.getController().getRootId();

  if (selectedNodeId && selectedNodeId !== rootId) {
    return mindMap.addChildToNode(selectedNodeId, randomTopic, randomType);
  } else {
    return mindMap.addRootChild(randomTopic, randomType, side);
  }
};

(window as any).addChildToNode = (parentId: string) => {
  const topics = ["Subtask", "Detail", "Note", "Action Item"];
  const types = [NodeType.TASK, NodeType.IDEA];

  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const randomType = types[Math.floor(Math.random() * types.length)];

  return mindMap.addChildToNode(parentId, randomTopic, randomType);
};

(window as any).clearCaches = () => {
  mindMap.getController().clearCaches();
  console.log("🧹 Caches cleared!");
};

(window as any).moveToOppositeSide = (nodeId: string) => {
  mindMap.moveRootChildToOppositeSide(nodeId);
  console.log(`🔄 Moved node ${nodeId} to opposite side`);
};

(window as any).listRootChildren = () => {
  const children = mindMap.getRootChildren();
  console.log("📋 Root children:");
  children.forEach((child, index) => {
    console.log(
      `  ${index + 1}. ${child.text} (${child.side}) - ID: ${child.nodeId}`
    );
  });
  return children;
};

(window as any).performanceTest = (nodeCount: number = 100) => {
  console.log(`🚀 Starting performance test with ${nodeCount} nodes...`);

  const startTime = performance.now();

  for (let i = 0; i < nodeCount; i++) {
    const side = i % 2 === 0 ? "left" : "right";
    (window as any).addRandomNode(side);
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log(`✅ Performance test completed:`);
  console.log(`   • Added ${nodeCount} nodes in ${duration.toFixed(2)}ms`);
  console.log(`   • Average: ${(duration / nodeCount).toFixed(2)}ms per node`);
  console.log(`   • Total nodes: ${mindMap.getNodeCount()}`);

  const controller = mindMap.getController();
  try {
    const stats = controller.getCacheStats();
    console.log(`   • Connection cache size: ${stats.connectionCacheSize}`);
    console.log(`   • Visibility cache size: ${stats.visibilityCacheSize}`);
  } catch (error) {
    console.log(`   • Cache stats not available`);
  }

  return {
    duration,
    avgPerNode: duration / nodeCount,
    totalNodes: mindMap.getNodeCount(),
  };
};

console.log(`
🎯 MindMap Controls:
• Click anywhere on canvas to add nodes
• Use Arrow Keys: ← → to add nodes to left/right of root
• Use Enter to add child nodes (to be implemented)
• Use Delete/Backspace to remove nodes (to be implemented)

🔧 Developer Commands:
• addRandomNode('left'/'right') - adds child to selected node, or to root side if root/none selected
• addChildToNode(nodeId)
• mindMap.getNodeCount()
• mindMap.getRootId()
• listRootChildren() - list all root children with their sides and IDs
• moveToOppositeSide(nodeId) - move a root child to opposite side
• performanceTest(100) - performance test with N nodes
• clearCaches() - clear connection and visibility caches

Example: 
1. listRootChildren() to see nodes
2. moveToOppositeSide('node-id') to move a node
`);

mindMap.render();
