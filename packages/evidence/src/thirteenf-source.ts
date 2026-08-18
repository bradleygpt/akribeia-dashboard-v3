import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  SecSubmissionHistorySchema,
  ThirteenFSourceReceiptSchema,
  type SecSubmissionHistory,
  type ThirteenFSourceReceipt,
} from "@akribeia/contracts";
import { parseInfoTableXml, parsePrimaryDocXml } from "./thirteenf-parse.js";

export interface CaptureThirteenFSourcesOptions {
  snapshotId: string;
  outputRoot: string;
  submissionSourceRoot: string;
  ciks: string[];
  userAgent: string;
  periodsPerManager?: number;
  retrievedAt?: string;
  fetchImpl?: typeof fetch;
  requestIntervalMs?: number;
}

export interface CaptureThirteenFSourcesResult {
  receiptPath: string;
  disposition: "published" | "reused";
  receipt: ThirteenFSourceReceipt;
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
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
      throw new Error(`Immutable 13F source conflict at "${path}".`, { cause: error });
    }
    return "reused";
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

interface SelectedFiling {
  cik: string;
  accessionNumber: string;
  form: "13F-HR" | "13F-HR/A";
  filingDate: string;
  reportDate: string;
  primaryDocument: string;
}

export function selectThirteenFFilings(
  history: SecSubmissionHistory,
  periodsPerManager: number,
): SelectedFiling[] {
  const recent = history.filings.recent;
  const rows: SelectedFiling[] = [];
  for (const [index, form] of recent.form.entries()) {
    if (form !== "13F-HR" && form !== "13F-HR/A") {
      continue;
    }
    const reportDate = recent.reportDate[index];
    if (reportDate === "") {
      throw new Error(
        `13F filing ${recent.accessionNumber[index]} for CIK ${history.cik} has no reportDate.`,
      );
    }
    rows.push({
      cik: history.cik,
      accessionNumber: recent.accessionNumber[index],
      form,
      filingDate: recent.filingDate[index],
      reportDate,
      primaryDocument: recent.primaryDocument[index],
    });
  }

  const selectedPeriods = [...new Set(rows.map(({ reportDate }) => reportDate))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, periodsPerManager);
  const selectedPeriodSet = new Set(selectedPeriods);

  return rows
    .filter(({ reportDate }) => selectedPeriodSet.has(reportDate))
    .sort(
      (left, right) =>
        left.reportDate.localeCompare(right.reportDate) ||
        left.filingDate.localeCompare(right.filingDate) ||
        left.accessionNumber.localeCompare(right.accessionNumber),
    );
}

interface EdgarIndexItem {
  name: string;
  size: string | number;
}

function archiveBase(cik: string, accessionNumber: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number.parseInt(cik, 10)}/${accessionNumber.replaceAll("-", "")}`;
}

function pickInformationTable(items: EdgarIndexItem[], primaryDocument: string): string {
  const xmlItems = items.filter(
    ({ name }) =>
      name.toLowerCase().endsWith(".xml") &&
      name !== primaryDocument &&
      !name.toLowerCase().includes("primary_doc"),
  );
  if (xmlItems.length === 0) {
    throw new Error("13F filing index lists no information-table XML document.");
  }
  const named = xmlItems.filter(({ name }) => /info.*table|form13f/i.test(name));
  const candidates = named.length > 0 ? named : xmlItems;
  return candidates
    .slice()
    .sort((left, right) => Number(right.size) - Number(left.size) || left.name.localeCompare(right.name))[0]
    .name;
}

export async function captureThirteenFSources(
  options: CaptureThirteenFSourcesOptions,
): Promise<CaptureThirteenFSourcesResult> {
  if (options.userAgent.trim().length < 10) {
    throw new Error("SEC_USER_AGENT must identify the requester and contact.");
  }

  const outputRoot = resolve(options.outputRoot);
  const receiptPath = join(outputRoot, "receipt.json");
  await mkdir(outputRoot, { recursive: true });

  try {
    const existing = ThirteenFSourceReceiptSchema.parse(
      JSON.parse(await readFile(receiptPath, "utf8")),
    );
    if (existing.snapshotId !== options.snapshotId) {
      throw new Error("Existing 13F receipt does not match the requested snapshot.");
    }
    for (const filing of existing.filings) {
      for (const document of filing.documents) {
        const payload = await readFile(resolve(document.path));
        if (payload.byteLength !== document.byteSize || sha256(payload) !== document.sha256) {
          throw new Error(`Existing 13F receipt fails integrity at "${document.path}".`);
        }
      }
    }
    return { receiptPath, disposition: "reused", receipt: existing };
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) {
      throw error;
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestIntervalMs = options.requestIntervalMs ?? 150;
  const periodsPerManager = options.periodsPerManager ?? 2;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const headers = {
    "accept-encoding": "gzip, deflate",
    "user-agent": options.userAgent,
  };

  let requestCount = 0;
  const fetchBytes = async (uri: string): Promise<Uint8Array> => {
    if (requestCount > 0 && requestIntervalMs > 0) {
      await wait(requestIntervalMs);
    }
    requestCount += 1;
    const response = await fetchImpl(uri, { headers });
    if (!response.ok) {
      throw new Error(`SEC source "${uri}" returned HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  const ciks = [...new Set(options.ciks)].sort((left, right) => left.localeCompare(right));
  const receiptFilings: ThirteenFSourceReceipt["filings"] = [];
  const seenAccessions = new Set<string>();

  for (const cik of ciks) {
    const submissionPath = join(resolve(options.submissionSourceRoot), `CIK${cik}.json`);
    const history = SecSubmissionHistorySchema.parse(
      JSON.parse(await readFile(submissionPath, "utf8")),
    );
    const filings = selectThirteenFFilings(history, periodsPerManager);
    if (filings.length === 0) {
      throw new Error(`CIK ${cik} has no 13F-HR filings in its captured submission history.`);
    }

    for (const filing of filings) {
      if (seenAccessions.has(filing.accessionNumber)) {
        continue;
      }
      seenAccessions.add(filing.accessionNumber);

      const base = archiveBase(filing.cik, filing.accessionNumber);
      const filingRoot = join(outputRoot, cik, filing.accessionNumber);
      await mkdir(filingRoot, { recursive: true });

      const indexUri = `${base}/index.json`;
      const indexBytes = await fetchBytes(indexUri);
      const indexJson = JSON.parse(new TextDecoder().decode(indexBytes)) as {
        directory: { item: EdgarIndexItem[] };
      };
      const infoTableName = pickInformationTable(indexJson.directory.item, filing.primaryDocument);

      const primaryUri = `${base}/${filing.primaryDocument}`;
      const primaryBytes = await fetchBytes(primaryUri);
      const primaryDoc = parsePrimaryDocXml(new TextDecoder().decode(primaryBytes));
      if (primaryDoc.periodOfReport !== filing.reportDate) {
        throw new Error(
          `13F ${filing.accessionNumber} primary document period ${primaryDoc.periodOfReport} does not match submissions reportDate ${filing.reportDate}.`,
        );
      }

      const infoTableUri = `${base}/${infoTableName}`;
      const infoTableBytes = await fetchBytes(infoTableUri);
      parseInfoTableXml(new TextDecoder().decode(infoTableBytes));

      const documents = [
        { role: "filing-index" as const, uri: indexUri, name: "index.json", payload: indexBytes },
        {
          role: "primary-document" as const,
          uri: primaryUri,
          name: filing.primaryDocument,
          payload: primaryBytes,
        },
        {
          role: "information-table" as const,
          uri: infoTableUri,
          name: infoTableName,
          payload: infoTableBytes,
        },
      ];

      const documentRecords = [];
      for (const document of documents) {
        const path = join(filingRoot, document.name.replaceAll("/", "_"));
        await writeImmutable(path, document.payload);
        documentRecords.push({
          role: document.role,
          uri: document.uri,
          path: relative(resolve("."), path).replaceAll("\\", "/"),
          sha256: sha256(document.payload),
          byteSize: document.payload.byteLength,
        });
      }

      receiptFilings.push({
        cik: filing.cik,
        accessionNumber: filing.accessionNumber,
        form: filing.form,
        filingDate: filing.filingDate,
        periodOfReport: filing.reportDate,
        documents: documentRecords,
      });
    }
  }

  const receipt = ThirteenFSourceReceiptSchema.parse({
    receiptSchemaVersion: "1.0.0",
    snapshotId: options.snapshotId,
    retrievedAt,
    sourcePolicy: {
      provider: "U.S. Securities and Exchange Commission",
      api: "EDGAR Archives",
      access: "public-no-api-key",
      declaredUserAgent: true,
      maxRequestsPerSecond: 10,
    },
    filings: receiptFilings,
  });

  const payload = new TextEncoder().encode(`${JSON.stringify(receipt, null, 2)}\n`);
  const disposition = await writeImmutable(receiptPath, payload);
  return { receiptPath, disposition, receipt };
}
