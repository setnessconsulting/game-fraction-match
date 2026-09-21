import { describe, expect, it } from "vitest";

import { createFractionForm } from "../src/engine";
import {
  BASELINE_HEIGHT_RATIO,
  DIVISION_LINE_THICKNESS_CSS_PX,
  LABELLED_TICK_LENGTH_CSS_PX,
  LABEL_FONT_SIZE_CSS_PX,
  MIN_TICK_LABEL_SPACING_CSS_PX,
  UNLABELLED_TICK_LENGTH_CSS_PX,
  barGeometry,
  circleGeometry,
  labelSpacingFloorFor,
  labelTextWidth,
  labelledTickIndexes,
  numberLineGeometry,
  setGeometry,
  setGridShape,
  symbolicGeometry,
  tickLabelText,
  wholeUnitCount,
} from "../src/representations";
import { representationFixture, testNumberLineWhole, testSetWhole } from "./representationFixtures";

/**
 * Geometry is the part a learner reads, so these tests assert the *countable* facts — how many equal
 * parts were drawn, how many are shaded, where the point landed — rather than pixels that a design pass
 * is allowed to move. Where pixel numbers are asserted they are the ones the legibility floors depend on.
 */

const BOX = { width: 160, height: 96 } as const;
const SQUARE = { width: 120, height: 120 } as const;

describe("whole unit count", () => {
  it("draws one whole for zero and one whole for values up to one, then one per whole", () => {
    expect(wholeUnitCount(createFractionForm(0, 4))).toBe(1);
    expect(wholeUnitCount(createFractionForm(1, 2))).toBe(1);
    expect(wholeUnitCount(createFractionForm(4, 4))).toBe(1);
    expect(wholeUnitCount(createFractionForm(5, 4))).toBe(2);
    expect(wholeUnitCount(createFractionForm(9, 4))).toBe(3);
  });
});

describe("bar geometry", () => {
  it("cuts one strip into equal parts and shades the authored numerator", () => {
    const geometry = barGeometry({ fraction: createFractionForm(2, 4), box: BOX });

    expect(geometry.strips).toHaveLength(1);
    const strip = geometry.strips[0]!;
    expect(strip.frame).toEqual({ x: 4, y: 24, width: 152, height: 48 });
    expect(strip.partitions).toHaveLength(4);
    expect(strip.partitions.map((partition) => partition.width)).toEqual([38, 38, 38, 38]);
    expect(strip.partitions.map((partition) => partition.x)).toEqual([4, 42, 80, 118]);
    expect(strip.partitions.filter((partition) => partition.filled).map((partition) => partition.ordinal)).toEqual([0, 1]);

    // Every partition is identical, which is what makes equal parts provable instead of eyeballed.
    expect(new Set(strip.partitions.map((partition) => `${partition.width}x${partition.height}`)).size).toBe(1);
  });

  it("draws the division lines as rectangles of the shared thickness, centred on the boundaries", () => {
    const geometry = barGeometry({ fraction: createFractionForm(2, 4), box: BOX });

    expect(geometry.divisionLines).toHaveLength(3);
    for (const line of geometry.divisionLines) {
      expect(line.orientation).toBe("vertical");
      expect(line.width).toBe(DIVISION_LINE_THICKNESS_CSS_PX);
      expect(line.height).toBe(48);
    }
    expect(geometry.divisionLines.map((line) => line.x + line.width / 2)).toEqual([42, 80, 118]);
  });

  it("shows the same shaded quantity for equivalent authored forms, because the parts are equal", () => {
    const quarter = barGeometry({ fraction: createFractionForm(2, 4), box: BOX });
    const half = barGeometry({ fraction: createFractionForm(1, 2), box: BOX });

    expect(quarter.totals.filledAreaCssPx / quarter.totals.stripAreaCssPx).toBeCloseTo(
      half.totals.filledAreaCssPx / half.totals.stripAreaCssPx,
      10,
    );
    expect(quarter.totals.filledAreaCssPx).toBeCloseTo(3648, 10);
    expect(half.totals.filledAreaCssPx).toBeCloseTo(3648, 10);
  });

  it("draws values at or above one whole as whole strips plus a partial strip", () => {
    const geometry = barGeometry({ fraction: createFractionForm(5, 4), box: BOX });

    expect(geometry.strips).toHaveLength(2);
    expect(geometry.totals).toEqual(
      expect.objectContaining({ strips: 2, partitionsPerWhole: 4, filledPartitions: 5, totalPartitions: 8 }),
    );
    expect(geometry.strips[0]!.partitions.every((partition) => partition.filled)).toBe(true);
    expect(geometry.strips[1]!.partitions.filter((partition) => partition.filled)).toHaveLength(1);
    expect(geometry.frames.map((frame) => frame.y)).toEqual([4, 50]);
  });

  it("keeps the whole frame visible for a zero numerator", () => {
    const geometry = barGeometry({ fraction: createFractionForm(0, 4), box: BOX });
    expect(geometry.strips).toHaveLength(1);
    expect(geometry.totals.filledPartitions).toBe(0);
    expect(geometry.strips[0]!.partitions.every((partition) => partition.filled)).toBe(false);
  });

  it("fills a vertical bar from the bottom, and states the same totals either way", () => {
    const geometry = barGeometry({ fraction: createFractionForm(1, 4), box: BOX, orientation: "vertical" });

    expect(geometry.orientation).toBe("vertical");
    expect(geometry.strips[0]!.frame).toEqual({ x: 56, y: 4, width: 48, height: 88 });
    const filled = geometry.strips[0]!.partitions.filter((partition) => partition.filled);
    expect(filled).toHaveLength(1);
    expect(filled[0]!.y).toBeGreaterThan(geometry.strips[0]!.partitions[1]!.y);
    expect(geometry.divisionLines.every((line) => line.orientation === "horizontal")).toBe(true);
  });

  it("reports the measurements the legibility policy reads", () => {
    const geometry = barGeometry({ fraction: createFractionForm(2, 4), box: BOX });
    expect(geometry.metrics).toEqual({
      family: "bar",
      partitionCountPerWhole: 4,
      partitionRegion: { width: 36, height: 46 },
      divisionLineThicknessPx: DIVISION_LINE_THICKNESS_CSS_PX,
      tickSpacingPx: null,
      tickLabelSpacingPx: null,
      tickLabelCount: null,
      glyphPx: null,
      objectPx: null,
    });
  });

  it("validates its inputs", () => {
    expect(() => barGeometry({ fraction: createFractionForm(2, 4), box: { width: 0, height: 10 } })).toThrow(
      /barGeometry box width must be a positive finite number/,
    );
  });
});

describe("circle geometry", () => {
  it("cuts one circle into equal wedges and shades the authored numerator", () => {
    const geometry = circleGeometry({ fraction: createFractionForm(2, 4), box: SQUARE });

    expect(geometry.circles).toEqual([
      { circleIndex: 0, centerX: 60, centerY: 60, radius: 56, wedgeCount: 4, filledWedgeCount: 2 },
    ]);
    expect(geometry.totals).toEqual({ wedgesPerWhole: 4, filledWedges: 2, totalWedges: 4, wedgeSweepDeg: 90 });
    expect(geometry.wedges.map((wedge) => wedge.sweepDeg)).toEqual([90, 90, 90, 90]);
    expect(geometry.wedges.map((wedge) => wedge.startAngleDeg)).toEqual([-90, 0, 90, 180]);
    expect(geometry.wedges.filter((wedge) => wedge.filled).map((wedge) => wedge.ordinal)).toEqual([0, 1]);
    expect(new Set(geometry.wedges.map((wedge) => wedge.path)).size).toBe(4);
  });

  it("draws a radial divider for every wedge boundary", () => {
    const geometry = circleGeometry({ fraction: createFractionForm(2, 4), box: SQUARE });
    expect(geometry.divisions).toHaveLength(4);
    for (const division of geometry.divisions) {
      expect(division.x1).toBe(60);
      expect(division.y1).toBe(60);
      expect(Math.hypot(division.x2 - 60, division.y2 - 60)).toBeCloseTo(56, 6);
    }
  });

  it("special-cases a one-part whole, which cannot be drawn as one arc", () => {
    const geometry = circleGeometry({ fraction: createFractionForm(1, 1), box: SQUARE });
    expect(geometry.totals.wedgeSweepDeg).toBe(360);
    expect(geometry.totals.filledWedges).toBe(1);
    expect(geometry.wedges[0]!.path.match(/A /g)).toHaveLength(2);
    expect(geometry.divisions).toHaveLength(0);
  });

  it("draws values at or above one whole as whole circles plus a partial one", () => {
    const geometry = circleGeometry({ fraction: createFractionForm(5, 4), box: SQUARE });
    expect(geometry.circles.map((circle) => circle.centerX)).toEqual([31, 89]);
    expect(geometry.circles.every((circle) => circle.radius === 27)).toBe(true);
    expect(geometry.totals).toEqual({ wedgesPerWhole: 4, filledWedges: 5, totalWedges: 8, wedgeSweepDeg: 90 });
    expect(geometry.circles[0]!.filledWedgeCount).toBe(4);
    expect(geometry.circles[1]!.filledWedgeCount).toBe(1);
  });

  it("measures a wedge by its outer arc and its radial depth, after the divider takes its share", () => {
    const geometry = circleGeometry({ fraction: createFractionForm(2, 4), box: SQUARE });
    const region = geometry.metrics.partitionRegion;
    expect(region).not.toBeNull();
    expect(region!.width).toBeCloseTo((2 * Math.PI * 56 * 90) / 360 - DIVISION_LINE_THICKNESS_CSS_PX, 9);
    expect(region!.height).toBeCloseTo(54, 9);
    expect(geometry.metrics.divisionLineThicknessPx).toBe(DIVISION_LINE_THICKNESS_CSS_PX);
  });
});

describe("set geometry", () => {
  it("lays out the declared collection on a deterministic near-square grid", () => {
    expect(setGridShape(1)).toEqual({ columns: 1, rows: 1 });
    expect(setGridShape(2)).toEqual({ columns: 2, rows: 1 });
    expect(setGridShape(3)).toEqual({ columns: 2, rows: 2 });
    expect(setGridShape(4)).toEqual({ columns: 2, rows: 2 });
    expect(setGridShape(5)).toEqual({ columns: 3, rows: 2 });
    expect(setGridShape(8)).toEqual({ columns: 3, rows: 3 });
    expect(setGridShape(100)).toEqual({ columns: 10, rows: 10 });
  });

  it("selects an exact number of objects from the declared collection", () => {
    const geometry = setGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 140, height: 120 },
      whole: testSetWhole(8),
    });

    expect(geometry.selection).toEqual({ selectedCount: 4, totalObjectCount: 8 });
    expect(geometry.objects).toHaveLength(8);
    expect(geometry.objects.filter((object) => object.selected).map((object) => object.objectIndex)).toEqual([0, 1, 2, 3]);
    expect(geometry.grid.columns).toBe(3);
    expect(geometry.grid.rows).toBe(3);
    expect(geometry.objects.every((object) => object.radius === geometry.objects[0]!.radius)).toBe(true);
  });

  it("centres a partial final row", () => {
    const geometry = setGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 140, height: 120 },
      whole: testSetWhole(8),
    });
    const lastRow = geometry.objects.filter((object) => object.row === 2);
    expect(lastRow).toHaveLength(2);
    expect(lastRow[0]!.centerX).toBeCloseTo(48, 6);
    expect(lastRow[0]!.centerX + lastRow[1]!.centerX).toBeCloseTo(140, 6);
  });

  it("measures the clear diameter of one object as the legibility region", () => {
    const geometry = setGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 140, height: 120 },
      whole: testSetWhole(8),
    });
    const radius = geometry.objects[0]!.radius;
    expect(geometry.metrics.partitionRegion).toEqual({ width: radius * 2, height: radius * 2 });
    expect(geometry.metrics.objectPx).toBe(radius * 2);
  });

  it("is deterministic: the same inputs produce deeply equal geometry", () => {
    const input = { fraction: createFractionForm(3, 8), box: { width: 140, height: 120 }, whole: testSetWhole(8) } as const;
    expect(setGeometry(input)).toEqual(setGeometry(input));
  });

  it("refuses a value at or above one whole rather than inventing a collection", () => {
    expect(() =>
      setGeometry({ fraction: createFractionForm(5, 4), box: { width: 140, height: 120 }, whole: testSetWhole(8) }),
    ).toThrow(/numerator 5 exceeds denominator 4/);
  });
});

describe("number-line geometry", () => {
  const value = representationFixture(2, 4, { ticksPerUnit: 4 }).numberLine;

  it("marks every tick of the shared scale and places the point on an exact tick", () => {
    const geometry = numberLineGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 200, height: 96 },
      whole: value,
    });

    expect(geometry.tickSpacingPx).toBe(48);
    expect(geometry.ticks).toHaveLength(5);
    expect(geometry.ticks.map((tick) => tick.x)).toEqual([4, 52, 100, 148, 196]);
    expect(geometry.point.tickIndex).toBe(2);
    expect(geometry.point.x).toBe(100);
    expect(geometry.point.y).toBeCloseTo(96 * BASELINE_HEIGHT_RATIO, 9);
    expect(geometry.point.radius).toBeCloseTo(88 * 0.045, 9);
    expect(geometry.baseline).toEqual({ x: 4, y: 96 * BASELINE_HEIGHT_RATIO - 1, width: 192, height: 2 });
    expect(geometry.labelFontSizePx).toBe(LABEL_FONT_SIZE_CSS_PX);
  });

  it("renders labels at the exact font size the spacing arithmetic assumed", () => {
    const geometry = numberLineGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 200, height: 96 },
      whole: value,
    });

    expect(geometry.labels.map((label) => label.text)).toEqual(["0", "1/4", "2/4", "3/4", "1"]);
    for (const label of geometry.labels) {
      expect(label.estimatedWidthPx).toBeCloseTo(labelTextWidth(label.text, geometry.labelFontSizePx), 10);
    }
  });

  it("labels ticks longer than unlabelled ones", () => {
    const geometry = numberLineGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 200, height: 96 },
      whole: value,
    });
    for (const tick of geometry.ticks) {
      expect(tick.mark.height).toBe(tick.labelled ? LABELLED_TICK_LENGTH_CSS_PX : UNLABELLED_TICK_LENGTH_CSS_PX);
      expect(tick.mark.width).toBe(DIVISION_LINE_THICKNESS_CSS_PX);
      expect(tick.isPoint).toBe(tick.tickIndex === geometry.point.tickIndex);
    }
  });

  it("thins labels below the legibility floor and always keeps the point's own tick labelled", () => {
    // The smallest card, on an eight-part axis: only 7.5 px per tick, so labels must be thinned hard.
    const axis = representationFixture(2, 4, { ticksPerUnit: 8 }).numberLine;
    const geometry = numberLineGeometry({
      fraction: createFractionForm(2, 4),
      box: { width: 68, height: 68 },
      whole: axis,
    });

    expect(geometry.tickSpacingPx).toBe(7.5);
    expect(geometry.labels.map((label) => label.tickIndex)).toEqual([0, 4]);
    expect(geometry.labels.some((label) => label.tickIndex === geometry.point.tickIndex)).toBe(true);
    expect(geometry.tickLabelSpacingPx).toBeGreaterThanOrEqual(
      Math.max(MIN_TICK_LABEL_SPACING_CSS_PX, labelSpacingFloorFor(["0", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "1"])),
    );
  });

  it("thins deterministically from the left and drops labels around the point", () => {
    const totalTicks = 8;
    const tickSpacingPx = 7.5;
    const floor = labelSpacingFloorFor(["0", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "1"]);

    // The floor defaults to the shared legibility floor when a caller does not declare one.
    expect(labelledTickIndexes({ totalTicks: 3, tickSpacingPx: 20, pointTickIndex: 0 })).toEqual([0, 1, 2, 3]);
    expect(labelledTickIndexes({ totalTicks: 3, tickSpacingPx: 10, pointTickIndex: 0 })).toEqual([0, 2]);

    // Without a point on a labelled tick, the walk takes 0, 3 and 6.
    expect(labelledTickIndexes({ totalTicks, tickSpacingPx, pointTickIndex: 0, labelSpacingFloorPx: floor })).toEqual([0, 3, 6]);
    // With the point on tick 4, everything within the gap around it is dropped instead of overlapped.
    expect(labelledTickIndexes({ totalTicks, tickSpacingPx, pointTickIndex: 4, labelSpacingFloorPx: floor })).toEqual([0, 4]);
    // The walk never emits a gap below the floor.
    const kept = labelledTickIndexes({ totalTicks, tickSpacingPx, pointTickIndex: 7, labelSpacingFloorPx: floor });
    for (let index = 1; index < kept.length; index += 1) {
      expect((kept[index]! - kept[index - 1]!) * tickSpacingPx).toBeGreaterThanOrEqual(floor);
    }
  });

  it("labels ticks with absolute values across a wider domain", () => {
    const axis = { domainStart: 0, domainEnd: 2, ticksPerUnit: 4, axisId: "axis-0-2-4" };
    expect(tickLabelText(axis, 0)).toBe("0");
    expect(tickLabelText(axis, 4)).toBe("1");
    expect(tickLabelText(axis, 6)).toBe("6/4");
    expect(tickLabelText(axis, 8)).toBe("2");
  });

  it("refuses an axis whose scale cannot place the value on a tick", () => {
    expect(() =>
      numberLineGeometry({
        fraction: createFractionForm(1, 100),
        box: { width: 200, height: 96 },
        whole: testNumberLineWhole(4),
      }),
    ).toThrow(/axis scale 4 parts per unit is not a multiple of denominator 100/);
  });

  it("refuses a degenerate axis that the constructors would never have produced", () => {
    // The geometry accepts structural data, so it still refuses an axis with no ticks in it: a shared
    // axis nobody validated would otherwise divide the usable width by zero.
    expect(() =>
      numberLineGeometry({
        fraction: createFractionForm(0, 4),
        box: { width: 200, height: 96 },
        whole: {
          kind: "number-line-axis",
          wholeId: "degenerate-axis",
          description: "an axis with no ticks",
          axis: { axisId: "degenerate", domainStart: 0, domainEnd: 0, ticksPerUnit: 4 },
        },
      }),
    ).toThrow(/numberLineGeometry requires an axis with at least one tick/);
  });
});

describe("symbolic geometry", () => {
  it("stacks the authored digits from the canonical formatter", () => {
    const geometry = symbolicGeometry({ fraction: createFractionForm(2, 4), box: { width: 96, height: 96 } });
    expect(geometry.numeratorText).toBe("2");
    expect(geometry.denominatorText).toBe("4");
    expect(geometry.centerX).toBe(48);
  });

  it("fits by height in a square box and by width in a tall narrow one", () => {
    const square = symbolicGeometry({ fraction: createFractionForm(1, 2), box: { width: 96, height: 96 } });
    const narrow = symbolicGeometry({ fraction: createFractionForm(1, 100), box: { width: 40, height: 200 } });

    // Height-limited: two stacked lines, the taller constraint in a square box.
    expect(square.fontSizePx).toBeCloseTo(44 * 0.82, 6);
    // Width-limited: three digits across a 32 px usable width.
    expect(narrow.fontSizePx).toBeCloseTo(32 / (3 * 0.62), 6);
    expect(narrow.metrics.glyphPx).toBe(narrow.fontSizePx);
  });

  it("draws a rule at least as thick as the shared division thickness", () => {
    const geometry = symbolicGeometry({ fraction: createFractionForm(1, 2), box: { width: 20, height: 20 } });
    expect(geometry.rule.height).toBe(DIVISION_LINE_THICKNESS_CSS_PX);
    expect(geometry.metrics.divisionLineThicknessPx).toBe(DIVISION_LINE_THICKNESS_CSS_PX);
    expect(geometry.numeratorBaselineY).toBeLessThan(geometry.denominatorBaselineY);
  });

  it("reports no partitions, because a symbol has none", () => {
    const geometry = symbolicGeometry({ fraction: createFractionForm(2, 4), box: { width: 96, height: 96 } });
    expect(geometry.metrics.partitionRegion).toBeNull();
    expect(geometry.metrics.partitionCountPerWhole).toBe(4);
  });
});
