import Konva from "konva";

export interface Poolable {
  reset(): void;
  isInUse(): boolean;
  setInUse(inUse: boolean): void;
}

export class KonvaShapePool<T extends Konva.Shape & Poolable> {
  private availableObjects: T[] = [];
  private usedObjects: Set<T> = new Set();
  private factory: () => T;
  private maxSize: number;
  private createCount = 0;
  private reuseCount = 0;

  constructor(factory: () => T, maxSize: number = 100) {
    this.factory = factory;
    this.maxSize = maxSize;
  }

  acquire(): T {
    let obj: T;

    if (this.availableObjects.length > 0) {
      obj = this.availableObjects.pop()!;
      this.reuseCount++;
    } else {
      obj = this.factory();
      this.createCount++;
    }

    obj.reset();
    obj.setInUse(true);
    this.usedObjects.add(obj);

    return obj;
  }

  release(obj: T): void {
    if (!this.usedObjects.has(obj)) {
      console.warn('Attempting to release object not in use');
      return;
    }

    this.usedObjects.delete(obj);
    obj.setInUse(false);
    obj.reset();

    if (this.availableObjects.length < this.maxSize) {
      this.availableObjects.push(obj);
    } else {
      obj.destroy();
    }
  }

  releaseAll(): void {
    const objectsToRelease = Array.from(this.usedObjects);
    objectsToRelease.forEach(obj => this.release(obj));
  }

  getStats() {
    return {
      available: this.availableObjects.length,
      inUse: this.usedObjects.size,
      created: this.createCount,
      reused: this.reuseCount,
      maxSize: this.maxSize,
      efficiency: this.reuseCount / (this.createCount + this.reuseCount) * 100
    };
  }

  clear(): void {
    this.availableObjects.forEach(obj => obj.destroy());
    this.usedObjects.forEach(obj => obj.destroy());
    this.availableObjects.length = 0;
    this.usedObjects.clear();
  }

  preAllocate(count: number): void {
    for (let i = 0; i < count && this.availableObjects.length < this.maxSize; i++) {
      const obj = this.factory();
      obj.setInUse(false);
      this.availableObjects.push(obj);
    }
  }
}

export class PoolableShape extends Konva.Shape implements Poolable {
  private inUse = false;

  reset(): void {
    this.x(0);
    this.y(0);
    this.scaleX(1);
    this.scaleY(1);
    this.rotation(0);
    this.opacity(1);
    this.visible(true);
    this.stroke('#000');
    this.strokeWidth(1);
    this.fill('transparent');
  }

  isInUse(): boolean {
    return this.inUse;
  }

  setInUse(inUse: boolean): void {
    this.inUse = inUse;
  }
}

export class PoolableConnection extends PoolableShape {
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private controlX = 0;
  private controlY = 0;

  setConnectionPoints(
    fromX: number, fromY: number,
    toX: number, toY: number,
    controlX: number, controlY: number
  ): void {
    this.fromX = fromX;
    this.fromY = fromY;
    this.toX = toX;
    this.toY = toY;
    this.controlX = controlX;
    this.controlY = controlY;
  }

  _sceneFunc(context: any, shape: any) {
    context.beginPath();
    context.moveTo(this.fromX, this.fromY);
    context.quadraticCurveTo(this.controlX, this.controlY, this.toX, this.toY);
    context.fillStrokeShape(shape);
  }

  reset(): void {
    super.reset();
    this.fromX = 0;
    this.fromY = 0;
    this.toX = 0;
    this.toY = 0;
    this.controlX = 0;
    this.controlY = 0;
    this.stroke("#838383ff");
    this.strokeWidth(1);
    this.listening(false);
  }
}

export class PoolableRect extends Konva.Rect implements Poolable {
  private inUse = false;

  reset(): void {
    this.x(0);
    this.y(0);
    this.width(100);
    this.height(40);
    this.fill('#ffffff');
    this.stroke('#000000');
    this.strokeWidth(1);
    this.cornerRadius(5);
    this.opacity(1);
    this.visible(true);
    this.scaleX(1);
    this.scaleY(1);
    this.rotation(0);
  }

  isInUse(): boolean {
    return this.inUse;
  }

  setInUse(inUse: boolean): void {
    this.inUse = inUse;
  }
}

export class PoolableText extends Konva.Text implements Poolable {
  private inUse = false;

  reset(): void {
    this.x(0);
    this.y(0);
    this.text('');
    this.fontSize(14);
    this.fontFamily('Arial');
    this.fill('#000000');
    this.align('center');
    this.verticalAlign('middle');
    this.opacity(1);
    this.visible(true);
    this.scaleX(1);
    this.scaleY(1);
    this.rotation(0);
  }

  isInUse(): boolean {
    return this.inUse;
  }

  setInUse(inUse: boolean): void {
    this.inUse = inUse;
  }
}

export class ObjectPoolManager {
  private connectionPool: KonvaShapePool<PoolableConnection>;
  private rectPool: KonvaShapePool<PoolableRect>;
  private textPool: KonvaShapePool<PoolableText>;

  constructor(maxPoolSizes: { connections?: number; rects?: number; texts?: number } = {}) {
    this.connectionPool = new KonvaShapePool(
      () => new PoolableConnection(),
      maxPoolSizes.connections || 200
    );

    this.rectPool = new KonvaShapePool(
      () => new PoolableRect(),
      maxPoolSizes.rects || 100
    );

    this.textPool = new KonvaShapePool(
      () => new PoolableText(),
      maxPoolSizes.texts || 100
    );
  }

  acquireConnection(): PoolableConnection {
    return this.connectionPool.acquire();
  }

  releaseConnection(connection: PoolableConnection): void {
    this.connectionPool.release(connection);
  }

  acquireRect(): PoolableRect {
    return this.rectPool.acquire();
  }

  releaseRect(rect: PoolableRect): void {
    this.rectPool.release(rect);
  }

  acquireText(): PoolableText {
    return this.textPool.acquire();
  }

  releaseText(text: PoolableText): void {
    this.textPool.release(text);
  }

  releaseAll(): void {
    this.connectionPool.releaseAll();
    this.rectPool.releaseAll();
    this.textPool.releaseAll();
  }

  preAllocate(counts: { connections?: number; rects?: number; texts?: number }): void {
    if (counts.connections) {
      this.connectionPool.preAllocate(counts.connections);
    }
    if (counts.rects) {
      this.rectPool.preAllocate(counts.rects);
    }
    if (counts.texts) {
      this.textPool.preAllocate(counts.texts);
    }
  }

  getStats() {
    return {
      connections: this.connectionPool.getStats(),
      rects: this.rectPool.getStats(),
      texts: this.textPool.getStats()
    };
  }

  clear(): void {
    this.connectionPool.clear();
    this.rectPool.clear();
    this.textPool.clear();
  }

  withPooling<T>(operation: (pools: {
    connections: KonvaShapePool<PoolableConnection>;
    rects: KonvaShapePool<PoolableRect>;
    texts: KonvaShapePool<PoolableText>;
  }) => T): T {
    try {
      return operation({
        connections: this.connectionPool,
        rects: this.rectPool,
        texts: this.textPool
      });
    } catch (error) {
      console.error('Error in pooled operation:', error);
      this.releaseAll();
      throw error;
    }
  }
}