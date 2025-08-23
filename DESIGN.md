# TypeScript Mindmapping Library Design Document

## Overview

This TypeScript mindmapping library is built on Konva.js for 2D canvas graphics and implements a sophisticated hierarchical layout system with drag-and-drop interaction capabilities. The architecture follows a clear separation of concerns with distinct layers for presentation, business logic, layout calculation, and optimization.

## Architecture Overview

The system follows a **layered MVC-like pattern** with the following key layers:

1. **Presentation Layer**: `MindMap` class - handles UI events, keyboard shortcuts, and provides public API
2. **Controller Layer**: `MindmapController` class - manages business logic, node relationships, and coordinates operations
3. **Layout Engine**: `HierarchicalPositioner` + `TreeLayout` - calculates optimal node positions using outline-based algorithms
4. **Visual Layer**: `Node` class - handles individual node rendering, styling, and visual states
5. **Optimization Layer**: `ConnectionCache` + `BatchProcessor` - provides performance optimizations

## Core Classes and Responsibilities

### MindMap (`src/MindMap.ts`)
**Primary orchestrator and public API**

- **Role**: Main entry point that sets up Konva stage and delegates to controller
- **Key Responsibilities**:
  - Creates and manages Konva Stage and Layer
  - Handles keyboard shortcuts (arrow keys for root siblings, Enter for children, Delete for removal)
  - Provides public API methods for external control
  - Manages canvas dragging/panning
  - Delegates business logic to MindmapController

```typescript
// Key keyboard shortcuts
ArrowLeft/Right: Add nodes to root's left/right sides
Enter: Add child to selected node
Delete/Backspace: Remove selected node
```

### MindmapController (`src/MindMapController.ts`)
**Business logic and state management center**

- **Role**: Coordinates between visual nodes, positioning, and connections
- **Key Responsibilities**:
  - Node lifecycle management (create, update, remove)
  - Parent-child relationship tracking via `childrenMap`
  - Selection state management
  - Drag-and-drop operations (reparenting, reordering)
  - Connection line management and updates
  - Animation coordination
  - Performance optimizations through batching

**State Management**:
- `konvaNodes`: Map of nodeId → Node instances
- `connections`: Map of connectionId → Konva.Shape
- `selectedNodeId`: Currently selected node
- `rootId`: Reference to root node

### HierarchicalPositioner (`src/HierarchicalPositioner.ts`)
**Core layout algorithm coordinator**

- **Role**: Manages spatial relationships and delegates complex calculations to TreeLayout
- **Key Responsibilities**:
  - Maintains node position cache (`nodePositions`)
  - Tracks left/right side assignments (`nodeSides`)
  - Parent-child relationships (`childrenMap`)
  - Coordinates with TreeLayout for outline-based positioning
  - Triggers full layout recalculations when structure changes

### TreeLayout (`src/TreeLayout.ts`) + Outline (`src/Outline.ts`)
**Advanced collision-free layout engine**

- **Role**: Implements sophisticated outline-based layout algorithm for optimal spacing
- **Key Features**:
  - **Outline-based collision detection**: Each subtree has geometric outline representation
  - **Precise spacing calculations**: Uses line-sweep algorithm for minimum required spacing
  - **Hierarchical layout**: Supports unlimited depth with automatic positioning
  - **Left/right branching**: Separate layout calculations for each side of root

**Algorithm Details**:
1. Build tree structures for left and right sides separately
2. Calculate optimal positions using outline collision avoidance
3. Apply horizontal and vertical spacing constraints
4. Return absolute positions for all nodes

### Node (`src/Node.ts`)
**Individual node visual representation**

- **Role**: Encapsulates all visual aspects of mindmap nodes
- **Key Features**:
  - **Adaptive text wrapping**: Automatically wraps text at 25-character limit
  - **Dynamic text color**: Uses luminosity calculation for optimal contrast
  - **Visual state management**: Selected, activated, collapsed, dragging, drop-target states
  - **Type-based styling**: Different colors and shapes based on NodeType

**Visual States**:
- **Default**: Gray border, standard shadow
- **Selected**: Dashed blue border
- **Dragging**: Semi-transparent with blue glow  
- **Drop Target**: Bright green border with glow
- **Activated**: Solid blue border

## Layout and Positioning System

### Hierarchical Layout Strategy

The layout system uses a **two-phase approach**:

1. **Structure Phase**: Build tree representations of left/right node hierarchies
2. **Layout Phase**: Calculate positions using outline-based collision avoidance

### Outline-Based Positioning

Each subtree maintains geometric outlines (top and bottom borders) that enable:
- **Collision-free placement**: No nodes overlap regardless of text length
- **Optimal spacing**: Minimum required spacing between subtrees
- **Scalable hierarchy**: Works efficiently with deep nesting

### Coordinate System

- **Root Position**: Always centered at `(rootX, rootY)`
- **Left/Right Branching**: First-level children extend horizontally from root
- **Vertical Stacking**: Siblings are vertically arranged with collision-aware spacing
- **Center-Based**: All calculations use node center coordinates

## State Management

### Node State Hierarchy

```
MindMap (selectedNodeId) 
  ↓
MindmapController (konvaNodes, connections, childrenMap)
  ↓  
HierarchicalPositioner (nodePositions, nodeSides, childrenMap)
  ↓
Node (visual states: selected, dragging, dropTarget)
```

### Data Flow

1. **User Action** → MindMap handles event
2. **Business Logic** → MindmapController processes operation
3. **Position Calculation** → HierarchicalPositioner + TreeLayout compute new positions
4. **Visual Update** → Node instances update appearance
5. **Connection Update** → Connection lines recalculated and redrawn

## Drag and Drop System

### Drag Operation Flow

1. **Drag Start**: Node enters dragging visual state
2. **Drag Move**: 
   - Connection lines update in real-time
   - Drop target highlighting (150ms throttled)
   - Visual position tracking
3. **Drag End**: Determines final operation based on drop position

### Drop Target Detection

- **Reparenting**: Dropping on another node (with cycle prevention)
- **Sibling Reordering**: Dropping between siblings of same parent
- **Snap Back**: Invalid drops return to original position

### Reparenting Logic

- Prevents cycles (can't reparent to own descendant)
- Updates parent-child relationships
- Triggers full layout recalculation
- Maintains side assignments (left/right)
- Animates all affected nodes to new positions

## Connection Management

### Connection Rendering Strategy

Connections use **quadratic Bézier curves** for smooth, organic appearance:

```typescript
// Control point calculation for curved connections
const controlX = parentCenterX;
const controlY = childCenterY - (parentCenterY - childCenterY) * 0.5;
```

### Performance Optimizations

- **Viewport Culling**: Only render visible connections
- **Connection Caching**: Memoized connection shapes (via `ConnectionCache`)
- **Smart Updates**: Update only affected connections during operations
- **Animation-Aware Updates**: Efficient connection updates during tweens

## Styling and Visual Design

### Node Types and Colors

```typescript
ROOT:     "#22AAE0" (Blue)
TASK:     "#4CAF50" (Green)  
IDEA:     "#FF9800" (Orange)
RESOURCE: "#9C27B0" (Purple)
DEADLINE: "#F44336" (Red)
```

### Visual Hierarchy

- **Root Node**: Distinctive blue color, always centered
- **Level 1**: Direct children of root, extend left/right
- **Level N**: Descendants maintain parent's side assignment
- **Visual Depth**: Shadow effects provide depth perception

### Text Rendering

- **Font**: Helvetica, 12px, bold
- **Text Wrapping**: 25-character limit with word boundaries
- **Color Adaptation**: Automatic contrast based on background luminosity
- **Alignment**: Center-aligned both horizontally and vertically

## Performance Optimizations

### BatchProcessor (`src/BatchProcessor.ts`)
**Operation batching for performance**

- Groups related operations (moves, adds, removes)
- Executes callbacks at batch completion
- Reduces redundant calculations and redraws

### ConnectionCache (`src/ConnectionCache.ts`) 
**Connection rendering optimizations**

- **Memoized Creation**: Caches connection shapes based on positions
- **Viewport Culling**: Only renders visible connections
- **Visibility Caching**: Caches viewport intersection calculations

### Animation Optimizations

- **Smart Frame Scheduling**: Uses fixed 60 FPS during drag operations, requestAnimationFrame otherwise
- **Throttled Updates**: Connection updates throttled during drag
- **Batch Animations**: Multiple node animations coordinated

## Configuration and Customization

### Layout Configuration (`src/NodePosition.ts`)

```typescript
LAYOUT_CONFIG = {
  width: 120,           // Standard node width
  height: 40,           // Standard node height  
  horizontalSpacing: 8.75,  // Space between levels
  verticalSpacing: 17.5,    // Space between siblings
  maxTextLength: 25     // Text truncation limit
}
```

### Node Type System

- **Extensible Types**: Easy to add new node types
- **Visual Configuration**: Color, shape, and behavior per type
- **Type-Specific Logic**: Custom click behaviors and visual treatments

## Interaction Model

### Mouse Interactions

- **Click**: Select nodes (with visual feedback)
- **Drag**: Move nodes (with real-time connection updates)
- **Canvas Drag**: Pan the entire mindmap

### Keyboard Shortcuts

- **Arrow Keys**: Add children to root's left/right sides
- **Enter**: Add child to selected node
- **Delete/Backspace**: Remove selected node (with confirmation for root)

### Visual Feedback

- **Selection**: Dashed border with root color
- **Drag State**: Semi-transparent with blue glow
- **Drop Target**: Green border with glow effect
- **Hover**: Consistent shadow and border treatments

## Error Handling and Edge Cases

### Robust Operation Handling

- **Cycle Prevention**: Cannot reparent nodes to their own descendants
- **Root Protection**: Root node cannot be deleted or reparented
- **Invalid Positions**: Graceful fallback to original positions
- **Missing Nodes**: Safe handling of stale references

### Performance Safeguards

- **Throttled Updates**: Prevents excessive calculations during drag
- **Batch Processing**: Groups operations to reduce redundant work  
- **Cache Management**: Automatic cache invalidation and cleanup

## Extensibility Points

### Adding New Features

1. **New Node Types**: Extend `NodeType` enum and `NODE_CONFIGS`
2. **Custom Behaviors**: Add type-specific logic in `MindmapController`
3. **Visual Enhancements**: Extend `Node` class visual states
4. **Layout Algorithms**: Implement alternative positioners

### Integration Points

- **External Data**: Public API methods for programmatic control
- **Event Handling**: Callback system for selection changes
- **Custom Rendering**: Konva layer access for additional graphics
- **Animation System**: Tween coordination for custom animations

## Testing Strategy

The current implementation focuses on **end-to-end testing** with Playwright:
- **UI Interaction Testing**: Validates keyboard shortcuts and mouse operations
- **Visual Regression**: Screenshot-based validation of layout and appearance
- **Performance Testing**: Ensures smooth operation under various scenarios

## Future Enhancement Opportunities

### Potential Features
- **Multi-selection**: Select and operate on multiple nodes
- **Undo/Redo**: Operation history with rollback capability
- **Export/Import**: Save and load mindmap structures
- **Collaborative Editing**: Real-time multi-user support
- **Advanced Layouts**: Alternative layout algorithms (radial, force-directed)
- **Rich Text**: Enhanced text formatting and media support

### Performance Improvements
- **Virtual Rendering**: Render only visible nodes for massive mindmaps
- **Web Workers**: Offload layout calculations for better responsiveness
- **Incremental Updates**: More granular change detection and updates

This design provides a solid foundation for a professional-grade mindmapping application while maintaining clean separation of concerns and excellent performance characteristics.