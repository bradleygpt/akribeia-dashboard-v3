import { resolve } from "node:path";
import { collectDailyObservation } from "./index.js";

const receiptPath = process.env.AKRIBEIA_COLLECTION_RECEIPT_PATH;
const result = await collectDailyObservation({
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  evidenceRoot: resolve("data/evidence"),
  dashboardProjectionPath: resolve("apps/dashboard/app/generated/active-daily-evidence.json"),
  publicEvidenceRoot: resolve("apps/dashboard/public/data/evidence"),
  prospectiveReportRoot: resolve("data/evidence/prospective-readiness"),
  prospectiveDashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-prospective-readiness.json",
  ),
  prospectivePublicReportRoot: resolve("apps/dashboard/public/data/evidence/prospective-readiness"),
  receiptPath: receiptPath === undefined ? undefined : resolve(receiptPath),
});

process.stdout.write(
  `${JSON.stringify(
    {
      ...result.receipt,
      receiptPath: result.receiptPath,
    },
    null,
    2,
  )}\n`,
);

if (result.receipt.disposition === "blocked-backdated-date") {
  process.exitCode = 2;
}
