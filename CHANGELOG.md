# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-08-25

### Initial Release

#### Added
- **Core MindMapping Engine**
  - MindMap class for orchestrating mindmap creation and management
  - MindmapController for business logic and node relationships
  - HierarchicalPositioner for automatic node layout and positioning

- **Advanced Layout System**
  - TreeLayout with outline-based collision detection
  - Outline class for precise geometric spacing calculations
  - Dynamic node positioning with smooth animations
  - Left/right branching from root with vertical sibling stacking

- **Node Types and Visual System**
  - Multiple node types: ROOT, TASK, IDEA, RESOURCE, DEADLINE, LINK, CUBE
  - 3D CUBE nodes with isometric 3D rectangle rendering
  - Adaptive text rendering with automatic wrapping and color contrast
  - Visual state management (selection, dragging, activation states)
  - Dynamic resizing based on text content

- **Interaction Features**
  - Drag & drop node reparenting and reordering
  - Keyboard shortcuts for efficient navigation
  - Context menus for right-click operations
  - In-place text editing with dialog and textarea modes
  - Click-based node selection and activation

- **Performance Optimizations**
  - Connection caching for memoized line rendering
  - Batch processing for grouped operations
  - Animation coordination with 60fps smooth transitions
  - Viewport culling for large mindmaps

- **Developer Experience**
  - TypeScript support with strict type checking
  - Comprehensive API documentation
  - End-to-end testing with Playwright
  - Development helpers and testing functions
  - Export/import functionality for mindmap data

- **Architecture**
  - Clean MVC-like pattern with separation of concerns
  - Extensible node type system
  - Modular component structure
  - Canvas-based rendering with Konva.js

### Technical Details
- Built with TypeScript 5.8+
- Konva.js 9.3+ for 2D canvas graphics
- Lodash utilities for data manipulation
- UUID generation for unique node identification
- Supports ES modules and CommonJS

### Browser Support
- Modern browsers with Canvas and ES6+ support
- Tested on Chrome, Firefox, Safari, and Edge
- Basic mobile touch support