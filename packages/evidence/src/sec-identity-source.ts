import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  SecCompanyTickerAssociationsSchema,
  SecIdentitySourceReceiptSchema,
  SecMutualFundTickerAssociationsSchema,
  type SecIdentitySourceReceipt,
} from "@akribeia/contracts";

const SOURCES = [
  {
    kind: "company-tickers" as const,
    uri: "https://www.sec.gov/files/company_tickers.json",
    fileName: "company_tickers.json",
  },
  {
    kind: "mutual-fund-tickers" as const,
    uri: "https://www.sec.gov/files/company_tickers_mf.json",
    fileName: "company_tickers_mf.json",
  },
];

export interface CaptureSecIdentitySourcesOptions {
  snapshotId: string;
  outputRoot: string;
  userAgent: string;
  retrievedAt?: string;
  fetchImpl?: typeof fetch;
}

export interface CaptureSecIdentitySourcesResult {
  receiptPath: string;
  disposition: "published" | "reused";
  receipt: SecIdentitySourceReceipt;
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
      throw new Error(`Immutable SEC source conflict at "${path}".`, { cause: error });
    }

    return "reused";
  }
}

async function verifyExistingReceipt(
  receiptPath: string,
  snapshotId: string,
): Promise<CaptureSecIdentitySourcesResult | null> {
  try {
    const payload = await readFile(receiptPath);
    const receipt = SecIdentitySourceReceiptSchema.parse(parseJson(receiptPath, payload));

    if (receipt.snapshotId !== snapshotId) {
      throw new Error(
        `Existing SEC source receipt snapshot "${receipt.snapshotId}" does not match "${snapshotId}".`,
      );
    }

    for (const source of receipt.sources) {
      const sourcePath = resolve(source.path);
      const sourcePayload = await readFile(sourcePath);

      if (sourcePayload.byteLength !== source.byteSize || sha256(sourcePayload) !== source.sha256) {
        throw new Error(`Existing SEC source receipt fails integrity at "${sourcePath}".`);
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

export async function captureSecIdentitySources(
  options: CaptureSecIdentitySourcesOptions,
): Promise<CaptureSecIdentitySourcesResult> {
  if (options.userAgent.trim().length < 10) {
    throw new Error("SEC_USER_AGENT must identify the requester and contact.");
  }

  const outputRoot = resolve(options.outputRoot);
  const receiptPath = join(outputRoot, "receipt.json");
  await mkdir(outputRoot, { recursive: true });
  const existing = await verifyExistingReceipt(receiptPath, options.snapshotId);

  if (existing !== null) {
    return existing;
  }

  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const captures = await Promise.all(
    SOURCES.map(async (source) => {
      const response = await fetchImpl(source.uri, {
        headers: {
          "accept-encoding": "gzip, deflate",
          "user-agent": options.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`SEC source "${source.uri}" returned HTTP ${response.status}.`);
      }

      const lastModified = response.headers.get("last-modified");
      if (lastModified === null) {
        throw new Error(`SEC source "${source.uri}" omitted Last-Modified provenance.`);
      }

      const payload = new Uint8Array(await response.arrayBuffer());
      const parsed = parseJson(source.fileName, payload);
      const recordCount =
        source.kind === "company-tickers"
          ? Object.keys(SecCompanyTickerAssociationsSchema.parse(parsed)).length
          : SecMutualFundTickerAssociationsSchema.parse(parsed).data.length;
      const path = join(outputRoot, source.fileName);

      return {
        source,
        path,
        payload,
        recordCount,
        lastModifiedAt: new Date(lastModified).toISOString(),
      };
    }),
  );
  const sourceDispositions = await Promise.all(
    captures.map(({ path, payload }) => writeImmutable(path, payload)),
  );
  const receipt = SecIdentitySourceReceiptSchema.parse({
    receiptSchemaVersion: "1.0.0",
    snapshotId: options.snapshotId,
    retrievedAt,
    sourcePolicy: {
      provider: "U.S. Securities and Exchange Commission",
      access: "public-no-api-key",
      declaredUserAgent: true,
      maxRequestsPerSecond: 10,
      accuracyGuarantee: "not-guaranteed-by-provider",
    },
    sources: captures.map(({ source, path, payload, recordCount, lastModifiedAt }) => ({
      kind: source.kind,
      uri: source.uri,
      path: relative(resolve("."), path).replaceAll("\\", "/"),
      retrievedAt,
      lastModifiedAt,
      sha256: sha256(payload),
      byteSize: payload.byteLength,
      recordCount,
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
