export interface BatchOperation {
  type: 'ADD_NODE' | 'REMOVE_NODE' | 'MOVE_NODE' | 'UPDATE_CONNECTION' | 'LAYOUT_CHANGE';
  data: any;
  nodeId?: string;
  timestamp: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchTime: number;
  autoCommit: boolean;
}

export class BatchManager {
  private batches: Map<string, BatchOperation[]> = new Map();
  private activeBatch: string | null = null;
  private batchTimeout: NodeJS.Timeout | null = null;
  private config: BatchConfig;
  private onBatchCommit?: (operations: BatchOperation[], batchId: string) => void;

  constructor(
    config: Partial<BatchConfig> = {},
    onBatchCommit?: (operations: BatchOperation[], batchId: string) => void
  ) {
    this.config = {
      maxBatchSize: 100,
      maxBatchTime: 50, // 50ms
      autoCommit: true,
      ...config
    };
    this.onBatchCommit = onBatchCommit;
  }

  startBatch(batchId?: string): string {
    const id = batchId || this.generateBatchId();
    
    if (this.activeBatch) {
      this.commitBatch(this.activeBatch);
    }
    
    this.activeBatch = id;
    this.batches.set(id, []);
    
    if (this.config.autoCommit) {
      this.scheduleBatchCommit(id);
    }
    
    return id;
  }

  addOperation(operation: Omit<BatchOperation, 'timestamp'>): void {
    if (!this.activeBatch) {
      this.startBatch();
    }

    const batch = this.batches.get(this.activeBatch!);
    if (!batch) return;

    const fullOperation: BatchOperation = {
      ...operation,
      timestamp: Date.now()
    };

    batch.push(fullOperation);

    if (batch.length >= this.config.maxBatchSize && this.config.autoCommit) {
      this.commitBatch(this.activeBatch!);
    }
  }

  commitBatch(batchId: string): BatchOperation[] {
    const batch = this.batches.get(batchId);
    if (!batch || batch.length === 0) {
      this.batches.delete(batchId);
      return [];
    }

    if (this.activeBatch === batchId) {
      this.activeBatch = null;
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    const operations = this.optimizeBatch(batch);
    
    if (this.onBatchCommit) {
      this.onBatchCommit(operations, batchId);
    }

    this.batches.delete(batchId);
    return operations;
  }

  private optimizeBatch(operations: BatchOperation[]): BatchOperation[] {
    const optimized: BatchOperation[] = [];
    const operationsByNode = new Map<string, BatchOperation[]>();
    const globalOperations: BatchOperation[] = [];

    for (const op of operations) {
      if (op.nodeId) {
        const nodeOps = operationsByNode.get(op.nodeId) || [];
        nodeOps.push(op);
        operationsByNode.set(op.nodeId, nodeOps);
      } else {
        globalOperations.push(op);
      }
    }

    for (const [nodeId, nodeOps] of operationsByNode) {
      const lastMoveOp = this.findLastOperation(nodeOps, 'MOVE_NODE');
      const hasRemove = nodeOps.some(op => op.type === 'REMOVE_NODE');
      
      if (hasRemove) {
        const removeOp = nodeOps.find(op => op.type === 'REMOVE_NODE');
        if (removeOp) {
          optimized.push(removeOp);
        }
        continue;
      }

      const addOp = this.findLastOperation(nodeOps, 'ADD_NODE');
      if (addOp) {
        optimized.push(addOp);
      }

      if (lastMoveOp && (!addOp || lastMoveOp.timestamp > addOp.timestamp)) {
        optimized.push(lastMoveOp);
      }

      const connectionOps = nodeOps.filter(op => op.type === 'UPDATE_CONNECTION');
      if (connectionOps.length > 0) {
        optimized.push(connectionOps[connectionOps.length - 1]);
      }
    }

    optimized.push(...globalOperations);

    return optimized.sort((a, b) => a.timestamp - b.timestamp);
  }

  private findLastOperation(operations: BatchOperation[], type: BatchOperation['type']): BatchOperation | undefined {
    for (let i = operations.length - 1; i >= 0; i--) {
      if (operations[i].type === type) {
        return operations[i];
      }
    }
    return undefined;
  }

  private scheduleBatchCommit(batchId: string): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      if (this.batches.has(batchId)) {
        this.commitBatch(batchId);
      }
    }, this.config.maxBatchTime);
  }

  endBatch(): BatchOperation[] {
    if (!this.activeBatch) {
      return [];
    }

    const operations = this.commitBatch(this.activeBatch);
    this.activeBatch = null;
    return operations;
  }

  isInBatch(): boolean {
    return this.activeBatch !== null;
  }

  getActiveBatchId(): string | null {
    return this.activeBatch;
  }

  getBatchSize(batchId?: string): number {
    const id = batchId || this.activeBatch;
    if (!id) return 0;
    
    const batch = this.batches.get(id);
    return batch ? batch.length : 0;
  }

  clearAllBatches(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    this.batches.clear();
    this.activeBatch = null;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  executeBatch<T>(batchId: string, operations: (() => T)[]): T[] {
    this.startBatch(batchId);
    
    const results: T[] = [];
    
    for (const operation of operations) {
      try {
        const result = operation();
        results.push(result);
      } catch (error) {
        console.error('Error executing batched operation:', error);
      }
    }
    
    this.commitBatch(batchId);
    
    return results;
  }

  getStats() {
    return {
      activeBatches: this.batches.size,
      activeBatchId: this.activeBatch,
      totalOperationsInActiveBatches: Array.from(this.batches.values()).reduce((sum, batch) => sum + batch.length, 0),
      config: this.config
    };
  }
}