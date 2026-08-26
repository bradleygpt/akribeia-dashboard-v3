// Shared test helper: the currently active immutable build id, read from the
// same pointer the runtime serves, so lineage assertions track each published
// build instead of freezing a literal.
import { readFile } from "node:fs/promises";

const pointer = JSON.parse(
  await readFile(new URL("../public/data/active-build.json", import.meta.url), "utf8"),
);

export const activeBuildId = pointer.activeBuildId;
export const previousBuildId = pointer.previousBuildId;

const dashboard = JSON.parse(
  await readFile(new URL("../app/generated/active-dashboard.json", import.meta.url), "utf8"),
);
const registrants = JSON.parse(
  await readFile(new URL("../app/generated/active-sec-registrants.json", import.meta.url), "utf8"),
);
const daily = JSON.parse(
  await readFile(new URL("../app/generated/active-daily-evidence.json", import.meta.url), "utf8"),
);

/** securities scored in the active build (source row count). */
export const scoredTotal = dashboard.source.rowCount;
/** registrant crosswalk matches in the active build. */
export const matchedRegistrants = registrants.coverage.matchedSecurityCount;
/** the active observation date (YYYY-MM-DD). */
export const activeAsOfDate = daily.asOfDate;

const universeMembership = JSON.parse(
  await readFile(
    new URL("../app/generated/active-universe-membership.json", import.meta.url),
    "utf8",
  ),
);
const exitDisposition = JSON.parse(
  await readFile(
    new URL("../app/generated/active-exit-disposition-readiness.json", import.meta.url),
    "utf8",
  ),
);

/** coverage/comparison blocks from the generated projections, for cross-copy
 * integrity checks against the packaged build artifacts. */
export const registrantsCoverage = registrants.coverage;
export const membershipComparison = universeMembership.comparison;
export const exitCoverage = exitDisposition.coverage;

const filingAvailability = JSON.parse(
  await readFile(
    new URL("../app/generated/active-filing-availability.json", import.meta.url),
    "utf8",
  ),
);
export const filingCoverage = filingAvailability.coverage;
export const filingUnmatched = filingAvailability.unmatched;

const prospective = JSON.parse(
  await readFile(
    new URL("../app/generated/active-prospective-readiness.json", import.meta.url),
    "utf8",
  ),
);
export const prospectiveProgress = prospective.progress;
