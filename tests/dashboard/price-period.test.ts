import { describe, expect, it } from "vitest";
import {
  computeObservedPeriodMetrics,
  isShortPricePeriod,
  labelPricePeriod,
  queryPriceRange,
  selectPricePeriod,
  summarizePricePeriod,
} from "../../apps/dashboard/app/research/[ticker]/price-period";

const dates = [
  "2026-06-26",
  "2026-06-30",
  "2026-07-01",
  "2026-07-17",
  "2026-07-23",
  "2026-07-24",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];

const closes = [680, 690, 695, 700, 705, 710, 715, 720, 725, 730, 740];

describe("selected price-period histories", () => {
  it("maps short selectors to the supported six-month API range", () => {
    for (const period of ["1d", "wtd", "1w", "mtd", "1mo"]) {
      expect(queryPriceRange(period)).toBe("6mo");
      expect(isShortPricePeriod(period)).toBe(true);
    }

    expect(queryPriceRange("1y")).toBe("1y");
    expect(isShortPricePeriod("1y")).toBe(false);
  });

  it("selects the final two trading closes for 1D", () => {
    expect(selectPricePeriod("1d", dates, closes)).toEqual({
      dates: ["2026-07-30", "2026-07-31"],
      close: [730, 740],
    });
  });

  it("anchors WTD on the prior trading close", () => {
    expect(selectPricePeriod("wtd", dates, closes)).toEqual({
      dates: ["2026-07-24", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
      close: [710, 715, 720, 725, 730, 740],
    });
  });

  it("anchors MTD on the prior month's final trading close", () => {
    const selected = selectPricePeriod("mtd", dates, closes);

    expect(selected).toEqual({
      dates: [
        "2026-06-30",
        "2026-07-01",
        "2026-07-17",
        "2026-07-23",
        "2026-07-24",
        "2026-07-27",
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
      ],
      close: [690, 695, 700, 705, 710, 715, 720, 725, 730, 740],
    });

    expect(selected?.dates.slice(1).every((date) => date.startsWith("2026-07"))).toBe(true);
  });

  it("uses the same calendar date in the prior month for 1M", () => {
    const selected = selectPricePeriod("1mo", dates, closes);

    expect(selected).toEqual({
      dates: [
        "2026-06-30",
        "2026-07-01",
        "2026-07-17",
        "2026-07-23",
        "2026-07-24",
        "2026-07-27",
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
      ],
      close: [690, 695, 700, 705, 710, 715, 720, 725, 730, 740],
    });

    const summary = selected === null ? null : summarizePricePeriod(selected.dates, selected.close);

    expect(summary).toMatchObject({
      startDate: "2026-06-30",
      endDate: "2026-07-31",
      startPrice: 690,
      endPrice: 740,
    });
  });

  it("uses the prior trading close when the 1M boundary falls on a weekend", () => {
    expect(
      selectPricePeriod(
        "1mo",
        ["2026-08-28", "2026-08-31", "2026-09-01", "2026-09-30"],
        [99, 100, 101, 110],
      ),
    ).toEqual({
      dates: ["2026-08-28", "2026-08-31", "2026-09-01", "2026-09-30"],
      close: [99, 100, 101, 110],
    });
  });

  it("uses the last close before a missing 1M boundary session", () => {
    expect(
      selectPricePeriod(
        "1mo",
        ["2026-08-06", "2026-08-10", "2026-08-31", "2026-09-07"],
        [99, 100, 102, 110],
      ),
    ).toEqual({
      dates: ["2026-08-06", "2026-08-10", "2026-08-31", "2026-09-07"],
      close: [99, 100, 102, 110],
    });
  });

  it("clamps a month-end boundary to the final date in the prior month", () => {
    expect(
      selectPricePeriod("1mo", ["2026-02-27", "2026-03-02", "2026-03-31"], [99, 100, 110]),
    ).toEqual({
      dates: ["2026-02-27", "2026-03-02", "2026-03-31"],
      close: [99, 100, 110],
    });
  });

  it("withholds a claimed 1M interval when history starts after its boundary", () => {
    expect(
      selectPricePeriod("1mo", ["2026-08-03", "2026-08-10", "2026-08-31"], [100, 105, 110]),
    ).toBeNull();
  });

  it("withholds every selector when only one valid observation is available", () => {
    for (const period of ["1d", "wtd", "1w", "1mo", "mtd"]) {
      expect(selectPricePeriod(period, ["2026-08-31"], [100])).toBeNull();
    }
  });
  it("calculates MTD from the exact selected endpoints", () => {
    const selected = selectPricePeriod("mtd", dates, closes);

    const summary = selected === null ? null : summarizePricePeriod(selected.dates, selected.close);

    expect(summary).toMatchObject({
      startDate: "2026-06-30",
      endDate: "2026-07-31",
      startPrice: 690,
      endPrice: 740,
    });

    expect(summary?.percent).toBeCloseTo((740 / 690 - 1) * 100, 10);
  });

  it("calculates short-range metrics without a 30-close gate", () => {
    const metrics = computeObservedPeriodMetrics([100, 110, 99]);

    expect(metrics).not.toBeNull();
    expect(metrics?.sessions).toBe(2);
    expect(metrics?.priceChange).toBe(-1);
    expect(metrics?.averageSessionReturnPercent).toBeCloseTo(0, 10);
    expect(metrics?.bestSessionPercent).toBeCloseTo(10, 10);
    expect(metrics?.worstSessionPercent).toBeCloseTo(-10, 10);
    expect(metrics?.maxDrawdownPercent).toBeCloseTo(10, 10);
    expect(metrics?.currentDrawdownPercent).toBeCloseTo(10, 10);
  });

  it("renders every canonical selector label", () => {
    expect(labelPricePeriod("1d")).toBe("1D");
    expect(labelPricePeriod("wtd")).toBe("WTD");
    expect(labelPricePeriod("1w")).toBe("1W");
    expect(labelPricePeriod("mtd")).toBe("MTD");
    expect(labelPricePeriod("1mo")).toBe("1M");
    expect(labelPricePeriod("6mo")).toBe("6M");
    expect(labelPricePeriod("1y")).toBe("1Y");
    expect(labelPricePeriod("2y")).toBe("2Y");
    expect(labelPricePeriod("5y")).toBe("5Y");
    expect(labelPricePeriod("10y")).toBe("10Y");
    expect(labelPricePeriod("max")).toBe("MAX");
  });
});
