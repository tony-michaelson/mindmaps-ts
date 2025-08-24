import Konva from "konva";

interface BatchOperation {
  type: 'nodeMove' | 'nodeAdd' | 'nodeRemove' | 'connectionUpdate';
  nodeId: string;
  data?: any;
}

interface BatchResult {
  nodesToUpdate: Set<string>;
  connectionsToUpdate: Set<string>;
  connectionsToRemove: Set<string>;
  needsRedraw: boolean;
}

export class BatchProcessor {
  private operations: BatchOperation[] = [];
  private isInBatch = false;
  private batchCallbacks: (() => void)[] = [];

  // Start batching operations
  startBatch(): void {
    this.isInBatch = true;
    this.operations = [];
    this.batchCallbacks = [];
  }

  // Add operation to current batch
  addOperation(operation: BatchOperation): void {
    if (this.isInBatch) {
      this.operations.push(operation);
    } else {
      // If not in batch, process immediately
      this.processOperations([operation]);
    }
  }

  // Add callback to execute at end of batch
  addBatchCallback(callback: () => void): void {
    if (this.isInBatch) {
      this.batchCallbacks.push(callback);
    } else {
      callback(); // Execute immediately if not batching
    }
  }

  // End batch and process all accumulated operations
  endBatch(): BatchResult {
    if (!this.isInBatch) {
      return {
        nodesToUpdate: new Set(),
        connectionsToUpdate: new Set(),
        connectionsToRemove: new Set(),
        needsRedraw: false
      };
    }

    const result = this.processOperations(this.operations);
    
    // Execute all batch callbacks
    this.batchCallbacks.forEach(callback => callback());
    
    this.isInBatch = false;
    this.operations = [];
    this.batchCallbacks = [];
    
    return result;
  }

  // Process operations and determine what needs updating
  private processOperations(operations: BatchOperation[]): BatchResult {
    const result: BatchResult = {
      nodesToUpdate: new Set(),
      connectionsToUpdate: new Set(),
      connectionsToRemove: new Set(),
      needsRedraw: false
    };

    // Group operations by type
    const operationsByType = operations.reduce((acc, op) => {
      if (!acc[op.type]) acc[op.type] = [];
      acc[op.type].push(op);
      return acc;
    }, {} as Record<string, BatchOperation[]>);

    // Process node moves
    if (operationsByType.nodeMove) {
      operationsByType.nodeMove.forEach(op => {
        result.nodesToUpdate.add(op.nodeId);
        // Also update connections for moved nodes
        if (op.data?.parentId) {
          result.connectionsToUpdate.add(`${op.data.parentId}|${op.nodeId}`);
        }
        if (op.data?.childrenIds) {
          op.data.childrenIds.forEach((childId: string) => {
            result.connectionsToUpdate.add(`${op.nodeId}|${childId}`);
          });
        }
      });
      result.needsRedraw = true;
    }

    // Process node additions
    if (operationsByType.nodeAdd) {
      operationsByType.nodeAdd.forEach(op => {
        result.nodesToUpdate.add(op.nodeId);
        if (op.data?.parentId) {
          result.connectionsToUpdate.add(`${op.data.parentId}|${op.nodeId}`);
        }
      });
      result.needsRedraw = true;
    }

    // Process node removals
    if (operationsByType.nodeRemove) {
      operationsByType.nodeRemove.forEach(op => {
        if (op.data?.parentId) {
          result.connectionsToRemove.add(`${op.data.parentId}|${op.nodeId}`);
        }
        if (op.data?.childrenIds) {
          op.data.childrenIds.forEach((childId: string) => {
            result.connectionsToRemove.add(`${op.nodeId}|${childId}`);
          });
        }
      });
      result.needsRedraw = true;
    }

    // Process connection updates
    if (operationsByType.connectionUpdate) {
      operationsByType.connectionUpdate.forEach(op => {
        if (op.data?.connectionId) {
          result.connectionsToUpdate.add(op.data.connectionId);
        }
      });
      result.needsRedraw = true;
    }

    return result;
  }

  // Check if currently in batch mode
  isInBatchMode(): boolean {
    return this.isInBatch;
  }

  // Execute function within a batch
  batch<T>(fn: () => T): T {
    const wasInBatch = this.isInBatch;
    
    if (!wasInBatch) {
      this.startBatch();
    }
    
    try {
      const result = fn();
      
      if (!wasInBatch) {
        this.endBatch();
      }
      
      return result;
    } catch (error) {
      if (!wasInBatch) {
        this.endBatch(); // Clean up on error
      }
      throw error;
    }
  }
}