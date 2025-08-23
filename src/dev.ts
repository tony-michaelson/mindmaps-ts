import { MindMap } from "./MindMap";
import { NodeType } from "./NodePosition";
import { PerformanceTest } from "./performance-test";

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

// Add some helper functions for demo purposes
(window as any).addRandomNode = (side: "left" | "right" = "right") => {
  const topics = ["Research", "Design", "Development", "Testing", "Review"];
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

// Performance testing setup (reuse existing mindmap)
(window as any).runPerformanceTests = async () => {
  console.log('Running performance tests on current mindmap...');
  const performanceTest = new PerformanceTest("container", window.innerWidth, window.innerHeight);
  // Replace the test mindmap with our existing one
  (performanceTest as any).mindMap = mindMap;
  return await performanceTest.runAllTests();
};

// Performance monitoring functions
(window as any).getPerformanceStats = () => mindMap.getPerformanceStats();
(window as any).optimizeForLargeDataset = () => mindMap.optimizeForLargeDataset();
(window as any).clearCaches = () => mindMap.clearPerformanceCaches();

// Batch operations for performance
(window as any).addManyNodes = (count: number = 10, side: "left" | "right" = "right") => {
  console.log(`Adding ${count} nodes in batch...`);
  const startTime = performance.now();
  
  const operations = [];
  for (let i = 0; i < count; i++) {
    const topics = ["Task", "Idea", "Resource", "Goal", "Note"];
    const types = [NodeType.TASK, NodeType.IDEA, NodeType.RESOURCE, NodeType.DEADLINE];
    
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const randomType = types[Math.floor(Math.random() * types.length)];
    
    operations.push(() => mindMap.addRootChild(`${randomTopic} ${i + 1}`, randomType, side));
  }
  
  const results = mindMap.batchOperations(operations);
  const endTime = performance.now();
  
  console.log(`✅ Added ${results.length} nodes in ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`📊 Performance stats:`, mindMap.getPerformanceStats());
  
  return results;
};

// Instructions for users
console.log(`
🎯 MindMap Controls (Performance Optimized):
• Click anywhere on canvas to add nodes
• Use Arrow Keys: ← → to add nodes to left/right of root
• Use Enter to add child nodes (to be implemented)
• Use Delete/Backspace to remove nodes (to be implemented)

🔧 Developer Commands:
• addRandomNode('left'/'right') - adds child to selected node, or to root side if root/none selected
• addChildToNode(nodeId)
• mindMap.getNodeCount()
• mindMap.getRootId()

⚡ Performance Commands:
• runPerformanceTests() - run comprehensive performance test suite
• addManyNodes(count, side) - add many nodes efficiently (try: addManyNodes(50))
• getPerformanceStats() - see current performance metrics
• optimizeForLargeDataset() - optimize for handling large mind maps
• clearCaches() - clear performance caches

📊 Performance Features Enabled:
✅ Aggressive memoization for calculations
✅ Viewport culling for off-screen elements  
✅ Event batching for multiple operations
✅ Incremental updates (only changed elements)
✅ Optimized redraw triggers
✅ Object pooling for memory efficiency

Example: addManyNodes(20, 'right')
`);

mindMap.render();
