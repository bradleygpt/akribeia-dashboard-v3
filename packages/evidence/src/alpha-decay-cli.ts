import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureAlphaDecayVintage, generateAlphaDecayReport } from "./alpha-decay.js";

const mode = process.argv[2] ?? "capture-and-report";
if (mode !== "capture-and-report" && mode !== "report-only") {
  throw new Error(`Unknown alpha-decay CLI mode "${mode}".`);
}

const vintagesRoot = resolve("data/evidence/alpha-decay/vintages");
let capture = null;
if (mode === "capture-and-report") {
  capture = await captureAlphaDecayVintage({
    publishedDataRoot: resolve("apps/dashboard/public/data"),
    vintagesRoot,
    capturedAt: new Date().toISOString(),
  });
}

const report = await generateAlphaDecayReport({
  vintagesRoot,
  generatedAt: new Date().toISOString(),
});

const outputPath = resolve("apps/dashboard/app/generated/active-alpha-decay.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      capture,
      outputPath,
      vintageCount: report.ledger.vintageCount,
      overallState: report.overallState,
    },
    null,
    2,
  )}\n`,
);

if (capture !== null && capture.disposition === "blocked-backdated-date") {
  process.exitCode = 2;
}
