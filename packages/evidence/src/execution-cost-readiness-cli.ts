import { resolve } from "node:path";
import { generateExecutionCostReadiness } from "./execution-cost-readiness.js";

const result = await generateExecutionCostReadiness({
  activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
  publishedDataRoot: resolve("apps/dashboard/public/data"),
  reportRoot: resolve("data/evidence/execution-cost-readiness"),
  dashboardProjectionPath: resolve(
    "apps/dashboard/app/generated/active-execution-cost-readiness.json",
  ),
  publicReportRoot: resolve("apps/dashboard/public/data/evidence/execution-cost-readiness"),
});
process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.report.buildId,
      disposition: result.disposition,
      targets: result.report.portfolio.positionCount,
      pricedExecutions: result.report.portfolio.pricedExecutionCount,
      transactionCost: result.report.portfolio.transactionCost,
    },
    null,
    2,
  )}\n`,
);
