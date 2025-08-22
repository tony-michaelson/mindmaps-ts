interface BorderSegment {
  h: number; // height at this segment
  l: number; // length of this segment
}

export class Outline {
  private topBorder: BorderSegment[];
  private bottomBorder: BorderSegment[];

  constructor(topBorder: BorderSegment[], bottomBorder: BorderSegment[]) {
    this.topBorder = topBorder || [];
    this.bottomBorder = bottomBorder || [];
  }

  // Create outline for a simple rectangle node
  static forRectangle(width: number, height: number): Outline {
    const halfHeight = height / 2;
    return new Outline(
      [{ h: -halfHeight, l: width }], // Top edge
      [{ h: halfHeight, l: width }]   // Bottom edge
    );
  }

  // Calculate minimum vertical separation needed between this outline (bottom) and another outline (top)
  spacingAbove(upperOutline: Outline): number {
    if (this.topBorder.length === 0 || upperOutline.bottomBorder.length === 0) {
      return 0;
    }

    let maxSpacing = 0;
    let lowerPosition = 0;
    let upperPosition = 0;
    let lowerBorderIndex = 0;
    let upperBorderIndex = 0;

    // Line-sweep algorithm to find maximum required spacing
    while (lowerBorderIndex < this.topBorder.length && upperBorderIndex < upperOutline.bottomBorder.length) {
      const lowerSegment = this.topBorder[lowerBorderIndex];
      const upperSegment = upperOutline.bottomBorder[upperBorderIndex];

      // Calculate required spacing at current horizontal position
      const requiredSpacing = lowerSegment.h - upperSegment.h;
      maxSpacing = Math.max(maxSpacing, requiredSpacing);

      // Advance to next segment boundary
      const lowerEnd = lowerPosition + lowerSegment.l;
      const upperEnd = upperPosition + upperSegment.l;

      if (lowerEnd <= upperEnd) {
        lowerPosition = lowerEnd;
        lowerBorderIndex++;
      }
      if (upperEnd <= lowerEnd) {
        upperPosition = upperEnd;
        upperBorderIndex++;
      }
    }

    return Math.max(0, maxSpacing);
  }

  // Stack this outline below another outline with proper spacing
  stackBelow(upperOutline: Outline, margin: number): Outline {
    const spacing = this.spacingAbove(upperOutline) + margin;
    return this.translate(0, spacing);
  }

  // Add horizontal indentation to the outline
  indent(horizontalIndent: number, margin: number): Outline {
    // Extend borders horizontally and add vertical margin
    const newTopBorder = this.topBorder.map(segment => ({
      h: segment.h - margin,
      l: segment.l + horizontalIndent
    }));

    const newBottomBorder = this.bottomBorder.map(segment => ({
      h: segment.h + margin,
      l: segment.l + horizontalIndent
    }));

    return new Outline(newTopBorder, newBottomBorder);
  }

  // Translate the outline by dx, dy
  translate(dx: number, dy: number): Outline {
    const newTopBorder = this.topBorder.map(segment => ({
      h: segment.h + dy,
      l: segment.l
    }));

    const newBottomBorder = this.bottomBorder.map(segment => ({
      h: segment.h + dy,
      l: segment.l
    }));

    return new Outline(newTopBorder, newBottomBorder);
  }

  // Get the initial height of the outline (top to bottom)
  initialHeight(): number {
    if (this.topBorder.length === 0 || this.bottomBorder.length === 0) {
      return 0;
    }

    const topY = Math.min(...this.topBorder.map(s => s.h));
    const bottomY = Math.max(...this.bottomBorder.map(s => s.h));
    
    return bottomY - topY;
  }

  // Get the width of the outline
  width(): number {
    if (this.topBorder.length === 0) return 0;
    return this.topBorder.reduce((sum, segment) => sum + segment.l, 0);
  }

  // Combine two outlines horizontally (for merging subtrees)
  combineHorizontally(other: Outline, spacing: number): Outline {
    const thisWidth = this.width();
    
    // Extend this outline's borders
    const newTopBorder = [...this.topBorder];
    const newBottomBorder = [...this.bottomBorder];

    // Add the other outline's borders, offset by this outline's width + spacing
    other.topBorder.forEach(segment => {
      newTopBorder.push({
        h: segment.h,
        l: segment.l
      });
    });

    other.bottomBorder.forEach(segment => {
      newBottomBorder.push({
        h: segment.h,
        l: segment.l
      });
    });

    return new Outline(newTopBorder, newBottomBorder);
  }

  // Get the bounds of this outline
  getBounds(): { top: number; bottom: number; left: number; right: number } {
    const top = this.topBorder.length > 0 ? Math.min(...this.topBorder.map(s => s.h)) : 0;
    const bottom = this.bottomBorder.length > 0 ? Math.max(...this.bottomBorder.map(s => s.h)) : 0;
    const right = this.width();
    
    return { top, bottom, left: 0, right };
  }
}