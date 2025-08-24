import Konva from "konva";

interface BatchOperation {
  type: "nodeMove" | "nodeAdd" | "nodeRemove" | "connectionUpdate";
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

  startBatch(): void {
    this.isInBatch = true;
    this.operations = [];
    this.batchCallbacks = [];
  }

  addOperation(operation: BatchOperation): void {
    if (this.isInBatch) {
      this.operations.push(operation);
    } else {
      this.processOperations([operation]);
    }
  }

  addBatchCallback(callback: () => void): void {
    if (this.isInBatch) {
      this.batchCallbacks.push(callback);
    } else {
      callback();
    }
  }

  endBatch(): BatchResult {
    if (!this.isInBatch) {
      return {
        nodesToUpdate: new Set(),
        connectionsToUpdate: new Set(),
        connectionsToRemove: new Set(),
        needsRedraw: false,
      };
    }

    const result = this.processOperations(this.operations);

    this.batchCallbacks.forEach((callback) => callback());

    this.isInBatch = false;
    this.operations = [];
    this.batchCallbacks = [];

    return result;
  }

  private processOperations(operations: BatchOperation[]): BatchResult {
    const result: BatchResult = {
      nodesToUpdate: new Set(),
      connectionsToUpdate: new Set(),
      connectionsToRemove: new Set(),
      needsRedraw: false,
    };

    const operationsByType = operations.reduce((acc, op) => {
      if (!acc[op.type]) acc[op.type] = [];
      acc[op.type].push(op);
      return acc;
    }, {} as Record<string, BatchOperation[]>);

    if (operationsByType.nodeMove) {
      operationsByType.nodeMove.forEach((op) => {
        result.nodesToUpdate.add(op.nodeId);

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

    if (operationsByType.nodeAdd) {
      operationsByType.nodeAdd.forEach((op) => {
        result.nodesToUpdate.add(op.nodeId);
        if (op.data?.parentId) {
          result.connectionsToUpdate.add(`${op.data.parentId}|${op.nodeId}`);
        }
      });
      result.needsRedraw = true;
    }

    if (operationsByType.nodeRemove) {
      operationsByType.nodeRemove.forEach((op) => {
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

    if (operationsByType.connectionUpdate) {
      operationsByType.connectionUpdate.forEach((op) => {
        if (op.data?.connectionId) {
          result.connectionsToUpdate.add(op.data.connectionId);
        }
      });
      result.needsRedraw = true;
    }

    return result;
  }

  isInBatchMode(): boolean {
    return this.isInBatch;
  }

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
        this.endBatch();
      }
      throw error;
    }
  }
}
