import { test, expect } from "@playwright/test";

// (window as any).mindMap = mindMap; // Expose mindMap for API testing in dev.ts if you need ascertions.

test("should add a node and drag it", async ({ page }) => {
  await page.goto("/");

  // Click center of canvas to add node
  await page.mouse.click(400, 300);

  // Wait for node to appear
  await page.waitForTimeout(500); // Konva render delay

  // Drag node
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(600, 500, { steps: 10 });
  await page.mouse.up();

  // Screenshot to verify position
  await page.screenshot({ path: "tests/screenshots/dragged-node.png" });

  // Optionally: Use pixel comparison or detect node positions via exposed API
});
