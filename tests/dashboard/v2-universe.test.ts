import { describe, expect, it } from "vitest";
import { filterUniverseRows } from "../../apps/dashboard/app/universe-filtering.js";
import {
  loadV2Universe,
  validateV2UniversePayload,
  V2_UNIVERSE_EXPECTED,
} from "../../apps/dashboard/app/v2-universe.js";

describe("authoritative V2 universe", () => {
  it("serves the governed no-floor universe with only registry-governed exclusions applied", () => {
    // The preserved V2 archive stays complete and byte-identical (its pinned
    // provenance hash is asserted below and in the governed-exclusions
    // tests); the served universe applies exactly the governed exclusion
    // registry (currently MCW) with recomputed counts.
    const universe = loadV2Universe();

    expect(universe.total).toBe(1360);
    expect(universe.stocks).toBe(1290);
    expect(universe.etfs).toBe(70);
    expect(new Set(universe.rows.map(({ ticker }) => ticker)).size).toBe(1360);
    expect(universe.rows.some(({ ticker }) => ticker === "MCW")).toBe(false);
    expect(universe.rows.every(({ ticker, name }) => ticker && name)).toBe(true);
    expect(universe.provenance.sha256).toBe(V2_UNIVERSE_EXPECTED.sha256);
  });

  it("fails closed when the payload narrows or duplicates a ticker", () => {
    const fixture = {
      meta: {
        floor: 0,
        n_total: 2,
        n_stocks: 2,
        n_etf: 0,
        sectors: ["Technology"],
      },
      rows: [
        {
          ticker: "ONE",
          name: "One",
          sector: "Technology",
          industry: "Software",
          marketCapB: 1,
          marketCap: 1_000_000_000,
          byPreset: { equal: { c: 8, r: "Buy" } },
          raw: {},
        },
        {
          ticker: "ONE",
          name: "Duplicate",
          sector: "Technology",
          industry: "Software",
          marketCapB: 2,
          marketCap: 2_000_000_000,
          byPreset: { equal: { c: 7, r: "Hold" } },
          raw: {},
        },
      ],
    };

    expect(() => validateV2UniversePayload(fixture, undefined)).toThrow("duplicate ticker ONE");
    expect(() =>
      validateV2UniversePayload({ ...fixture, rows: fixture.rows.slice(0, 1) }, undefined),
    ).toThrow("metadata total must equal row length");
  });

  it("searches, filters and sorts across the complete set", () => {
    const universe = loadV2Universe();
    const micron = filterUniverseRows(universe.rows, {
      query: "Micron",
      sector: "all",
      sort: "score-desc",
    });
    const etfs = filterUniverseRows(universe.rows, {
      query: "",
      sector: "ETF",
      sort: "ticker-asc",
    });
    const byMarketCap = filterUniverseRows(universe.rows, {
      query: "",
      sector: "all",
      sort: "market-cap-desc",
    });

    expect(micron.some(({ ticker }) => ticker === "MU")).toBe(true);
    expect(etfs).toHaveLength(70);
    expect(etfs.every(({ isEtf }) => isEtf)).toBe(true);
    expect(byMarketCap[0]?.marketCapB).toBeGreaterThanOrEqual(byMarketCap[1]?.marketCapB ?? 0);
  });
});
