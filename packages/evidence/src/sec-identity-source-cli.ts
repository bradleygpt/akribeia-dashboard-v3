import { resolve } from "node:path";
import { captureSecIdentitySources } from "./sec-identity-source.js";

const userAgent = process.env.SEC_USER_AGENT;
if (userAgent === undefined) {
  throw new Error("SEC_USER_AGENT is required. Use the SEC-declared company/contact format.");
}

const result = await captureSecIdentitySources({
  snapshotId: "2026-07-30",
  outputRoot: resolve("data/reference/sec/2026-07-30"),
  userAgent,
});

process.stdout.write(
  `${JSON.stringify(
    {
      disposition: result.disposition,
      receiptPath: result.receiptPath,
      retrievedAt: result.receipt.retrievedAt,
      sources: result.receipt.sources.map(({ kind, recordCount, sha256 }) => ({
        kind,
        recordCount,
        sha256,
      })),
    },
    null,
    2,
  )}\n`,
);
