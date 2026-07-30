import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { VerticalSliceBuildRecipeSchema } from "@akribeia/contracts";
import { runVerticalSlice, verifyPublishedVerticalSlice } from "./index.js";

const recipePath = resolve(process.argv[2] ?? "data/preview/vertical-slice-build.json");
const recipe = VerticalSliceBuildRecipeSchema.parse(
  JSON.parse(await readFile(recipePath, "utf8")) as unknown,
);
const result = await runVerticalSlice(recipe);
const verified = await verifyPublishedVerticalSlice(recipe.outputRoot);

if (verified.buildId !== result.buildId) {
  throw new Error("The active dashboard does not match the published build.");
}

process.stdout.write(
  `${JSON.stringify(
    {
      buildId: result.buildId,
      activePointer: result.pointerPath,
      dashboardProjection: result.projectionPath,
      sourceRows: result.dashboard.source.rowCount,
      eligibleSecurities: result.dashboard.scoring.eligibleSecurities,
      portfolioPositions: result.dashboard.portfolio.positions.length,
    },
    null,
    2,
  )}\n`,
);
