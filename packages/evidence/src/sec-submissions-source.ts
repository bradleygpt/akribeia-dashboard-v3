import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  SecSubmissionHistorySchema,
  SecSubmissionSourceReceiptSchema,
  type SecSubmissionSourceReceipt,
} from "@akribeia/contracts";

export interface CaptureSecSubmissionSourcesOptions {
  snapshotId: string;
  outputRoot: string;
  ciks: string[];
  userAgent: string;
  retrievedAt?: string;
  fetchImpl?: typeof fetch;
  requestIntervalMs?: number;
}

export interface CaptureSecSubmissionSourcesResult {
  receiptPath: string;
  disposition: "published" | "reused";
  receipt: SecSubmissionSourceReceipt;
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function parseJson(path: string, payload: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON at "${path}".`, { cause: error });
  }
}

function deterministicJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function writeImmutable(path: string, payload: Uint8Array): Promise<"published" | "reused"> {
  try {
    await writeFile(path, payload, { flag: "wx" });
    return "published";
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }

    if (!(await readFile(path)).equals(payload)) {
      throw new Error(`Immutable SEC submission source conflict at "${path}".`, {
        cause: error,
      });
    }

    return "reused";
  }
}

function canonicalCiks(ciks: string[]): string[] {
  const canonical = [...new Set(ciks)].sort((left, right) => left.localeCompare(right));

  if (canonical.length === 0 || canonical.some((cik) => !/^\d{10}$/.test(cik))) {
    throw new Error("SEC submission capture requires at least one canonical 10-digit CIK.");
  }

  return canonical;
}

async function verifyExistingReceipt(
  receiptPath: string,
  snapshotId: string,
  expectedCiks: string[],
): Promise<CaptureSecSubmissionSourcesResult | null> {
  try {
    const payload = await readFile(receiptPath);
    const receipt = SecSubmissionSourceReceiptSchema.parse(parseJson(receiptPath, payload));

    if (
      receipt.snapshotId !== snapshotId ||
      receipt.sources.map(({ cik }) => cik).join(",") !== expectedCiks.join(",")
    ) {
      throw new Error("Existing SEC submission receipt does not match the requested snapshot.");
    }

    for (const source of receipt.sources) {
      const sourcePath = resolve(source.path);
      const sourcePayload = await readFile(sourcePath);

      if (sourcePayload.byteLength !== source.byteSize || sha256(sourcePayload) !== source.sha256) {
        throw new Error(`Existing SEC submission receipt fails integrity at "${sourcePath}".`);
      }

      const history = SecSubmissionHistorySchema.parse(parseJson(sourcePath, sourcePayload));
      if (
        history.cik !== source.cik ||
        history.filings.recent.accessionNumber.length !== source.recentFilingCount
      ) {
        throw new Error(`Existing SEC submission receipt fails content checks at "${sourcePath}".`);
      }
    }

    return { receiptPath, disposition: "reused", receipt };
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function captureSecSubmissionSources(
  options: CaptureSecSubmissionSourcesOptions,
): Promise<CaptureSecSubmissionSourcesResult> {
  if (options.userAgent.trim().length < 10) {
    throw new Error("SEC_USER_AGENT must identify the requester and contact.");
  }

  const ciks = canonicalCiks(options.ciks);
  const outputRoot = resolve(options.outputRoot);
  const receiptPath = join(outputRoot, "receipt.json");
  await mkdir(outputRoot, { recursive: true });
  const existing = await verifyExistingReceipt(receiptPath, options.snapshotId, ciks);

  if (existing !== null) {
    return existing;
  }

  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestIntervalMs = options.requestIntervalMs ?? 125;
  const captures: Array<{
    cik: string;
    uri: string;
    path: string;
    payload: Uint8Array;
    recentFilingCount: number;
  }> = [];

  for (const [index, cik] of ciks.entries()) {
    if (index > 0 && requestIntervalMs > 0) {
      await wait(requestIntervalMs);
    }

    const uri = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const response = await fetchImpl(uri, {
      headers: {
        "accept-encoding": "gzip, deflate",
        "user-agent": options.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`SEC source "${uri}" returned HTTP ${response.status}.`);
    }

    const payload = new Uint8Array(await response.arrayBuffer());
    const history = SecSubmissionHistorySchema.parse(parseJson(uri, payload));
    if (history.cik !== cik) {
      throw new Error(`SEC submission source "${uri}" returned CIK "${history.cik}".`);
    }

    captures.push({
      cik,
      uri,
      path: join(outputRoot, `CIK${cik}.json`),
      payload,
      recentFilingCount: history.filings.recent.accessionNumber.length,
    });
  }

  const sourceDispositions = await Promise.all(
    captures.map(({ path, payload }) => writeImmutable(path, payload)),
  );
  const receipt = SecSubmissionSourceReceiptSchema.parse({
    receiptSchemaVersion: "1.0.0",
    snapshotId: options.snapshotId,
    retrievedAt,
    sourcePolicy: {
      provider: "U.S. Securities and Exchange Commission",
      api: "EDGAR Submissions",
      access: "public-no-api-key",
      declaredUserAgent: true,
      maxRequestsPerSecond: 10,
      updateSchedule: "real-time-as-disseminated",
    },
    sources: captures.map(({ cik, uri, path, payload, recentFilingCount }) => ({
      cik,
      uri,
      path: relative(resolve("."), path).replaceAll("\\", "/"),
      retrievedAt,
      sha256: sha256(payload),
      byteSize: payload.byteLength,
      recentFilingCount,
    })),
  });
  const receiptDisposition = await writeImmutable(receiptPath, deterministicJson(receipt));

  return {
    receiptPath,
    disposition:
      receiptDisposition === "reused" &&
      sourceDispositions.every((disposition) => disposition === "reused")
        ? "reused"
        : "published",
    receipt,
  };
}
