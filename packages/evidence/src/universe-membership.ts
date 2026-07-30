import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  HistoricalReadinessReportSchema,
  UniverseMembershipReadinessSchema,
  V2BaselineUniverseSnapshotSchema,
  type HistoricalReadinessReport,
  type UniverseMembershipReadiness,
  type V2BaselineUniverseSnapshot,
} from "@akribeia/contracts";

export interface GenerateUniverseMembershipOptions {
  activeHistoricalReadinessPath: string;
  reportRoot: string;
  dashboardProjectionPath: string;
  publicReportRoot: string;
}

export interface GenerateUniverseMembershipResult {
  reportPath: string;
  disposition: "published" | "reused";
  report: UniverseMembershipReadiness;
}

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
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }

    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable universe-membership conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function writeProjection(path: string, payload: Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${randomUUID()}-universe-membership.tmp`);
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(temporaryPath, payload, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function loadReceiptedFloor10(
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

  const parsed = V2BaselineUniverseSnapshotSchema.parse(parseJson(path, payload));
  if (parsed.meta.floor !== 10 || parsed.rows.length !== artifact.rowCount) {
    throw new Error(`Snapshot "${snapshot.snapshotId}" does not reconcile with its receipt.`);
  }

  return parsed;
}

export async function generateUniverseMembership(
  options: GenerateUniverseMembershipOptions,
): Promise<GenerateUniverseMembershipResult> {
  const historicalPath = resolve(options.activeHistoricalReadinessPath);
  const historicalPayload = await readFile(historicalPath);
  const historical = HistoricalReadinessReportSchema.parse(
    parseJson(historicalPath, historicalPayload),
  );
  const earlierInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === "june-oracle",
  );
  const laterInventory = historical.snapshots.find(
    ({ snapshotId }) => snapshotId === "july-baseline",
  );

  if (earlierInventory === undefined || laterInventory === undefined) {
    throw new Error("Historical readiness does not contain the required June and July snapshots.");
  }

  const [earlier, later] = await Promise.all([
    loadReceiptedFloor10(earlierInventory),
    loadReceiptedFloor10(laterInventory),
  ]);
  const earlierByTicker = new Map(earlier.rows.map((row) => [row.ticker, row]));
  const laterByTicker = new Map(later.rows.map((row) => [row.ticker, row]));
  const continuing = [...earlierByTicker.keys()].filter((ticker) => laterByTicker.has(ticker));
  const entrants = [...laterByTicker.values()]
    .filter(({ ticker }) => !earlierByTicker.has(ticker))
    .sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right))
    .map(({ ticker, name, marketCapB }) => ({ ticker, name, laterMarketCapB: marketCapB }));
  const exits = [...earlierByTicker.values()]
    .filter(({ ticker }) => !laterByTicker.has(ticker))
    .sort(({ ticker: left }, { ticker: right }) => left.localeCompare(right))
    .map(({ ticker, name, marketCapB }) => ({ ticker, name, earlierMarketCapB: marketCapB }));
  const classificationChanges = continuing.filter((ticker) => {
    const before = earlierByTicker.get(ticker)!;
    const after = laterByTicker.get(ticker)!;
    return before.sector !== after.sector || before.industry !== after.industry;
  }).length;
  const unionTickerCount = new Set([...earlierByTicker.keys(), ...laterByTicker.keys()]).size;

  const report = UniverseMembershipReadinessSchema.parse({
    reportSchemaVersion: "1.0.0",
    buildId: historical.buildId,
    modelVersion: historical.modelVersion,
    assessedAt: historical.assessedAt,
    status: "observed-change-not-survivorship-controlled",
    survivorshipBiasControlled: false,
    historicalValidationEligible: false,
    comparison: {
      earlierSnapshotId: "june-oracle",
      laterSnapshotId: "july-baseline",
      earlierTickerCount: earlier.rows.length,
      laterTickerCount: later.rows.length,
      continuingTickerCount: continuing.length,
      entrantCount: entrants.length,
      exitCount: exits.length,
      unionTickerCount,
      jaccardContinuity: continuing.length / unionTickerCount,
      entrantRate: entrants.length / later.rows.length,
      exitRate: exits.length / earlier.rows.length,
      commonTickerClassificationChangeCount: classificationChanges,
    },
    entrants,
    exits,
    controls: [
      {
        key: "snapshot-membership-observed",
        status: "pass",
        detail:
          "Two receipted, strict-contract-valid $10B research cross-sections expose their observed ticker membership.",
      },
      {
        key: "eligibility-rules",
        status: "blocked",
        detail:
          "The snapshots do not record the index, exchange, liquidity, security-type, or market-cap eligibility rule evaluated for each ticker.",
      },
      {
        key: "membership-effective-intervals",
        status: "blocked",
        detail:
          "No security has a membership start, membership end, or record-level availability timestamp.",
      },
      {
        key: "identity-continuity",
        status: "blocked",
        detail:
          "Ticker equality is only an observed label match; permanent issuer and listing identifiers remain unavailable.",
      },
      {
        key: "delisting-evidence",
        status: "blocked",
        detail:
          "An exit from the later snapshot is not evidence of delisting, merger, acquisition, ticker change, or investability loss.",
      },
      {
        key: "survivorship-bias-control",
        status: "blocked",
        detail:
          "Two cross-sections cannot establish a point-in-time eligible universe for historical scoring or portfolio evaluation.",
      },
    ],
    limitations: [
      "Entrants and exits describe differences between two preserved research files, not verified historical constituent events.",
      "Market-cap changes, source coverage changes, ticker changes, corporate actions, or upstream collection differences may explain membership changes.",
      "Ticker labels are not permanent security identities and may be reused or changed.",
      "Neither snapshot provides record-level availability time or eligibility-effective intervals.",
      "This evidence must not be used for a survivorship-controlled backtest or investment-performance claim.",
    ],
    notice: historical.notice,
  });
  const payload = deterministicJson(report);
  const relativePath = join("builds", report.buildId, "universe-membership.json");
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
    disposition: dispositions.every((disposition) => disposition === "reused")
      ? "reused"
      : "published",
    report,
  };
}
