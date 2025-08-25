# TypeScript Mindmapping Library

A modern, performant mindmapping library built with TypeScript and Konva.js, featuring sophisticated 3D node rendering, advanced layout algorithms, and smooth drag-and-drop interactions.

## Features

### <� Visual Design

- **Multiple Node Types**: ROOT, TASK, IDEA, RESOURCE, DEADLINE, LINK, and 3D CUBE nodes
- **3D Geometric Nodes**: Special CUBE type with realistic isometric 3D rectangles
- **Adaptive Text Rendering**: Automatic text wrapping and color contrast optimization
- **Visual State Management**: Selection, dragging, drop-target, and activation states
- **Dynamic Resizing**: Nodes scale automatically with text content, including 3D cubes

### =� Advanced Layout Engine

- **Outline-Based Positioning**: Collision-free node placement using geometric outlines
- **Hierarchical Layout**: Unlimited depth with automatic left/right branching
- **Smart Spacing**: Optimal spacing calculations for different text lengths
- **Real-time Updates**: Smooth animations during structure changes

### <� Interaction System

- **Drag & Drop**: Intuitive node reparenting and reordering
- **Keyboard Shortcuts**: Efficient mindmap navigation and editing
- **Context Menus**: Right-click operations for node management
- **Text Editing**: In-place text editing with dialog and textarea modes

### � Performance Optimizations

- **Connection Caching**: Memoized connection line rendering
- **Viewport Culling**: Only render visible elements
- **Batch Processing**: Grouped operations for optimal performance
- **Animation Coordination**: Smooth 60fps animations with smart scheduling

## Quick Start

### Installation

```bash
npm install
npm run dev
```

### Basic Usage

```typescript
import { MindMap } from "./src/MindMap";
import { NodeType } from "./src/NodePosition";

// Create a mindmap
const mindMap = new MindMap("container", 1200, 800);

// Add nodes
const taskId = mindMap.addRootChild("My Task", NodeType.TASK, "right");
const cubeId = mindMap.addRootChild("3D Cube", NodeType.CUBE, "left");

// Add children
mindMap.addChildToNode(taskId, "Subtask", NodeType.IDEA);

// Render the mindmap
mindMap.render();
```

## Node Types

| Type       | Description              | Visual Style                        |
| ---------- | ------------------------ | ----------------------------------- |
| `ROOT`     | Central node             | Blue rectangle                      |
| `TASK`     | Action items             | Green rectangle                     |
| `IDEA`     | Concepts and thoughts    | Orange circle                       |
| `RESOURCE` | References and materials | Purple rectangle                    |
| `DEADLINE` | Time-sensitive items     | Red diamond                         |
| `LINK`     | External links           | Blue circle                         |
| `CUBE`     | 3D geometric nodes       | Green 3D rectangle with depth faces |

## Keyboard Shortcuts

- **Arrow Left (�)**: Add node to root's left side
- **Arrow Right (�)**: Add node to root's right side
- **Enter**: Add child to selected node
- **Tab**: Add child to selected node
- **Delete/Backspace**: Remove selected node

## Development Commands

The library includes comprehensive testing functions accessible via browser console:

### Basic Node Operations

```javascript
// Add nodes of different types
addRandomNode("left"); // Add random node to left side
addRandomNode("right"); // Add random node to right side
addChildToNode(nodeId); // Add child to specific node

// 3D Cube node operations
addCubeNode("right", "My 3D Node"); // Add 3D cube node
testCubeNodes(); // Test cubes with different text lengths
testCubeResize(); // Test cube resizing during editing
showClean3DCubes(); // Demo clean 3D geometric design
```

### Advanced Features

```javascript
// Link nodes with URLs
addLinkNode("left", "https://example.com");
testLinkCallback(); // Test link double-click behavior
setCustomLinkCallback(); // Set custom link handlers

// Data management
testNodeData(nodeId); // Test node data storage
testExportImportData(); // Test mindmap export/import

// Utility functions
listRootChildren(); // Show all root children
moveToOppositeSide(nodeId); // Move node to opposite side
clearCaches(); // Clear performance caches
performanceTest(100); // Performance test with N nodes
```

## 3D Cube Nodes

The CUBE node type provides a unique 3D geometric appearance:

### Features

- **Isometric 3D Rectangles**: Three visible faces (front, right, top)
- **Dynamic Scaling**: Entire 3D structure resizes with text content
- **Geometric Design**: Sharp corners and no drop shadows for clean appearance
- **Proportional Depth**: Depth calculated as 25% of smaller dimension
- **Smart Rebuilding**: Efficient reconstruction during text editing

### Usage Example

```javascript
// Create 3D cube nodes
const cubeId = addCubeNode("right", "Short Text");
const largeCubeId = addCubeNode(
  "left",
  "Much longer text that demonstrates dynamic 3D scaling"
);

// Test resizing
testCubeResize(); // Creates a cube and provides editing instructions
```

## Architecture

The library follows a clean MVC-like architecture:

- **MindMap**: Main orchestrator and public API
- **MindmapController**: Business logic and state management
- **HierarchicalPositioner**: Layout calculations and node positioning
- **TreeLayout + Outline**: Advanced collision-free positioning algorithms
- **Node**: Individual node visual representation and 3D rendering

## Testing

### End-to-End Tests

```bash
npm run test:e2e          # Run headless tests
npm run test:e2e:headed   # Run with browser UI
```

### Manual Testing

The development environment provides extensive testing functions:

- Interactive node creation and editing
- 3D cube visualization and resizing
- Performance testing with large node counts
- Export/import functionality validation

## Configuration

### Layout Settings

```typescript
LAYOUT_CONFIG = {
  width: 120, // Standard node width
  height: 40, // Standard node height
  horizontalSpacing: 40, // Space between levels
  verticalSpacing: 20, // Space between siblings
  maxTextLength: 25, // Text wrapping limit
  maxNodeTextLength: 120, // Maximum total text length
};
```

### Node Type Configuration

Easily extensible through `NODE_CONFIGS` mapping in `NodePosition.ts`.

## Performance

- **Efficient Rendering**: Viewport culling and connection caching
- **Smooth Animations**: 60fps coordinated animations
- **Scalable Layout**: Handles hundreds of nodes with outline-based algorithms
- **Memory Management**: Automatic cache cleanup and garbage collection

## Browser Support

- Modern browsers supporting Canvas and ES6+
- Tested on Chrome, Firefox, Safari, and Edge
- Mobile touch support for basic interactions

## Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests: `npm run test:e2e`
4. Ensure lint passes: `npm run lint`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Documentation

For detailed architecture and implementation information, see [DESIGN.md](./DESIGN.md).

## TODOs

- Create a new HierachicalPositioner that is more efficient.
