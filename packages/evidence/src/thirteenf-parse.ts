const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#38;": "&",
  "&#39;": "'",
};

function decodeXmlText(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#38|#39);/g, (entity) => XML_ENTITIES[entity]);
}

function tagText(source: string, tag: string): string | null {
  // Namespace-prefixed and plain tags both appear in EDGAR 13F documents.
  const match = new RegExp(`<(?:[A-Za-z0-9]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>`).exec(
    source,
  );
  return match === null ? null : decodeXmlText(match[1].trim());
}

export interface ParsedInfoTableRow {
  nameOfIssuer: string;
  titleOfClass: string;
  cusip: string;
  reportedValue: number;
  shares: number;
  sharesType: "SH" | "PRN";
  putCall: "Put" | "Call" | null;
}

export interface ParsedInfoTable {
  rows: ParsedInfoTableRow[];
}

function parseRequiredNumber(raw: string | null, field: string, entry: string): number {
  if (raw === null || raw.length === 0) {
    throw new Error(`13F information table entry is missing <${field}>: ${entry.slice(0, 200)}`);
  }
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`13F information table <${field}> is not a non-negative number: "${raw}".`);
  }
  return value;
}

export function parseInfoTableXml(xml: string): ParsedInfoTable {
  const entries = xml.match(/<(?:[A-Za-z0-9]+:)?infoTable(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9]+:)?infoTable>/g);
  if (entries === null) {
    throw new Error("13F information table XML contains no infoTable entries.");
  }

  const rows = entries.map((entry) => {
    const nameOfIssuer = tagText(entry, "nameOfIssuer");
    const titleOfClass = tagText(entry, "titleOfClass");
    const cusipRaw = tagText(entry, "cusip");
    const cusip = cusipRaw === null ? null : cusipRaw.toUpperCase();
    if (nameOfIssuer === null || titleOfClass === null || cusip === null) {
      throw new Error(`13F information table entry is missing identity fields: ${entry.slice(0, 200)}`);
    }
    if (!/^[0-9A-Z]{9}$/.test(cusip)) {
      throw new Error(`13F information table entry has a malformed CUSIP "${cusip}".`);
    }

    const sharesTypeRaw = tagText(entry, "sshPrnamtType");
    const sharesType: "SH" | "PRN" | null =
      sharesTypeRaw === "SH" || sharesTypeRaw === "PRN" ? sharesTypeRaw : null;
    if (sharesType === null) {
      throw new Error(`13F information table entry has an unknown sshPrnamtType "${sharesTypeRaw}".`);
    }

    const putCallRaw = tagText(entry, "putCall");
    const putCall: "Put" | "Call" | null =
      putCallRaw === "Put" || putCallRaw === "Call" ? putCallRaw : null;
    if (putCallRaw !== null && putCall === null) {
      throw new Error(`13F information table entry has an unknown putCall "${putCallRaw}".`);
    }

    return {
      nameOfIssuer,
      titleOfClass,
      cusip,
      reportedValue: parseRequiredNumber(tagText(entry, "value"), "value", entry),
      shares: parseRequiredNumber(tagText(entry, "sshPrnamt"), "sshPrnamt", entry),
      sharesType,
      putCall,
    };
  });

  return { rows };
}

export type ThirteenFAmendmentType = "RESTATEMENT" | "NEW HOLDINGS" | "NOT-AN-AMENDMENT" | "UNSTATED";

export interface ParsedPrimaryDoc {
  periodOfReport: string;
  isAmendment: boolean;
  amendmentType: ThirteenFAmendmentType;
}

function isoFromEdgarDate(raw: string): string {
  const usFormat = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (usFormat !== null) {
    return `${usFormat[3]}-${usFormat[1]}-${usFormat[2]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  throw new Error(`13F primary document has an unrecognized periodOfReport "${raw}".`);
}

export function parsePrimaryDocXml(xml: string): ParsedPrimaryDoc {
  const periodRaw = tagText(xml, "periodOfReport");
  if (periodRaw === null) {
    throw new Error("13F primary document is missing <periodOfReport>.");
  }

  const isAmendmentRaw = tagText(xml, "isAmendment");
  const isAmendment = isAmendmentRaw === "true" || isAmendmentRaw === "1" || isAmendmentRaw === "Y";
  const amendmentTypeRaw = tagText(xml, "amendmentType");

  let amendmentType: ThirteenFAmendmentType;
  if (!isAmendment) {
    amendmentType = "NOT-AN-AMENDMENT";
  } else if (amendmentTypeRaw === "RESTATEMENT" || amendmentTypeRaw === "NEW HOLDINGS") {
    amendmentType = amendmentTypeRaw;
  } else {
    amendmentType = "UNSTATED";
  }

  return {
    periodOfReport: isoFromEdgarDate(periodRaw),
    isAmendment,
    amendmentType,
  };
}

// SEC rule boundary: 13F filings submitted on/after 2023-01-03 report values in
// whole dollars; earlier filings report values rounded to thousands of dollars.
export const THIRTEENF_DOLLAR_UNIT_BOUNDARY_FILING_DATE = "2023-01-03";

export function thirteenFValueUnit(filingDate: string): "dollars" | "thousands" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) {
    throw new Error(`13F value-unit selection needs an ISO filing date, got "${filingDate}".`);
  }
  return filingDate >= THIRTEENF_DOLLAR_UNIT_BOUNDARY_FILING_DATE ? "dollars" : "thousands";
}

export function normalizeReportedValueUsd(reportedValue: number, unit: "dollars" | "thousands"): number {
  return unit === "dollars" ? reportedValue : reportedValue * 1000;
}

export function instrumentKeyFor(row: ParsedInfoTableRow): string {
  const instrument = row.putCall === null ? (row.sharesType === "SH" ? "shares" : "principal") : row.putCall.toLowerCase();
  return `${row.cusip}:${instrument}`;
}

export function instrumentTypeFor(row: ParsedInfoTableRow): "shares" | "principal" | "put" | "call" {
  if (row.putCall === "Put") return "put";
  if (row.putCall === "Call") return "call";
  return row.sharesType === "SH" ? "shares" : "principal";
}
