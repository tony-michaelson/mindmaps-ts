import { MindMap } from "./MindMap";
import { NodeType } from "./NodePosition";

const mindMap = new MindMap("container", window.innerWidth, window.innerHeight);

(window as any).mindMap = mindMap;
(window as any).NodeType = NodeType;

(window as any).addRandomNode = (side: "left" | "right" = "right") => {
  const topics = [
    // "The fix ensures that when text editing finishes, siblings will reposition based on the edited node's new dimensions,  ma",
    "Testing",
    "Review",
  ];
  const types = [
    NodeType.TASK,
    NodeType.IDEA,
    NodeType.RESOURCE,
    NodeType.DEADLINE,
    NodeType.CUBE,
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
  const types = [NodeType.TASK, NodeType.IDEA, NodeType.CUBE];

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

(window as any).addLinkNode = (
  side: "left" | "right" = "right",
  url: string = "https://example.com"
) => {
  const linkData = {
    url: url,
    type: "external",
    createdAt: new Date().toISOString(),
  };

  console.log(`🔗 Adding Link node with data:`, linkData);

  const selectedNodeId = mindMap.getController().getSelectedNodeId();
  const rootId = mindMap.getController().getRootId();

  if (selectedNodeId && selectedNodeId !== rootId) {
    return mindMap.addChildToNode(
      selectedNodeId,
      "Link",
      NodeType.LINK,
      linkData
    );
  } else {
    return mindMap.addRootChild("Link", NodeType.LINK, side, linkData);
  }
};

(window as any).testNodeData = (nodeId?: string) => {
  const targetNodeId = nodeId || mindMap.getController().getSelectedNodeId();

  if (!targetNodeId) {
    console.log("❌ No node selected or specified");
    return;
  }

  console.log(
    `📊 Node ${targetNodeId} data:`,
    mindMap.getNodeData(targetNodeId)
  );

  // Test setting new data
  const newData = {
    customField: "test value",
    timestamp: Date.now(),
    tags: ["important", "test"],
  };

  mindMap.setNodeData(targetNodeId, newData);
  console.log(`✅ Updated node data:`, mindMap.getNodeData(targetNodeId));
};

(window as any).testLinkCallback = () => {
  console.log("🔗 Testing link callback functionality...");

  // Add a link node with URL
  const linkId = (window as any).addLinkNode(
    "right",
    "https://github.com/anthropics/claude-code"
  );
  console.log(`✅ Added link node: ${linkId}`);

  // Add another link without URL to test fallback
  const emptyLinkId = mindMap.addRootChild(
    "Empty Link",
    NodeType.LINK,
    "left",
    {
      title: "No URL here",
    }
  );
  console.log(`✅ Added link node without URL: ${emptyLinkId}`);

  console.log("📝 Now double-click on the link nodes to test the callback!");
  console.log("  - The link with URL should open in a new tab");
  console.log("  - The link without URL should not do anything");
  console.log("  - Neither should enter edit mode");
};

(window as any).setCustomLinkCallback = () => {
  console.log("🔧 Setting custom link callback...");

  mindMap.setLinkCallback((nodeId, data) => {
    console.log(`🖱️ Custom link callback triggered for node ${nodeId}`);
    console.log("📊 Node data:", data);

    if (data.url) {
      const proceed = confirm(`Open link: ${data.url}?`);
      if (proceed) {
        window.open(data.url, "_blank");
      }
    } else {
      alert("This link node has no URL data!");
    }
  });

  console.log(
    "✅ Custom callback set! Now double-click link nodes to see the custom behavior."
  );
};

(window as any).addCubeNode = (side: "left" | "right" = "right", text: string = "3D Cube Node") => {
  const selectedNodeId = mindMap.getController().getSelectedNodeId();
  const rootId = mindMap.getController().getRootId();

  console.log(`📦 Adding 3D Cube node: "${text}"`);

  if (selectedNodeId && selectedNodeId !== rootId) {
    return mindMap.addChildToNode(selectedNodeId, text, NodeType.CUBE);
  } else {
    return mindMap.addRootChild(text, NodeType.CUBE, side);
  }
};

(window as any).testCubeNodes = () => {
  console.log("🧪 Testing 3D Cube nodes with different text lengths...");
  
  (window as any).addCubeNode("left", "Short");
  (window as any).addCubeNode("right", "Medium Length Text");
  (window as any).addCubeNode("left", "This is a much longer text that should wrap and show how the 3D cube scales with content");
  
  console.log("✅ Added 3D cube nodes with varying text lengths!");
  console.log("📝 You can see how the 3D rectangles scale properly with the text content.");
  console.log("🔧 Double-click any cube node to edit its text and see it resize!");
};

(window as any).testCubeResize = () => {
  console.log("🔄 Testing cube node resizing...");
  
  const cubeId = (window as any).addCubeNode("right", "Initial Text");
  console.log(`📦 Added cube node: ${cubeId}`);
  console.log("📝 Instructions:");
  console.log("1. Double-click the cube node to edit its text");
  console.log("2. Try changing it to different lengths like:");
  console.log("   - 'Short'");
  console.log("   - 'This is a longer text to test resizing'");  
  console.log("   - 'Very long text that should wrap to multiple lines and demonstrate the 3D cube scaling properly'");
  console.log("3. Press Enter to finish editing and watch the 3D cube resize!");
  
  return cubeId;
};

(window as any).showClean3DCubes = () => {
  console.log("✨ Showcasing clean 3D cube design...");
  
  // Clear existing nodes for a clean demo
  mindMap.clear();
  
  // Add cubes with different sizes to show the clean geometric appearance
  (window as any).addCubeNode("left", "Small");
  (window as any).addCubeNode("right", "Medium sized text");
  (window as any).addCubeNode("left", "Larger text content with multiple words");
  (window as any).addCubeNode("right", "This is a much longer text that wraps to show the clean 3D rectangular shape without shadows or rounded corners");
  
  console.log("✅ Added clean 3D cubes with no shadows or rounded corners!");
  console.log("📐 Notice the sharp geometric edges and how the 3D depth is created purely by the side faces");
  console.log("🎨 The dimensional effect comes from the darker side and top faces, not drop shadows");
};

(window as any).testExportImportData = () => {
  console.log("🔄 Testing export/import with node data...");

  // Add some nodes with data
  const linkId = (window as any).addLinkNode(
    "left",
    "https://github.com/example"
  );
  const taskId = mindMap.addRootChild(
    "Task with data",
    NodeType.TASK,
    "right",
    {
      priority: "high",
      assignee: "Alice",
      dueDate: "2025-12-31",
    }
  );

  console.log("✅ Added nodes with data");

  // Export to JSON
  const exported = mindMap.exportToJson();
  console.log("📤 Exported mindmap:");
  console.log(exported);

  // Clear and import back
  console.log("🧹 Clearing mindmap...");
  mindMap.clear();

  console.log("📥 Importing from JSON...");
  mindMap.importFromJson(exported);

  // Verify data is preserved
  const rootChildren = mindMap.getRootChildren();
  console.log("🔍 Checking imported data:");

  rootChildren.forEach((child) => {
    const data = mindMap.getNodeData(child.nodeId);
    console.log(`Node "${child.text}" data:`, data);
  });

  console.log("✅ Export/import test completed!");
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
• addLinkNode('left'/'right', 'https://example.com') - adds a LINK node with URL data
• addCubeNode('left'/'right', 'text') - adds a 3D cube node with custom text
• testCubeNodes() - test 3D cube nodes with different text lengths
• testCubeResize() - test cube node resizing when text is edited
• showClean3DCubes() - showcase clean 3D cubes without shadows or rounded corners
• testNodeData(nodeId?) - test getting/setting data on selected or specified node
• testLinkCallback() - test link node double-click behavior (opens URLs, no edit mode)
• setCustomLinkCallback() - set a custom link callback that shows confirmation
• testExportImportData() - test export/import functionality with node data preservation
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
