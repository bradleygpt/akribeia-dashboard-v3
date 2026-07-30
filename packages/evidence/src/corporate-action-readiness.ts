import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  CorporateActionReadinessSchema,
  HistoricalReadinessReportSchema,
  UniverseMembershipReadinessSchema,
  V2BaselineUniverseSnapshotSchema,
  type CorporateActionReadiness,
  type HistoricalReadinessReport,
  type V2BaselineUniverseSnapshot,
} from "@akribeia/contracts";

export interface GenerateCorporateActionReadinessOptions {
  activeHistoricalReadinessPath: string;
  activeUniverseMembershipPath: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateCorporateActionReadinessResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: CorporateActionReadiness;
}

const LOWER_RATIO = 0.5;
const UPPER_RATIO = 2;
const STABLE_MARKET_CAP_BAND = 0.15;

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function parseJson(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}

function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function writeImmutable(path: string, payload: Uint8Array): Promise<"published" | "reused"> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, payload, { flag: "wx" });
    return "published";
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) throw error;
    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable corporate-action-readiness conflict at "${path}".`, {
        cause: error,
      });
    }
    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-corporate-actions.tmp`);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function loadFloor10(
  snapshot: HistoricalReadinessReport["snapshots"][number],
): Promise<V2BaselineUniverseSnapshot> {
  const artifact = snapshot.artifacts.find(({ floorBillions }) => floorBillions === 10);
  if (artifact === undefined || artifact.strictInputContractStatus !== "pass") {
    throw new Error(`Snapshot "${snapshot.snapshotId}" has no valid $10B universe artifact.`);
  }
  const path = resolve(artifact.path);
  const payload = await readFile(path);
  if (sha256(payload) !== artifact.sha256) {
    throw new Error(`Snapshot "${snapshot.snapshotId}" fails its historical-readiness receipt.`);
  }
  const snapshotData = V2BaselineUniverseSnapshotSchema.parse(parseJson(path, payload));
  if (snapshotData.meta.floor !== 10 || snapshotData.rows.length !== artifact.rowCount) {
    throw new Error(`Snapshot "${snapshot.snapshotId}" does not reconcile with its receipt.`);
  }
  return snapshotData;
}

export async function generateCorporateActionReadiness(
  options: GenerateCorporateActionReadinessOptions,
): Promise<GenerateCorporateActionReadinessResult> {
  const historicalPath = resolve(options.activeHistoricalReadinessPath);
  const membershipPath = resolve(options.activeUniverseMembershipPath);
  const [historical, membership] = await Promise.all([
    readFile(historicalPath).then((payload) =>
      HistoricalReadinessReportSchema.parse(parseJson(historicalPath, payload)),
    ),
    readFile(membershipPath).then((payload) =>
      UniverseMembershipReadinessSchema.parse(parseJson(membershipPath, payload)),
    ),
  ]);
  if (
    membership.buildId !== historical.buildId ||
    membership.modelVersion !== historical.modelVersion ||
    membership.assessedAt !== historical.assessedAt
  ) {
    throw new Error("Corporate-action readiness inputs do not share active lineage.");
  }
  const earlierInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === membership.comparison.earlierSnapshotId,
  );
  const laterInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === membership.comparison.laterSnapshotId,
  );
  if (earlierInventory === undefined || laterInventory === undefined) {
    throw new Error("Corporate-action readiness cannot resolve the compared snapshots.");
  }
  const [earlier, later] = await Promise.all([
    loadFloor10(earlierInventory),
    loadFloor10(laterInventory),
  ]);
  const laterByTicker = new Map(later.rows.map((row) => [row.ticker, row]));
  const common = earlier.rows.filter(({ ticker }) => laterByTicker.has(ticker));
  if (common.length !== membership.comparison.continuingTickerCount) {
    throw new Error("Corporate-action common membership does not reconcile.");
  }
  const observations = common
    .map((before) => {
      const after = laterByTicker.get(before.ticker)!;
      const priceRatio = after.price / before.price;
      const marketCapRatio = after.marketCapB / before.marketCapB;
      const impliedSharesRatio =
        after.marketCapB / after.price / (before.marketCapB / before.price);
      const extremePrice = priceRatio <= LOWER_RATIO || priceRatio >= UPPER_RATIO;
      const extremeShares = impliedSharesRatio <= LOWER_RATIO || impliedSharesRatio >= UPPER_RATIO;
      const stableMarketCap = Math.abs(marketCapRatio - 1) <= STABLE_MARKET_CAP_BAND;
      if (!extremePrice) return null;
      return {
        ticker: before.ticker,
        name: before.name,
        signal:
          extremeShares && stableMarketCap
            ? ("possible-share-count-discontinuity" as const)
            : ("price-and-market-cap-discontinuity" as const),
        earlierPrice: before.price,
        laterPrice: after.price,
        priceRatio,
        earlierMarketCapB: before.marketCapB,
        laterMarketCapB: after.marketCapB,
        marketCapRatio,
        impliedSharesRatio,
        verifiedCorporateAction: null,
      };
    })
    .filter((observation) => observation !== null)
    .sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right));
  const possibleCount = observations.filter(
    ({ signal }) => signal === "possible-share-count-discontinuity",
  ).length;
  const report = CorporateActionReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: historical.buildId,
    modelVersion: historical.modelVersion,
    assessedAt: historical.assessedAt,
    status: "blocked-unverified-adjustments",
    corporateActionsControlled: false,
    historicalValidationEligible: false,
    comparison: {
      earlierSnapshotId: membership.comparison.earlierSnapshotId,
      laterSnapshotId: membership.comparison.laterSnapshotId,
      commonTickerCount: common.length,
      priceRatioLowerBoundary: LOWER_RATIO,
      priceRatioUpperBoundary: UPPER_RATIO,
      impliedSharesRatioLowerBoundary: LOWER_RATIO,
      impliedSharesRatioUpperBoundary: UPPER_RATIO,
      stableMarketCapRelativeBand: STABLE_MARKET_CAP_BAND,
    },
    observations,
    coverage: {
      thresholdObservationCount: observations.length,
      possibleShareCountDiscontinuityCount: possibleCount,
      priceAndMarketCapDiscontinuityCount: observations.length - possibleCount,
      verifiedCorporateActionCount: 0,
      verifiedAdjustedSeriesCount: 0,
    },
    controls: [
      {
        key: "receipted-snapshot-prices",
        status: "pass",
        detail: `${common.length} common ticker prices and market capitalizations reconcile to receipted snapshots.`,
      },
      {
        key: "split-events",
        status: "blocked",
        detail: "No authoritative split ratio, ex-date, effective date, or source receipt exists.",
      },
      {
        key: "cash-distributions",
        status: "blocked",
        detail: "No ordinary, special, or return-of-capital distribution ledger exists.",
      },
      {
        key: "mergers-spinoffs",
        status: "blocked",
        detail: "No merger, acquisition, spin-off, conversion, or successor-security terms exist.",
      },
      {
        key: "delistings",
        status: "blocked",
        detail:
          "No delisting date, terminal value, cash-out, or successor identity evidence exists.",
      },
      {
        key: "adjusted-total-return-series",
        status: "blocked",
        detail:
          "No independently reproducible split- and distribution-adjusted price series exists.",
      },
    ],
    limitations: [
      "Threshold observations are diagnostics, not verified corporate-action events.",
      "Implied shares use rounded snapshot market capitalization divided by price and are not shares-outstanding records.",
      "Price and market-cap changes may reflect market movement, source errors, stale values, security changes, or corporate actions.",
      "Without event-effective dates and adjustment factors, returns and portfolio transitions remain incomparable.",
      "No observation may be used to synthesize a split factor or adjusted return.",
    ],
    notice: membership.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "corporate-action-readiness.json");
  const reportPath = join(resolve(options.reportRoot), relativePath);
  const dispositions = await Promise.all([
    writeImmutable(reportPath, payload),
    writeImmutable(join(resolve(options.publicReportRoot), relativePath), payload),
  ]);
  await Promise.all([
    writeProjection(resolve(options.dashboardProjectionPath), payload),
    writeProjection(join(resolve(options.publicReportRoot), "active.json"), payload),
  ]);
  return {
    reportPath,
    disposition: dispositions.every((value) => value === "reused") ? "reused" : "published",
    report,
  };
}
