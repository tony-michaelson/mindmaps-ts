import { test, expect } from "@playwright/test";

test("debug spacing measurements", async ({ page }) => {
  await page.goto("/");
  
  // Capture all console logs to file
  const logs: any[] = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  
  // Add nodes to both sides to trigger layout calculation
  await page.keyboard.press('ArrowRight'); // Add right node
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowLeft');  // Add left node
  await page.waitForTimeout(500);
  
  // Take screenshot
  await page.screenshot({ path: "tests/screenshots/spacing-debug.png" });
  
  // Log debug info to test output
  const debugLogs = logs.filter(log => 
    log.text.includes('DETAILED SPACING DEBUG') || 
    log.text.includes('child') || 
    log.text.includes('Center:') || 
    log.text.includes('Root') ||
    log.text.includes('LEFT') ||
    log.text.includes('RIGHT')
  );
  console.log("\n=== Debug Output ===");
  console.log(`Found ${debugLogs.length} debug log entries`);
  debugLogs.forEach(log => console.log(log.text));
  
  // Also log total children count
  const allLogs = logs.map(l => l.text).join(' ');
  const rightCount = (allLogs.match(/RIGHT child/g) || []).length;
  const leftCount = (allLogs.match(/LEFT child/g) || []).length;
  console.log(`\nChild count: RIGHT=${rightCount}, LEFT=${leftCount}`);
});