import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateInstitutionalIntelligence } from "./institutional-intelligence.js";

const snapshotId = process.env.THIRTEENF_SNAPSHOT_ID;
if (snapshotId === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotId)) {
  throw new Error("THIRTEENF_SNAPSHOT_ID must be set to the capture date (YYYY-MM-DD).");
}

// MCW is a known identity-linkage contamination in the wider Akribeia program;
// it must never resolve to a canonical identity on institutional surfaces.
const INSTITUTIONAL_IDENTITY_EXCLUSIONS = new Set(["MCW"]);

const artifact = await generateInstitutionalIntelligence({
  directoryPath: resolve("data/reference/institutional/managers.json"),
  receiptPath: resolve(`data/reference/sec/13f/${snapshotId}/receipt.json`),
  registrantCrosswalkPath: resolve("apps/dashboard/app/generated/active-sec-registrants.json"),
  activeSecurityExclusions: INSTITUTIONAL_IDENTITY_EXCLUSIONS,
  generatedAt: new Date().toISOString(),
});

const outputPath = resolve("apps/dashboard/app/generated/active-institutional-intelligence.json");
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      outputPath,
      managerCount: artifact.coverage.managerCount,
      filingsProcessed: artifact.coverage.filingsProcessed,
      amendmentsProcessed: artifact.coverage.amendmentsProcessed,
      amendmentsSuperseding: artifact.coverage.amendmentsSuperseding,
      duplicateAccessionsRejected: artifact.coverage.duplicateAccessionsRejected,
      positionRowsParsed: artifact.coverage.positionRowsParsed,
      uniqueInstruments: artifact.coverage.uniqueInstruments,
      resolvedInstruments: artifact.coverage.resolvedInstruments,
      unresolvedInstruments: artifact.coverage.unresolvedInstruments,
      excludedContaminatedInstruments: artifact.coverage.excludedContaminatedInstruments,
      stockRollups: artifact.stockRollups.length,
    },
    null,
    2,
  )}\n`,
);
