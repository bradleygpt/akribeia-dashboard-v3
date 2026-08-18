import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { InstitutionalManagerDirectorySchema } from "@akribeia/contracts";
import { captureSecSubmissionSources } from "./sec-submissions-source.js";
import { captureThirteenFSources } from "./thirteenf-source.js";

const userAgent = process.env.SEC_USER_AGENT;
if (userAgent === undefined) {
  throw new Error("SEC_USER_AGENT is required. Use the SEC-declared company/contact format.");
}

const snapshotId = process.env.THIRTEENF_SNAPSHOT_ID;
if (snapshotId === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotId)) {
  throw new Error("THIRTEENF_SNAPSHOT_ID must be set to the capture date (YYYY-MM-DD).");
}

const directory = InstitutionalManagerDirectorySchema.parse(
  JSON.parse(await readFile(resolve("data/reference/institutional/managers.json"), "utf8")),
);
const ciks = directory.managers.map(({ cik }) => cik);

const submissionRoot = resolve(`data/reference/sec/13f-submissions/${snapshotId}`);
const submissions = await captureSecSubmissionSources({
  snapshotId,
  outputRoot: submissionRoot,
  ciks,
  userAgent,
});

const filings = await captureThirteenFSources({
  snapshotId,
  outputRoot: resolve(`data/reference/sec/13f/${snapshotId}`),
  submissionSourceRoot: submissionRoot,
  ciks,
  userAgent,
  periodsPerManager: 2,
});

process.stdout.write(
  `${JSON.stringify(
    {
      submissions: {
        disposition: submissions.disposition,
        receiptPath: submissions.receiptPath,
        sources: submissions.receipt.sources.length,
      },
      filings: {
        disposition: filings.disposition,
        receiptPath: filings.receiptPath,
        filingCount: filings.receipt.filings.length,
        byForm: filings.receipt.filings.reduce<Record<string, number>>((counts, { form }) => {
          counts[form] = (counts[form] ?? 0) + 1;
          return counts;
        }, {}),
      },
    },
    null,
    2,
  )}\n`,
);
