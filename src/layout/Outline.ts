interface BorderSegment {
  h: number;
  l: number;
}

export class Outline {
  private topBorder: BorderSegment[];
  private bottomBorder: BorderSegment[];

  constructor(topBorder: BorderSegment[], bottomBorder: BorderSegment[]) {
    this.topBorder = topBorder || [];
    this.bottomBorder = bottomBorder || [];
  }

  static forRectangle(width: number, height: number): Outline {
    const halfHeight = height / 2;
    return new Outline(
      [{ h: -halfHeight, l: width }],
      [{ h: halfHeight, l: width }]
    );
  }

  spacingAbove(upperOutline: Outline): number {
    if (this.topBorder.length === 0 || upperOutline.bottomBorder.length === 0) {
      return 0;
    }

    let maxSpacing = 0;
    let lowerPosition = 0;
    let upperPosition = 0;
    let lowerBorderIndex = 0;
    let upperBorderIndex = 0;

    while (
      lowerBorderIndex < this.topBorder.length &&
      upperBorderIndex < upperOutline.bottomBorder.length
    ) {
      const lowerSegment = this.topBorder[lowerBorderIndex];
      const upperSegment = upperOutline.bottomBorder[upperBorderIndex];

      const requiredSpacing = lowerSegment.h - upperSegment.h;
      maxSpacing = Math.max(maxSpacing, requiredSpacing);

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

  stackBelow(upperOutline: Outline, margin: number): Outline {
    const spacing = this.spacingAbove(upperOutline) + margin;
    return this.translate(0, spacing);
  }

  indent(horizontalIndent: number, margin: number): Outline {
    const newTopBorder = this.topBorder.map((segment) => ({
      h: segment.h - margin,
      l: segment.l + horizontalIndent,
    }));

    const newBottomBorder = this.bottomBorder.map((segment) => ({
      h: segment.h + margin,
      l: segment.l + horizontalIndent,
    }));

    return new Outline(newTopBorder, newBottomBorder);
  }

  translate(_dx: number, dy: number): Outline {
    const newTopBorder = this.topBorder.map((segment) => ({
      h: segment.h + dy,
      l: segment.l,
    }));

    const newBottomBorder = this.bottomBorder.map((segment) => ({
      h: segment.h + dy,
      l: segment.l,
    }));

    return new Outline(newTopBorder, newBottomBorder);
  }

  initialHeight(): number {
    if (this.topBorder.length === 0 || this.bottomBorder.length === 0) {
      return 0;
    }

    const topY = Math.min(...this.topBorder.map((s) => s.h));
    const bottomY = Math.max(...this.bottomBorder.map((s) => s.h));

    return bottomY - topY;
  }

  width(): number {
    if (this.topBorder.length === 0) return 0;
    return this.topBorder.reduce((sum, segment) => sum + segment.l, 0);
  }

  combineHorizontally(other: Outline): Outline {

    const newTopBorder = [...this.topBorder];
    const newBottomBorder = [...this.bottomBorder];

    other.topBorder.forEach((segment) => {
      newTopBorder.push({
        h: segment.h,
        l: segment.l,
      });
    });

    other.bottomBorder.forEach((segment) => {
      newBottomBorder.push({
        h: segment.h,
        l: segment.l,
      });
    });

    return new Outline(newTopBorder, newBottomBorder);
  }

  getBounds(): { top: number; bottom: number; left: number; right: number } {
    const top =
      this.topBorder.length > 0
        ? Math.min(...this.topBorder.map((s) => s.h))
        : 0;
    const bottom =
      this.bottomBorder.length > 0
        ? Math.max(...this.bottomBorder.map((s) => s.h))
        : 0;
    const right = this.width();

    return { top, bottom, left: 0, right };
  }
}
