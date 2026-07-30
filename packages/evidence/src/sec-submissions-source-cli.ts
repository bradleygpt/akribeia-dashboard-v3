import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SecRegistrantCrosswalkSchema, VerticalSliceDashboardSchema } from "@akribeia/contracts";
import { captureSecSubmissionSources } from "./sec-submissions-source.js";

const userAgent = process.env.SEC_USER_AGENT;
if (userAgent === undefined) {
  throw new Error("SEC_USER_AGENT is required. Use the SEC-declared company/contact format.");
}

const dashboard = VerticalSliceDashboardSchema.parse(
  JSON.parse(await readFile(resolve("apps/dashboard/app/generated/active-dashboard.json"), "utf8")),
);
const crosswalk = SecRegistrantCrosswalkSchema.parse(
  JSON.parse(
    await readFile(resolve("apps/dashboard/app/generated/active-sec-registrants.json"), "utf8"),
  ),
);
const selectedTickers = new Set([
  ...dashboard.topScores.map(({ ticker }) => ticker),
  ...dashboard.portfolio.positions.map(({ ticker }) => ticker),
]);
const ciks = crosswalk.matches
  .filter(
    ({ ticker, sourceType }) => sourceType === "company-ticker" && selectedTickers.has(ticker),
  )
  .map(({ cik }) => cik);
const result = await captureSecSubmissionSources({
  snapshotId: "2026-07-30",
  outputRoot: resolve("data/reference/sec/filing-submissions/2026-07-30"),
  ciks,
  userAgent,
});

process.stdout.write(
  `${JSON.stringify(
    {
      disposition: result.disposition,
      receiptPath: result.receiptPath,
      retrievedAt: result.receipt.retrievedAt,
      sources: result.receipt.sources.length,
      recentFilings: result.receipt.sources.reduce(
        (count, { recentFilingCount }) => count + recentFilingCount,
        0,
      ),
    },
    null,
    2,
  )}\n`,
);
