# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `npm run dev` - Starts Vite dev server on localhost:5173
- **Build**: `npm run build` - Creates production build using Vite
- **Unit tests**: `npm run test` - Runs Jest tests (note: Jest configured but no unit tests currently exist)
- **E2E tests**: `npm run test:e2e` - Runs Playwright tests headless
- **E2E tests headed**: `npm run test:e2e:headed` - Runs Playwright tests with browser UI

## Architecture Overview

This is a TypeScript mindmapping library built on Konva.js for 2D canvas graphics. The architecture follows an MVC-like pattern with clear separation of concerns:

### Core Classes

- **MindMap** (`src/MindMap.ts`): Main orchestrator class that manages the Konva stage and delegates business logic to the controller. Handles UI events (clicks, keyboard shortcuts) and provides public API methods.

- **MindmapController** (`src/MindMapController.ts`): Business logic layer that manages node relationships, positioning, and connections. Coordinates between the positioner and visual node rendering.

- **HierarchicalPositioner** (`src/HierarchicalPositioner.ts`): Layout engine that calculates node positions using a hierarchical algorithm. Manages spatial relationships and automatic repositioning of siblings.

- **Node** (`src/Node.ts`): Visual representation of mindmap nodes as Konva groups. Handles text wrapping, color calculations based on luminosity, and visual state management (selected, activated, collapsed).

### Key Design Patterns

- **MVC Pattern**: MindMap (View/Controller) → MindmapController (Model) → HierarchicalPositioner (Layout Engine)
- **Type-Driven Design**: NodeType enum defines different node types (TASK, IDEA, RESOURCE, DEADLINE, ROOT) with specific color schemes
- **Hierarchical Layout**: Automatic positioning with left/right branching from root, vertical stacking of siblings
- **Animation System**: Smooth Konva tweens for node repositioning when siblings are added/removed
- **Connection Management**: Automatic drawing and updating of connection lines between parent-child nodes

### Configuration & Types

- **NodePosition** (`src/NodePosition.ts`): Contains type definitions for NodeType enum, NodePosition interface, and LAYOUT_CONFIG constants
- **NODE_CONFIGS**: Maps each NodeType to visual properties (color, shape)
- **LAYOUT_CONFIG**: Defines spacing, dimensions, and text limits

### Interaction Model

- **Keyboard Shortcuts**: Arrow keys (←→) add nodes to root sides, Enter adds children, Delete removes nodes
- **Click Interactions**: Canvas clicks determine left/right side based on cursor position relative to center
- **Node Selection**: Click nodes to select (visual feedback with shadow changes)
- **Drag Behavior**: Nodes snap back to calculated positions (drag-to-reparent not yet implemented)

### Development Entry Point

- `src/dev.ts` - Creates sample mindmap with various node types and exposes global helper functions for testing:
  - `addRandomNode(side)` - Adds random node to specified side
  - `addChildToNode(parentId)` - Adds child to existing node
  - `mindMap.getNodeCount()` - Returns total node count

### Testing Strategy

Currently uses only Playwright E2E tests that verify UI interactions by taking screenshots and running against the live Vite dev server.