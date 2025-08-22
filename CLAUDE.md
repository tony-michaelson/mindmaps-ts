# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `npm run dev` - Starts Vite dev server on localhost:5173
- **Build**: `npm run build` - Creates production build using Vite
- **Unit tests**: `npm run test` - Runs Jest tests (note: Jest configured but no unit tests currently exist)
- **E2E tests**: `npm run test:e2e` - Runs Playwright tests headless
- **E2E tests headed**: `npm run test:e2e:headed` - Runs Playwright tests with browser UI

## Architecture Overview

This is a TypeScript mindmapping library built on Konva.js for 2D canvas graphics. The architecture follows a simple class-based pattern:

### Core Classes

- **MindMap** (`src/MindMap.ts`): Main orchestrator class that manages the Konva stage, layer, and collections of nodes/edges. Handles stage-level events (click to create nodes).

- **Node** (`src/Node.ts`): Represents individual mindmap nodes as draggable Konva groups containing a rectangle background and text label. Manages node-specific rendering and interactions.

### Key Patterns

- **Konva Integration**: Uses Konva.js for 2D canvas rendering with a single Stage → Layer → Groups/Shapes hierarchy
- **Event-Driven**: MindMap listens for stage clicks to create nodes; nodes are automatically draggable via Konva
- **Immediate Rendering**: Node creation triggers immediate layer.draw() calls rather than batched updates

### Project Structure

- `src/dev.ts` - Development entry point that creates a fullscreen mindmap
- `index.html` - Simple HTML container with module script loading
- `tests/` - Contains Playwright E2E tests that verify interactive functionality via screenshots
- No unit tests currently exist despite Jest being configured

### Testing Strategy

Currently uses only Playwright E2E tests that verify UI interactions by:
- Clicking canvas to create nodes
- Dragging nodes to new positions  
- Taking screenshots for visual verification
- Running against live Vite dev server (auto-started via webServer config)