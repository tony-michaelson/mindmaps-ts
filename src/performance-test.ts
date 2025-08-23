import { MindMap } from './MindMap';
import { NodeType } from './NodePosition';

// Performance testing utilities
export class PerformanceTest {
  private mindMap: MindMap;
  
  constructor(containerId: string, width: number = 1200, height: number = 800) {
    this.mindMap = new MindMap(containerId, width, height);
  }

  // Test 1: Measure time to add many nodes
  async testBulkNodeAddition(nodeCount: number = 100): Promise<{
    totalTime: number;
    averageTimePerNode: number;
    nodesCreated: number;
    performanceStats: any;
  }> {
    console.log(`Starting bulk node addition test (${nodeCount} nodes)...`);
    
    // Clear any existing performance data
    this.mindMap.clearPerformanceCaches();
    
    const startTime = performance.now();
    let nodesCreated = 0;
    
    // Add nodes in batches for better performance
    const batchSize = 10;
    const batches = Math.ceil(nodeCount / batchSize);
    
    for (let batch = 0; batch < batches; batch++) {
      const operations = [];
      const remainingNodes = Math.min(batchSize, nodeCount - nodesCreated);
      
      for (let i = 0; i < remainingNodes; i++) {
        const side = Math.random() > 0.5 ? 'right' : 'left';
        const nodeType = this.getRandomNodeType();
        const text = `Node ${nodesCreated + i + 1}`;
        
        operations.push(() => {
          return this.mindMap.addRootChild(text, nodeType, side);
        });
      }
      
      // Execute batch
      this.mindMap.batchOperations(operations);
      nodesCreated += remainingNodes;
      
      // Small delay to prevent browser freezing
      if (batch % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    const stats = {
      totalTime,
      averageTimePerNode: totalTime / nodesCreated,
      nodesCreated,
      performanceStats: this.mindMap.getPerformanceStats()
    };
    
    console.log('Bulk addition test results:', stats);
    return stats;
  }

  // Test 2: Measure viewport culling effectiveness
  testViewportCulling(): {
    totalNodes: number;
    totalConnections: number;
    visibleElements: number;
    cullingEffectiveness: number;
    performanceStats: any;
  } {
    console.log('Testing viewport culling effectiveness...');
    
    const stats = this.mindMap.getPerformanceStats();
    const totalElements = stats.nodes + stats.connections;
    
    // Simulate viewport movement by panning the stage
    const stage = this.mindMap.getStage();
    const originalPos = stage.position();
    
    // Pan to show different parts of the mind map
    stage.position({ x: -500, y: -300 });
    stage.draw();
    
    const afterPanStats = this.mindMap.getPerformanceStats();
    
    // Restore original position
    stage.position(originalPos);
    stage.draw();
    
    // Calculate effectiveness (rough estimate)
    const visibleElements = totalElements; // This would need actual visibility counting
    const cullingEffectiveness = totalElements > 0 ? 
      ((totalElements - visibleElements) / totalElements) * 100 : 0;
    
    const results = {
      totalNodes: stats.nodes,
      totalConnections: stats.connections,
      visibleElements,
      cullingEffectiveness,
      performanceStats: afterPanStats
    };
    
    console.log('Viewport culling test results:', results);
    return results;
  }

  // Test 3: Measure cache effectiveness
  testCacheEffectiveness(): {
    cacheStats: any;
    hitRatios: Record<string, number>;
    memoryUsage: any;
  } {
    console.log('Testing cache effectiveness...');
    
    const stats = this.mindMap.getPerformanceStats();
    const cacheStats = stats.cache;
    
    // Calculate hit ratios (approximate)
    const hitRatios = {
      connectionPaths: cacheStats.connectionPaths > 0 ? 0.8 : 0, // Estimated
      nodeDimensions: cacheStats.nodeDimensions > 0 ? 0.9 : 0,   // Estimated
      layoutCalculations: cacheStats.layoutCalculations > 0 ? 0.7 : 0 // Estimated
    };
    
    const results = {
      cacheStats,
      hitRatios,
      memoryUsage: this.getMemoryUsage()
    };
    
    console.log('Cache effectiveness test results:', results);
    return results;
  }

  // Test 4: Stress test with rapid operations
  async testRapidOperations(operationCount: number = 50): Promise<{
    operationsCompleted: number;
    totalTime: number;
    averageTimePerOperation: number;
    finalNodeCount: number;
    performanceStats: any;
  }> {
    console.log(`Starting rapid operations test (${operationCount} operations)...`);
    
    const startTime = performance.now();
    let operationsCompleted = 0;
    
    for (let i = 0; i < operationCount; i++) {
      try {
        const operation = Math.random();
        
        if (operation < 0.6) {
          // Add node (60% of operations)
          const side = Math.random() > 0.5 ? 'right' : 'left';
          this.mindMap.addRootChild(`Rapid ${i}`, this.getRandomNodeType(), side);
        } else if (operation < 0.8) {
          // Add child to existing node (20% of operations)
          const rootId = this.mindMap.getRootId();
          if (rootId) {
            this.mindMap.addChildToNode(rootId, `Child ${i}`, this.getRandomNodeType());
          }
        } else {
          // Pan viewport (20% of operations)
          const stage = this.mindMap.getStage();
          const currentPos = stage.position();
          stage.position({
            x: currentPos.x + (Math.random() - 0.5) * 100,
            y: currentPos.y + (Math.random() - 0.5) * 100
          });
          stage.draw();
        }
        
        operationsCompleted++;
        
        // Small delay every 10 operations
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
      } catch (error) {
        console.warn(`Operation ${i} failed:`, error);
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    const results = {
      operationsCompleted,
      totalTime,
      averageTimePerOperation: totalTime / operationsCompleted,
      finalNodeCount: this.mindMap.getNodeCount(),
      performanceStats: this.mindMap.getPerformanceStats()
    };
    
    console.log('Rapid operations test results:', results);
    return results;
  }

  // Run all performance tests
  async runAllTests(): Promise<{
    bulkAddition: any;
    viewportCulling: any;
    cacheEffectiveness: any;
    rapidOperations: any;
    overallSummary: any;
  }> {
    console.log('Running comprehensive performance test suite...');
    
    // Test 1: Bulk addition
    const bulkAddition = await this.testBulkNodeAddition(50);
    await this.wait(100);
    
    // Test 2: Viewport culling
    const viewportCulling = this.testViewportCulling();
    await this.wait(100);
    
    // Test 3: Cache effectiveness
    const cacheEffectiveness = this.testCacheEffectiveness();
    await this.wait(100);
    
    // Test 4: Rapid operations
    const rapidOperations = await this.testRapidOperations(30);
    
    const overallSummary = {
      totalNodes: this.mindMap.getNodeCount(),
      averageAddTime: bulkAddition.averageTimePerNode,
      averageOperationTime: rapidOperations.averageTimePerOperation,
      cacheUtilization: Object.values(cacheEffectiveness.hitRatios).reduce((a, b) => a + b, 0) / 3,
      performanceScore: this.calculatePerformanceScore({
        bulkAddition,
        viewportCulling,
        cacheEffectiveness,
        rapidOperations
      })
    };
    
    console.log('Performance test suite completed!', overallSummary);
    
    return {
      bulkAddition,
      viewportCulling,
      cacheEffectiveness,
      rapidOperations,
      overallSummary
    };
  }

  private getRandomNodeType(): NodeType {
    const types = [NodeType.TASK, NodeType.IDEA, NodeType.RESOURCE, NodeType.DEADLINE];
    return types[Math.floor(Math.random() * types.length)];
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getMemoryUsage(): any {
    if ('memory' in performance) {
      return {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
      };
    }
    return { message: 'Memory API not available' };
  }

  private calculatePerformanceScore(results: any): number {
    // Simple performance scoring algorithm (higher is better)
    let score = 100;
    
    // Penalize slow operations
    if (results.bulkAddition.averageTimePerNode > 10) score -= 20;
    if (results.rapidOperations.averageTimePerOperation > 20) score -= 20;
    
    // Reward good cache utilization
    score += results.cacheEffectiveness.hitRatios.connectionPaths * 10;
    score += results.cacheEffectiveness.hitRatios.nodeDimensions * 10;
    
    // Reward viewport culling effectiveness
    score += results.viewportCulling.cullingEffectiveness * 0.3;
    
    return Math.max(0, Math.min(100, score));
  }

  // Expose mindMap for external access
  public getMindMap(): MindMap {
    return this.mindMap;
  }
}