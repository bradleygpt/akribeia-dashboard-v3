import { describe, expect, it } from "vitest";
import {
  detectThirteenFValueUnit,
  instrumentKeyFor,
  instrumentTypeFor,
  normalizeReportedValueUsd,
  parseInfoTableXml,
  parsePrimaryDocXml,
  thirteenFValueUnit,
  type ParsedInfoTableRow,
} from "@akribeia/evidence";

const INFO_TABLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>915000000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>1000000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
    <votingAuthority><Sole>1000000</Sole><Shared>0</Shared><None>0</None></votingAuthority>
  </infoTable>
  <infoTable>
    <nameOfIssuer>SMITH &amp; WESSON BRANDS INC</nameOfIssuer>
    <titleOfClass>PUT</titleOfClass>
    <cusip>831756101</cusip>
    <value>2500</value>
    <shrsOrPrnAmt>
      <sshPrnamt>5000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
    <putCall>Put</putCall>
  </infoTable>
</informationTable>`;

const NAMESPACED_INFO_TABLE_XML = `<?xml version="1.0"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>MICRON TECHNOLOGY INC</ns1:nameOfIssuer>
    <ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>595112103</ns1:cusip>
    <ns1:value>4700</ns1:value>
    <ns1:shrsOrPrnAmt>
      <ns1:sshPrnamt>50000</ns1:sshPrnamt>
      <ns1:sshPrnamtType>SH</ns1:sshPrnamtType>
    </ns1:shrsOrPrnAmt>
  </ns1:infoTable>
</ns1:informationTable>`;

describe("13F information table parsing", () => {
  it("parses plain and entity-encoded entries with instrument separation", () => {
    const table = parseInfoTableXml(INFO_TABLE_XML);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      nameOfIssuer: "APPLE INC",
      cusip: "037833100",
      reportedValue: 915000000,
      shares: 1000000,
      sharesType: "SH",
      putCall: null,
    });
    expect(table.rows[1].nameOfIssuer).toBe("SMITH & WESSON BRANDS INC");
    expect(table.rows[1].putCall).toBe("Put");
    expect(instrumentTypeFor(table.rows[0])).toBe("shares");
    expect(instrumentTypeFor(table.rows[1])).toBe("put");
    expect(instrumentKeyFor(table.rows[0])).toBe("037833100:shares");
    expect(instrumentKeyFor(table.rows[1])).toBe("831756101:put");
  });

  it("parses namespace-prefixed documents", () => {
    const table = parseInfoTableXml(NAMESPACED_INFO_TABLE_XML);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cusip).toBe("595112103");
  });

  it("fails closed on missing entries and malformed CUSIPs", () => {
    expect(() => parseInfoTableXml("<informationTable></informationTable>")).toThrow(
      /no infoTable entries/,
    );
    expect(() =>
      parseInfoTableXml(INFO_TABLE_XML.replace("037833100", "BAD")),
    ).toThrow(/malformed CUSIP/);
  });
});

describe("13F primary document parsing", () => {
  const primaryDoc = (body: string): string =>
    `<?xml version="1.0"?><edgarSubmission><headerData></headerData><formData><coverPage>${body}</coverPage></formData></edgarSubmission>`;

  it("reads the reporting period in EDGAR US date format", () => {
    const parsed = parsePrimaryDocXml(
      primaryDoc("<periodOfReport>06-30-2026</periodOfReport><isAmendment>false</isAmendment>"),
    );
    expect(parsed.periodOfReport).toBe("2026-06-30");
    expect(parsed.amendmentType).toBe("NOT-AN-AMENDMENT");
  });

  it("classifies restatement, new-holdings, and unstated amendments", () => {
    expect(
      parsePrimaryDocXml(
        primaryDoc(
          "<periodOfReport>2026-03-31</periodOfReport><isAmendment>true</isAmendment><amendmentInfo><amendmentType>RESTATEMENT</amendmentType></amendmentInfo>",
        ),
      ).amendmentType,
    ).toBe("RESTATEMENT");
    expect(
      parsePrimaryDocXml(
        primaryDoc(
          "<periodOfReport>2026-03-31</periodOfReport><isAmendment>true</isAmendment><amendmentInfo><amendmentType>NEW HOLDINGS</amendmentType></amendmentInfo>",
        ),
      ).amendmentType,
    ).toBe("NEW HOLDINGS");
    expect(
      parsePrimaryDocXml(
        primaryDoc("<periodOfReport>2026-03-31</periodOfReport><isAmendment>true</isAmendment>"),
      ).amendmentType,
    ).toBe("UNSTATED");
  });
});

describe("13F value-unit discipline", () => {
  it("selects the unit from the filing date, never a timeless assumption", () => {
    expect(thirteenFValueUnit("2022-11-14")).toBe("thousands");
    expect(thirteenFValueUnit("2023-01-02")).toBe("thousands");
    expect(thirteenFValueUnit("2023-01-03")).toBe("dollars");
    expect(thirteenFValueUnit("2026-08-14")).toBe("dollars");
    expect(() => thirteenFValueUnit("08/14/2026")).toThrow(/ISO filing date/);
  });

  it("normalizes thousands-era values by exactly 1000", () => {
    expect(normalizeReportedValueUsd(4700, "thousands")).toBe(4700000);
    expect(normalizeReportedValueUsd(915000000, "dollars")).toBe(915000000);
  });

  const row = (reportedValue: number, shares: number): ParsedInfoTableRow => ({
    nameOfIssuer: "TEST",
    titleOfClass: "COM",
    cusip: "123456789",
    reportedValue,
    shares,
    sharesType: "SH",
    putCall: null,
  });

  it("detects legacy thousands reporting after the boundary via implied prices", () => {
    // A real dollar-reported book: implied prices in normal equity territory.
    const dollarBook = [row(915000000, 1000000), row(50000000, 250000), row(9000000, 100000)];
    expect(detectThirteenFValueUnit(dollarBook, "2026-08-14")).toEqual({
      valueUnit: "dollars",
      unitDetection: "filing-date-rule",
    });

    // The same book mis-filed in thousands: implied prices collapse below $2.
    const thousandsBook = [row(915000, 1000000), row(50000, 250000), row(9000, 100000)];
    expect(detectThirteenFValueUnit(thousandsBook, "2026-08-14")).toEqual({
      valueUnit: "thousands",
      unitDetection: "implied-price-correction",
    });

    // Pre-boundary filings are thousands by the date rule alone.
    expect(detectThirteenFValueUnit(dollarBook, "2022-11-14")).toEqual({
      valueUnit: "thousands",
      unitDetection: "filing-date-rule",
    });

    // Too few rows: never guess, keep the date rule.
    expect(detectThirteenFValueUnit([row(915000, 1000000)], "2026-08-14")).toEqual({
      valueUnit: "dollars",
      unitDetection: "filing-date-rule",
    });
  });
});
