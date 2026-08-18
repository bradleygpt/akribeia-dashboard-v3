import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InstitutionalIntelligenceSchema, AlphaDecayReportSchema } from "@akribeia/contracts";

const institutional = InstitutionalIntelligenceSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../apps/dashboard/app/generated/active-institutional-intelligence.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);

const alphaDecay = AlphaDecayReportSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../apps/dashboard/app/generated/active-alpha-decay.json", import.meta.url),
      "utf8",
    ),
  ),
);

const universe = JSON.parse(
  readFileSync(
    new URL("../../data/reference/v2-baseline/fixtures/universe_floor0.json", import.meta.url),
    "utf8",
  ),
) as { rows: Array<{ ticker: string; sector: string }> };

describe("active institutional intelligence artifact", () => {
  it("keeps display caps honest — shown counts never exceed totals or caps", () => {
    for (const manager of institutional.managers) {
      for (const period of manager.periods) {
        expect(period.displayedPositionCount).toBeLessThanOrEqual(period.positionCount);
        expect(period.displayedPositionCount).toBeLessThanOrEqual(
          institutional.displayCaps.positionsPerManager,
        );
        expect(period.positions).toHaveLength(period.displayedPositionCount);
      }
      if (manager.deltas !== null && manager.deltas.state === "computed") {
        expect(manager.deltas.displayedEntryCount).toBeLessThanOrEqual(
          manager.deltas.totalEntryCount,
        );
        expect(manager.deltas.entries).toHaveLength(manager.deltas.displayedEntryCount);
      }
    }
  });

  it("orders every period chronologically with the delta window at the end", () => {
    for (const manager of institutional.managers) {
      const periods = manager.periods.map(({ periodOfReport }) => periodOfReport);
      expect([...periods].sort()).toEqual(periods);
      if (manager.deltas !== null) {
        expect(manager.deltas.fromPeriod < manager.deltas.toPeriod).toBe(true);
      }
    }
  });

  it("resolves rollups only into the canonical dashboard universe and never MCW", () => {
    const canonical = new Set(universe.rows.map(({ ticker }) => ticker));
    expect(institutional.stockRollups.length).toBeGreaterThan(0);
    for (const rollup of institutional.stockRollups) {
      expect(rollup.ticker).not.toBe("MCW");
      expect(canonical.has(rollup.ticker)).toBe(true);
      expect(rollup.holders).toHaveLength(rollup.holderCount);
      const direction = rollup.directionOfTravel;
      expect(
        direction.added +
          direction.increased +
          direction.reduced +
          direction.unchanged +
          direction.withoutHistory,
      ).toBe(rollup.holderCount);
    }
  });

  it("accounts for every parsed instrument identity exactly once", () => {
    const coverage = institutional.coverage;
    expect(
      coverage.resolvedInstruments +
        coverage.unresolvedInstruments +
        coverage.excludedContaminatedInstruments,
    ).toBe(coverage.uniqueInstruments);
    expect(coverage.positionRowsParsed).toBeGreaterThanOrEqual(coverage.uniqueInstruments);
  });

  it("states the reporting-lag and value-unit policies verbatim", () => {
    expect(institutional.reportingLagPolicy).toContain("45 days");
    expect(institutional.reportingLagPolicy).toContain("never current positioning");
    expect(institutional.valueUnitPolicy).toContain("2023-01-03");
  });
});

describe("active alpha decay report", () => {
  it("registers the fail-closed policy minimums", () => {
    expect(alphaDecay.policy.minVintagesForDecayCurve).toBe(40);
    expect(alphaDecay.policy.minVintagesForPersistence).toBe(12);
    expect(alphaDecay.policy.minCrossSectionPerCohort).toBe(30);
    expect(alphaDecay.policy.horizonsTradingDays).toEqual([5, 10, 21, 42, 63, 126]);
  });

  it("renders no statistic while the ledger is below its minimums", () => {
    if (alphaDecay.ledger.vintageCount < alphaDecay.policy.minVintagesForDecayCurve) {
      expect(alphaDecay.overallState).toBe("insufficient-history");
      for (const horizon of alphaDecay.horizons) {
        expect(horizon.state).toBe("insufficient-history");
        expect(horizon.meanRankIc).toBeNull();
        expect(horizon.hitRate).toBeNull();
        expect(horizon.topMinusBottomQuintileSpread).toBeNull();
      }
      expect(alphaDecay.halfLife.halfLifeTradingDays).toBeNull();
    }
  });

  it("declares prospective-only methodology", () => {
    expect(alphaDecay.methodology).toContain("prospective-only");
    expect(alphaDecay.methodology).toContain("no hindsight reconstruction");
  });
});
