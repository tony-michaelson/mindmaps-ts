import { MindMap } from "./MindMap";
import { NodeType } from "./NodePosition";

// Create the mindmap
const mindMap = new MindMap("container", window.innerWidth, window.innerHeight);

// // Add nodes to the right side
// const taskId = mindMap.addRootChild("Project Tasks", NodeType.TASK, "right");
// const ideaId = mindMap.addRootChild("Brainstorming", NodeType.IDEA, "right");

// // Add nodes to the left side
// const resourceId = mindMap.addRootChild("Resources", NodeType.RESOURCE, "left");
// const deadlineId = mindMap.addRootChild("Deadlines", NodeType.DEADLINE, "left");

// // Add child nodes to demonstrate hierarchical positioning
// mindMap.addChildToNode(taskId, "Design UI", NodeType.TASK);
// mindMap.addChildToNode(taskId, "Implement Backend", NodeType.TASK);
// mindMap.addChildToNode(taskId, "Write Tests", NodeType.TASK);

// mindMap.addChildToNode(ideaId, "User Research", NodeType.IDEA);
// mindMap.addChildToNode(ideaId, "Competitor Analysis", NodeType.IDEA);

// mindMap.addChildToNode(resourceId, "Design System", NodeType.RESOURCE);
// mindMap.addChildToNode(resourceId, "API Documentation", NodeType.RESOURCE);

// Expose mindMap globally for debugging and testing
(window as any).mindMap = mindMap;
(window as any).NodeType = NodeType;

// Add some helper functions for demo purposes
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

  // Get selected node ID from the controller
  const selectedNodeId = mindMap.getController().getSelectedNodeId();
  const rootId = mindMap.getController().getRootId();

  if (selectedNodeId && selectedNodeId !== rootId) {
    // Add child to selected non-root node (ignore side parameter)
    return mindMap.addChildToNode(selectedNodeId, randomTopic, randomType);
  } else {
    // No selection or root selected, add to specified side of root
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

// Cache management function
(window as any).clearCaches = () => {
  mindMap.getController().clearCaches();
  console.log("🧹 Caches cleared!");
};

// Performance testing function
(window as any).performanceTest = (nodeCount: number = 100) => {
  console.log(`🚀 Starting performance test with ${nodeCount} nodes...`);

  const startTime = performance.now();

  // Add many nodes quickly to test batching performance
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

  // Test cache stats if available
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

// Instructions for users
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
• performanceTest(100) - performance test with N nodes
• clearCaches() - clear connection and visibility caches

Example: performanceTest(50)
`);

mindMap.render();
