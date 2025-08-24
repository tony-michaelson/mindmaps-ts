import { test, expect } from "@playwright/test";

test("should export and import mindmap data correctly", async ({ page }) => {
  await page.goto("/");

  // Wait for mindmap to load
  await page.waitForTimeout(500);

  // Add some test nodes via the global API
  await page.evaluate(() => {
    // Clear any existing nodes
    const mindMap = (window as any).mindMap;
    if (mindMap) {
      mindMap.createRoot("Test Project");
      
      // Add nodes to test export/import
      const taskId = mindMap.addRootChild("Tasks", (window as any).NodeType.TASK, "right");
      const ideaId = mindMap.addRootChild("Ideas", (window as any).NodeType.IDEA, "left");
      
      mindMap.addChildToNode(taskId, "Design UI", (window as any).NodeType.TASK);
      mindMap.addChildToNode(taskId, "Write Tests", (window as any).NodeType.TASK);
      mindMap.addChildToNode(ideaId, "Feature A", (window as any).NodeType.IDEA);
    }
  });

  await page.waitForTimeout(500);

  // Export mindmap data
  const exportedData = await page.evaluate(() => {
    const mindMap = (window as any).mindMap;
    return mindMap ? mindMap.exportToJson() : null;
  });

  // Verify export data exists and has expected structure
  expect(exportedData).toBeTruthy();
  const parsedData = JSON.parse(exportedData);
  expect(parsedData).toHaveProperty('timestamp');
  expect(parsedData).toHaveProperty('tree');
  expect(parsedData.tree).toHaveProperty('id');
  expect(parsedData.tree).toHaveProperty('text');
  expect(parsedData.tree).toHaveProperty('type');
  expect(parsedData.tree.text).toBe('Test Project');
  expect(parsedData.tree.children).toHaveLength(2);

  // Clear the mindmap
  await page.evaluate(() => {
    const mindMap = (window as any).mindMap;
    if (mindMap && mindMap.clear) {
      mindMap.clear();
    }
  });

  await page.waitForTimeout(200);

  // Import the data back
  const importSuccess = await page.evaluate((data) => {
    try {
      const mindMap = (window as any).mindMap;
      if (mindMap && mindMap.importFromJson) {
        mindMap.importFromJson(data);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Import error:', error);
      return false;
    }
  }, exportedData);

  // Verify import was successful
  expect(importSuccess).toBe(true);

  await page.waitForTimeout(500);

  // Verify the imported data matches
  const reimportedData = await page.evaluate(() => {
    const mindMap = (window as any).mindMap;
    return mindMap ? mindMap.exportToJson() : null;
  });

  expect(reimportedData).toBeTruthy();
  const reimportedParsed = JSON.parse(reimportedData);
  
  // Compare tree structures (ignoring timestamps and UUIDs)
  expect(reimportedParsed.tree.text).toBe(parsedData.tree.text);
  expect(reimportedParsed.tree.type).toBe(parsedData.tree.type);
  expect(reimportedParsed.tree.children).toHaveLength(parsedData.tree.children.length);
  
  // Take screenshot for visual verification
  await page.screenshot({ path: "tests/screenshots/import-export-test.png" });
});