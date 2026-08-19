import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyDelta,
  computeEffectivePeriod,
  generateInstitutionalIntelligence,
} from "@akribeia/evidence";

function position(instrumentKey: string, shares: number, valueUsd: number) {
  return {
    instrumentKey,
    cusip: instrumentKey.slice(0, 9),
    nameOfIssuer: "TEST ISSUER",
    titleOfClass: "COM",
    instrumentType: "shares" as const,
    shares,
    valueUsd,
    identity: { status: "unresolved" as const, ticker: null, method: "none" as const },
  };
}

function filing(
  accessionNumber: string,
  filingDate: string,
  amendmentType: "RESTATEMENT" | "NEW HOLDINGS" | "NOT-AN-AMENDMENT" | "UNSTATED",
  positions: ReturnType<typeof position>[],
) {
  return {
    accessionNumber,
    form: (amendmentType === "NOT-AN-AMENDMENT" ? "13F-HR" : "13F-HR/A") as "13F-HR" | "13F-HR/A",
    filingDate,
    amendmentType,
    valueUnit: "dollars" as const,
    positions: new Map(positions.map((entry) => [entry.instrumentKey, entry])),
  };
}

describe("13F amendment supersedence", () => {
  it("lets a restatement fully replace the original filing", () => {
    const result = computeEffectivePeriod([
      filing("0000000000-26-000001", "2026-08-14", "NOT-AN-AMENDMENT", [
        position("111111111:shares", 100, 1000),
        position("222222222:shares", 50, 500),
      ]),
      filing("0000000000-26-000002", "2026-08-20", "RESTATEMENT", [
        position("111111111:shares", 120, 1200),
      ]),
    ]);
    expect(result.effectiveState).toBe("usable");
    expect(result.amendmentsSuperseding).toBe(1);
    expect([...result.positions.keys()]).toEqual(["111111111:shares"]);
    expect(result.contributing).toEqual(new Set(["0000000000-26-000002"]));
  });

  it("lets a new-holdings amendment supplement without double counting", () => {
    const result = computeEffectivePeriod([
      filing("0000000000-26-000001", "2026-08-14", "NOT-AN-AMENDMENT", [
        position("111111111:shares", 100, 1000),
      ]),
      filing("0000000000-26-000002", "2026-08-20", "NEW HOLDINGS", [
        position("333333333:shares", 10, 90),
      ]),
    ]);
    expect(result.effectiveState).toBe("usable");
    expect(result.positions.size).toBe(2);
    expect(result.contributing.size).toBe(2);
  });

  it("fails closed when a new-holdings amendment collides with an existing instrument", () => {
    const result = computeEffectivePeriod([
      filing("0000000000-26-000001", "2026-08-14", "NOT-AN-AMENDMENT", [
        position("111111111:shares", 100, 1000),
      ]),
      filing("0000000000-26-000002", "2026-08-20", "NEW HOLDINGS", [
        position("111111111:shares", 500, 5000),
      ]),
    ]);
    expect(result.effectiveState).toBe("indeterminate-amendment");
  });

  it("fails closed on unstated amendment types and baseless supplements", () => {
    expect(
      computeEffectivePeriod([
        filing("0000000000-26-000001", "2026-08-14", "NOT-AN-AMENDMENT", [
          position("111111111:shares", 100, 1000),
        ]),
        filing("0000000000-26-000002", "2026-08-20", "UNSTATED", [
          position("222222222:shares", 5, 50),
        ]),
      ]).effectiveState,
    ).toBe("indeterminate-amendment");
    expect(
      computeEffectivePeriod([
        filing("0000000000-26-000002", "2026-08-20", "NEW HOLDINGS", [
          position("222222222:shares", 5, 50),
        ]),
      ]).effectiveState,
    ).toBe("indeterminate-amendment");
  });
});

describe("position delta classification", () => {
  const prior = position("111111111:shares", 100, 1000);
  it("covers all five classes", () => {
    expect(classifyDelta(undefined, prior)).toBe("NEW");
    expect(classifyDelta(prior, undefined)).toBe("EXITED");
    expect(classifyDelta(prior, position("111111111:shares", 150, 1400))).toBe("INCREASED");
    expect(classifyDelta(prior, position("111111111:shares", 60, 640))).toBe("REDUCED");
    expect(classifyDelta(prior, position("111111111:shares", 100, 900))).toBe("UNCHANGED");
  });
});

describe("institutional intelligence generation", () => {
  const scratchRoots: string[] = [];
  afterEach(() => {
    for (const root of scratchRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function sha256(payload: string): string {
    return createHash("sha256").update(payload).digest("hex");
  }

  function infoTableXml(
    rows: Array<{ issuer: string; cusip: string; value: number; shares: number }>,
  ): string {
    const body = rows
      .map(
        (row) => `<infoTable>
  <nameOfIssuer>${row.issuer}</nameOfIssuer>
  <titleOfClass>COM</titleOfClass>
  <cusip>${row.cusip}</cusip>
  <value>${row.value}</value>
  <shrsOrPrnAmt><sshPrnamt>${row.shares}</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
</infoTable>`,
      )
      .join("\n");
    return `<?xml version="1.0"?><informationTable>${body}</informationTable>`;
  }

  function primaryDocXml(period: string, name: string, amendment?: string): string {
    const amendmentBlock =
      amendment === undefined
        ? "<isAmendment>false</isAmendment>"
        : `<isAmendment>true</isAmendment><amendmentInfo><amendmentType>${amendment}</amendmentType></amendmentInfo>`;
    return `<?xml version="1.0"?><edgarSubmission><formData><coverPage><periodOfReport>${period}</periodOfReport>${amendmentBlock}<filingManager><name>${name}</name></filingManager></coverPage></formData></edgarSubmission>`;
  }

  it("produces a reproducible artifact with supersedence, deltas, identity, and caps", async () => {
    const root = mkdtempSync(join(tmpdir(), "akribeia-13f-"));
    scratchRoots.push(root);

    const q1Info = infoTableXml([
      { issuer: "APPLE INC", cusip: "037833100", value: 1000000, shares: 1000 },
      { issuer: "MICRON TECHNOLOGY INC", cusip: "595112103", value: 500000, shares: 500 },
      { issuer: "UTTERLY UNKNOWN HOLDINGS XYZ", cusip: "999999999", value: 200000, shares: 200 },
    ]);
    const q2InfoOriginal = infoTableXml([
      { issuer: "APPLE INC", cusip: "037833100", value: 1500000, shares: 1500 },
      { issuer: "UTTERLY UNKNOWN HOLDINGS XYZ", cusip: "999999999", value: 200000, shares: 200 },
    ]);
    const q2InfoRestated = infoTableXml([
      { issuer: "APPLE INC", cusip: "037833100", value: 1500000, shares: 1500 },
      { issuer: "UTTERLY UNKNOWN HOLDINGS XYZ", cusip: "999999999", value: 100000, shares: 100 },
      { issuer: "BRAND NEW POSITION CORP QQQ", cusip: "888888888", value: 50000, shares: 50 },
    ]);
    const q1Primary = primaryDocXml("03-31-2026", "Test Manager LP");
    const q2Primary = primaryDocXml("06-30-2026", "Test Manager LP");
    const q2PrimaryAmendment = primaryDocXml("06-30-2026", "Test Manager LP", "RESTATEMENT");

    const documents: Array<{ path: string; content: string }> = [
      { path: join(root, "q1-index.json"), content: "{}" },
      { path: join(root, "q1-primary.xml"), content: q1Primary },
      { path: join(root, "q1-infotable.xml"), content: q1Info },
      { path: join(root, "q2-index.json"), content: "{}" },
      { path: join(root, "q2-primary.xml"), content: q2Primary },
      { path: join(root, "q2-infotable.xml"), content: q2InfoOriginal },
      { path: join(root, "q2a-index.json"), content: "{}" },
      { path: join(root, "q2a-primary.xml"), content: q2PrimaryAmendment },
      { path: join(root, "q2a-infotable.xml"), content: q2InfoRestated },
    ];
    for (const document of documents) {
      writeFileSync(document.path, document.content);
    }
    const documentRecord = (role: string, path: string, content: string) => ({
      role,
      uri: `https://www.sec.gov/Archives/edgar/data/999/${role}`,
      path,
      sha256: sha256(content),
      byteSize: Buffer.byteLength(content),
    });

    const receipt = {
      receiptSchemaVersion: "1.0.0",
      snapshotId: "2026-08-18",
      retrievedAt: "2026-08-18T12:00:00.000Z",
      sourcePolicy: {
        provider: "U.S. Securities and Exchange Commission",
        api: "EDGAR Archives",
        access: "public-no-api-key",
        declaredUserAgent: true,
        maxRequestsPerSecond: 10,
      },
      filings: [
        {
          cik: "0009999999",
          accessionNumber: "0000000000-26-000001",
          form: "13F-HR",
          filingDate: "2026-05-15",
          periodOfReport: "2026-03-31",
          documents: [
            documentRecord("filing-index", join(root, "q1-index.json"), "{}"),
            documentRecord("primary-document", join(root, "q1-primary.xml"), q1Primary),
            documentRecord("information-table", join(root, "q1-infotable.xml"), q1Info),
          ],
        },
        {
          cik: "0009999999",
          accessionNumber: "0000000000-26-000002",
          form: "13F-HR",
          filingDate: "2026-08-14",
          periodOfReport: "2026-06-30",
          documents: [
            documentRecord("filing-index", join(root, "q2-index.json"), "{}"),
            documentRecord("primary-document", join(root, "q2-primary.xml"), q2Primary),
            documentRecord("information-table", join(root, "q2-infotable.xml"), q2InfoOriginal),
          ],
        },
        {
          cik: "0009999999",
          accessionNumber: "0000000000-26-000003",
          form: "13F-HR/A",
          filingDate: "2026-08-17",
          periodOfReport: "2026-06-30",
          documents: [
            documentRecord("filing-index", join(root, "q2a-index.json"), "{}"),
            documentRecord("primary-document", join(root, "q2a-primary.xml"), q2PrimaryAmendment),
            documentRecord("information-table", join(root, "q2a-infotable.xml"), q2InfoRestated),
          ],
        },
      ],
    };
    const receiptPath = join(root, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

    const directoryPath = join(root, "managers.json");
    writeFileSync(
      directoryPath,
      JSON.stringify({
        directorySchemaVersion: "1.0.0",
        policy: { selectionBasis: "test", knownExclusions: [] },
        managers: [{ cik: "0009999999", name: "Test Manager", category: "value" }],
      }),
    );

    const generate = () =>
      generateInstitutionalIntelligence({
        directoryPath,
        receiptPath,
        registrantCrosswalkPath: "apps/dashboard/app/generated/active-sec-registrants.json",
        activeSecurityExclusions: new Set(["MCW"]),
        generatedAt: "2026-08-18T12:00:00.000Z",
      });

    const artifact = await generate();
    const artifactAgain = await generate();
    expect(JSON.stringify(artifact)).toBe(JSON.stringify(artifactAgain));

    expect(artifact.coverage.filingsProcessed).toBe(3);
    expect(artifact.coverage.amendmentsProcessed).toBe(1);
    expect(artifact.coverage.amendmentsSuperseding).toBe(1);
    expect(artifact.coverage.duplicateAccessionsRejected).toBe(0);

    const manager = artifact.managers[0];
    expect(manager.filerNameFromSec).toBe("Test Manager LP");
    expect(manager.periods).toHaveLength(2);
    const q2 = manager.periods[1];
    expect(q2.effectiveState).toBe("usable");
    expect(q2.positionCount).toBe(3);
    expect(q2.filings.map(({ contributesToEffectiveSet }) => contributesToEffectiveSet)).toEqual([
      false,
      true,
    ]);

    expect(manager.deltas?.state).toBe("computed");
    const classifications = new Map(
      manager.deltas?.entries.map((entry) => [entry.cusip, entry.classification]),
    );
    expect(classifications.get("037833100")).toBe("INCREASED");
    expect(classifications.get("999999999")).toBe("REDUCED");
    expect(classifications.get("888888888")).toBe("NEW");
    expect(classifications.get("595112103")).toBe("EXITED");
    expect(manager.deltas?.totalEntryCount).toBe(4);

    const appleRollup = artifact.stockRollups.find(({ ticker }) => ticker === "AAPL");
    expect(appleRollup).toBeDefined();
    expect(appleRollup?.holderCount).toBe(1);
    expect(appleRollup?.directionOfTravel.increased).toBe(1);
    expect(artifact.coverage.unresolvedInstruments).toBeGreaterThanOrEqual(2);

    expect(artifact.valueUnitPolicy).toContain("2023-01-03");
    expect(artifact.reportingLagPolicy).toContain("45 days");
  });

  it("marks resolved-but-contaminated identities excluded instead of surfacing them", async () => {
    const root = mkdtempSync(join(tmpdir(), "akribeia-13f-mcw-"));
    scratchRoots.push(root);

    const info = infoTableXml([{ issuer: "APPLE INC", cusip: "037833100", value: 100, shares: 1 }]);
    const primary = primaryDocXml("06-30-2026", "Test Manager LP");
    writeFileSync(join(root, "index.json"), "{}");
    writeFileSync(join(root, "primary.xml"), primary);
    writeFileSync(join(root, "infotable.xml"), info);
    const receipt = {
      receiptSchemaVersion: "1.0.0",
      snapshotId: "2026-08-18",
      retrievedAt: "2026-08-18T12:00:00.000Z",
      sourcePolicy: {
        provider: "U.S. Securities and Exchange Commission",
        api: "EDGAR Archives",
        access: "public-no-api-key",
        declaredUserAgent: true,
        maxRequestsPerSecond: 10,
      },
      filings: [
        {
          cik: "0009999999",
          accessionNumber: "0000000000-26-000009",
          form: "13F-HR",
          filingDate: "2026-08-14",
          periodOfReport: "2026-06-30",
          documents: [
            {
              role: "filing-index",
              uri: "https://www.sec.gov/x",
              path: join(root, "index.json"),
              sha256: sha256("{}"),
              byteSize: 2,
            },
            {
              role: "primary-document",
              uri: "https://www.sec.gov/y",
              path: join(root, "primary.xml"),
              sha256: sha256(primary),
              byteSize: Buffer.byteLength(primary),
            },
            {
              role: "information-table",
              uri: "https://www.sec.gov/z",
              path: join(root, "infotable.xml"),
              sha256: sha256(info),
              byteSize: Buffer.byteLength(info),
            },
          ],
        },
      ],
    };
    writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt));
    writeFileSync(
      join(root, "managers.json"),
      JSON.stringify({
        directorySchemaVersion: "1.0.0",
        policy: { selectionBasis: "test", knownExclusions: [] },
        managers: [{ cik: "0009999999", name: "Test Manager", category: "value" }],
      }),
    );

    const artifact = await generateInstitutionalIntelligence({
      directoryPath: join(root, "managers.json"),
      receiptPath: join(root, "receipt.json"),
      registrantCrosswalkPath: "apps/dashboard/app/generated/active-sec-registrants.json",
      activeSecurityExclusions: new Set(["AAPL"]),
      generatedAt: "2026-08-18T12:00:00.000Z",
    });

    expect(artifact.coverage.excludedContaminatedInstruments).toBe(1);
    expect(artifact.coverage.resolvedInstruments).toBe(0);
    expect(artifact.stockRollups).toHaveLength(0);
    expect(artifact.managers[0].periods[0].positions[0].identity.status).toBe(
      "excluded-contaminated",
    );
    expect(artifact.managers[0].periods[0].positions[0].identity.ticker).toBeNull();
  });
});
