import { cp } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const PUBLISHED_DATA_ROOT = resolve("apps/dashboard/public/data");

// Dashboard-only reference datasets that no evidence generator reads. They are
// ~160 MB of the ~173 MB published tree, and copying them made the tamper tests
// below brush the 5 s test timeout whenever the suite ran in parallel on a slow
// disk. A generator that starts reading one of these fails here with ENOENT
// rather than silently testing against a partial copy.
function isEvidenceInput(source: string): boolean {
  if (dirname(source) !== PUBLISHED_DATA_ROOT) return true;
  const name = basename(source);
  return !name.startsWith("etf-") && name !== "mlpred.json" && name !== "ai-fundamentals.json";
}

/** Copies the published data tree an evidence generator reads into `destination`. */
export async function copyPublishedEvidenceInputs(destination: string): Promise<void> {
  await cp(PUBLISHED_DATA_ROOT, destination, { recursive: true, filter: isEvidenceInput });
}
