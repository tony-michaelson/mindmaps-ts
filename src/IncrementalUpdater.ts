import { NodePosition } from "./NodePosition";
import Konva from "konva";

export interface NodeState {
  id: string;
  position: NodePosition;
  text: string;
  visible: boolean;
  selected: boolean;
  hash: string;
}

export interface ConnectionState {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPosition: NodePosition;
  toPosition: NodePosition;
  visible: boolean;
  hash: string;
}

export interface LayoutDelta {
  addedNodes: Set<string>;
  removedNodes: Set<string>;
  movedNodes: Map<string, { oldPosition: NodePosition; newPosition: NodePosition }>;
  changedNodes: Map<string, { oldState: NodeState; newState: NodeState }>;
  addedConnections: Set<string>;
  removedConnections: Set<string>;
  movedConnections: Map<string, { oldState: ConnectionState; newState: ConnectionState }>;
}

export class IncrementalUpdater {
  private previousNodeStates: Map<string, NodeState> = new Map();
  private previousConnectionStates: Map<string, ConnectionState> = new Map();
  private dirtyNodes: Set<string> = new Set();
  private dirtyConnections: Set<string> = new Set();
  
  markNodeDirty(nodeId: string): void {
    this.dirtyNodes.add(nodeId);
  }

  markConnectionDirty(connectionId: string): void {
    this.dirtyConnections.add(connectionId);
  }

  clearDirtyFlags(): void {
    this.dirtyNodes.clear();
    this.dirtyConnections.clear();
  }

  calculateNodeHash(nodeState: Partial<NodeState>): string {
    const { id, position, text, visible, selected } = nodeState;
    const posStr = position ? `${position.x},${position.y},${position.level},${position.stackIndex},${position.side}` : '';
    return `${id}|${posStr}|${text}|${visible}|${selected}`;
  }

  calculateConnectionHash(connectionState: Partial<ConnectionState>): string {
    const { id, fromNodeId, toNodeId, fromPosition, toPosition, visible } = connectionState;
    const fromPosStr = fromPosition ? `${fromPosition.x},${fromPosition.y}` : '';
    const toPosStr = toPosition ? `${toPosition.x},${toPosition.y}` : '';
    return `${id}|${fromNodeId}|${toNodeId}|${fromPosStr}|${toPosStr}|${visible}`;
  }

  calculateDelta(
    currentNodes: Map<string, NodeState>,
    currentConnections: Map<string, ConnectionState>
  ): LayoutDelta {
    const delta: LayoutDelta = {
      addedNodes: new Set(),
      removedNodes: new Set(),
      movedNodes: new Map(),
      changedNodes: new Map(),
      addedConnections: new Set(),
      removedConnections: new Set(),
      movedConnections: new Map()
    };

    for (const nodeId of this.previousNodeStates.keys()) {
      if (!currentNodes.has(nodeId)) {
        delta.removedNodes.add(nodeId);
      }
    }

    for (const [nodeId, currentState] of currentNodes) {
      const previousState = this.previousNodeStates.get(nodeId);
      
      if (!previousState) {
        delta.addedNodes.add(nodeId);
      } else {
        const positionChanged = 
          currentState.position.x !== previousState.position.x ||
          currentState.position.y !== previousState.position.y;
          
        const stateChanged = currentState.hash !== previousState.hash;
        
        if (positionChanged) {
          delta.movedNodes.set(nodeId, {
            oldPosition: previousState.position,
            newPosition: currentState.position
          });
        }
        
        if (stateChanged && !positionChanged) {
          delta.changedNodes.set(nodeId, {
            oldState: previousState,
            newState: currentState
          });
        }
      }
    }

    for (const connectionId of this.previousConnectionStates.keys()) {
      if (!currentConnections.has(connectionId)) {
        delta.removedConnections.add(connectionId);
      }
    }

    for (const [connectionId, currentState] of currentConnections) {
      const previousState = this.previousConnectionStates.get(connectionId);
      
      if (!previousState) {
        delta.addedConnections.add(connectionId);
      } else if (currentState.hash !== previousState.hash) {
        delta.movedConnections.set(connectionId, {
          oldState: previousState,
          newState: currentState
        });
      }
    }

    return delta;
  }

  updatePreviousStates(
    currentNodes: Map<string, NodeState>,
    currentConnections: Map<string, ConnectionState>
  ): void {
    this.previousNodeStates = new Map(currentNodes);
    this.previousConnectionStates = new Map(currentConnections);
  }

  getDirtyNodes(): Set<string> {
    return new Set(this.dirtyNodes);
  }

  getDirtyConnections(): Set<string> {
    return new Set(this.dirtyConnections);
  }

  shouldUpdateNode(nodeId: string): boolean {
    return this.dirtyNodes.has(nodeId);
  }

  shouldUpdateConnection(connectionId: string): boolean {
    return this.dirtyConnections.has(connectionId);
  }

  buildCurrentNodeState(
    nodeId: string,
    position: NodePosition,
    text: string,
    visible: boolean,
    selected: boolean
  ): NodeState {
    const state: NodeState = {
      id: nodeId,
      position,
      text,
      visible,
      selected,
      hash: ''
    };
    
    state.hash = this.calculateNodeHash(state);
    return state;
  }

  buildCurrentConnectionState(
    connectionId: string,
    fromNodeId: string,
    toNodeId: string,
    fromPosition: NodePosition,
    toPosition: NodePosition,
    visible: boolean
  ): ConnectionState {
    const state: ConnectionState = {
      id: connectionId,
      fromNodeId,
      toNodeId,
      fromPosition,
      toPosition,
      visible,
      hash: ''
    };
    
    state.hash = this.calculateConnectionHash(state);
    return state;
  }

  hasSignificantChanges(delta: LayoutDelta): boolean {
    return (
      delta.addedNodes.size > 0 ||
      delta.removedNodes.size > 0 ||
      delta.movedNodes.size > 0 ||
      delta.changedNodes.size > 0 ||
      delta.addedConnections.size > 0 ||
      delta.removedConnections.size > 0 ||
      delta.movedConnections.size > 0
    );
  }

  optimizeUpdateOrder(delta: LayoutDelta): string[] {
    const updateOrder: string[] = [];
    
    Array.from(delta.removedNodes).forEach(nodeId => updateOrder.push(`remove-node-${nodeId}`));
    Array.from(delta.removedConnections).forEach(connId => updateOrder.push(`remove-connection-${connId}`));
    Array.from(delta.addedNodes).forEach(nodeId => updateOrder.push(`add-node-${nodeId}`));
    Array.from(delta.movedNodes.keys()).forEach(nodeId => updateOrder.push(`move-node-${nodeId}`));
    Array.from(delta.changedNodes.keys()).forEach(nodeId => updateOrder.push(`change-node-${nodeId}`));
    Array.from(delta.addedConnections).forEach(connId => updateOrder.push(`add-connection-${connId}`));
    Array.from(delta.movedConnections.keys()).forEach(connId => updateOrder.push(`move-connection-${connId}`));
    
    return updateOrder;
  }

  getDeltaStats(delta: LayoutDelta): {
    totalChanges: number;
    nodeChanges: number;
    connectionChanges: number;
    breakdown: Record<string, number>;
  } {
    const breakdown = {
      addedNodes: delta.addedNodes.size,
      removedNodes: delta.removedNodes.size,
      movedNodes: delta.movedNodes.size,
      changedNodes: delta.changedNodes.size,
      addedConnections: delta.addedConnections.size,
      removedConnections: delta.removedConnections.size,
      movedConnections: delta.movedConnections.size
    };

    const nodeChanges = breakdown.addedNodes + breakdown.removedNodes + breakdown.movedNodes + breakdown.changedNodes;
    const connectionChanges = breakdown.addedConnections + breakdown.removedConnections + breakdown.movedConnections;
    const totalChanges = nodeChanges + connectionChanges;

    return {
      totalChanges,
      nodeChanges,
      connectionChanges,
      breakdown
    };
  }

  reset(): void {
    this.previousNodeStates.clear();
    this.previousConnectionStates.clear();
    this.clearDirtyFlags();
  }
}