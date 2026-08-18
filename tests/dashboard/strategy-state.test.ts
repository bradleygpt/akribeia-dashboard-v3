import { describe, expect, it } from "vitest";
import {
  ACTIVE_STRATEGIES,
  RETIRED_STRATEGIES,
  isActiveStrategyName,
  isRetiredStrategyName,
  partitionStrategyNames,
  strategyFactorLabel,
} from "../../apps/dashboard/app/strategies/strategy-status";

describe("governed strategy state", () => {
  it("declares exactly the governing active five", () => {
    expect(ACTIVE_STRATEGIES.map(({ name }) => name)).toEqual([
      "Katalepsis",
      "Auxo",
      "Statera",
      "Pronoia",
      "Kairos",
    ]);
    for (const name of ["Katalepsis", "Auxo", "Statera", "Pronoia", "Kairos"]) {
      expect(isActiveStrategyName(name)).toBe(true);
      expect(isRetiredStrategyName(name)).toBe(false);
    }
  });

  it("retires Aristeia and Prosodos with no active status", () => {
    expect(RETIRED_STRATEGIES.map(({ name }) => name).sort()).toEqual(["Aristeia", "Prosodos"]);
    expect(isActiveStrategyName("Aristeia")).toBe(false);
    expect(isRetiredStrategyName("Aristeia")).toBe(true);
    expect(isActiveStrategyName("Prosodos")).toBe(false);
    expect(isRetiredStrategyName("Prosodos")).toBe(true);
    const aristeia = RETIRED_STRATEGIES.find(({ name }) => name === "Aristeia");
    expect(aristeia?.retiredOn).toBe("2026-08-11");
    expect(aristeia?.note).toContain("Kairos");
  });

  it("partitions a stale pinned snapshot so retired sleeves cannot present as active", () => {
    // The pinned V2 snapshot's five sleeves predate the 2026-08-11 retirement.
    const pinnedSnapshotLabels = ["Katalepsis", "Aristeia", "Auxo", "Prosodos", "Pronoia"];
    const partition = partitionStrategyNames(pinnedSnapshotLabels);
    expect(partition.active).toEqual(["Katalepsis", "Auxo", "Pronoia"]);
    expect(partition.retired).toEqual(["Aristeia", "Prosodos"]);
    expect(partition.unknown).toEqual([]);
  });

  it("keeps factor labels truthful and never invents one", () => {
    expect(strategyFactorLabel("Katalepsis")).toBe("ML posterior · c78q");
    expect(strategyFactorLabel("Kairos")).toBe("Event momentum");
    expect(strategyFactorLabel("Statera")).toBeNull();
    expect(strategyFactorLabel("Aristeia")).toBe("Event / PEAD");
    expect(strategyFactorLabel("NotAStrategy")).toBeNull();
  });

  it("marks Kairos paper-only in its presentation note", () => {
    const kairos = ACTIVE_STRATEGIES.find(({ name }) => name === "Kairos");
    expect(kairos?.note).toContain("Paper-only");
  });
});
