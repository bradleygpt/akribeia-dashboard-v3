import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  InstitutionalIntelligenceSchema,
  InstitutionalManagerDirectorySchema,
  SecRegistrantCrosswalkSchema,
  ThirteenFSourceReceiptSchema,
  type InstitutionalDelta,
  type InstitutionalIntelligence,
  type InstitutionalManagerPeriod,
  type InstitutionalPosition,
  type InstitutionalStockRollup,
  type ThirteenFSourceReceipt,
} from "@akribeia/contracts";
import {
  instrumentKeyFor,
  instrumentTypeFor,
  normalizeReportedValueUsd,
  parseInfoTableXml,
  parsePrimaryDocXml,
  thirteenFValueUnit,
  type ThirteenFAmendmentType,
} from "./thirteenf-parse.js";

export const INSTITUTIONAL_DISPLAY_CAPS = {
  positionsPerManager: 50,
  deltasPerManager: 60,
} as const;

export interface GenerateInstitutionalIntelligenceOptions {
  directoryPath: string;
  receiptPath: string;
  registrantCrosswalkPath: string;
  activeSecurityExclusions: ReadonlySet<string>;
  generatedAt: string;
}

function normalizeIssuerName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|PLC|LTD|LP|LLC|SA|NV|HOLDINGS|HLDGS|GROUP|GRP|TRUST|THE|NEW|DEL|COM)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IdentityIndex {
  byNormalizedTitle: Map<string, { ticker: string; secTitle: string } | "ambiguous">;
  tickerToTitle: Map<string, string>;
}

function buildIdentityIndex(
  crosswalkMatches: Array<{ ticker: string; secTitle: string | null; sourceType: string }>,
): IdentityIndex {
  const byNormalizedTitle = new Map<string, { ticker: string; secTitle: string } | "ambiguous">();
  const tickerToTitle = new Map<string, string>();
  for (const match of crosswalkMatches) {
    if (match.sourceType !== "company-ticker" || match.secTitle === null) {
      continue;
    }
    tickerToTitle.set(match.ticker, match.secTitle);
    const normalized = normalizeIssuerName(match.secTitle);
    if (normalized.length === 0) {
      continue;
    }
    const existing = byNormalizedTitle.get(normalized);
    if (existing === undefined) {
      byNormalizedTitle.set(normalized, { ticker: match.ticker, secTitle: match.secTitle });
    } else if (existing !== "ambiguous" && existing.ticker !== match.ticker) {
      byNormalizedTitle.set(normalized, "ambiguous");
    }
  }
  return { byNormalizedTitle, tickerToTitle };
}

interface FilingRows {
  accessionNumber: string;
  form: "13F-HR" | "13F-HR/A";
  filingDate: string;
  amendmentType: ThirteenFAmendmentType;
  valueUnit: "dollars" | "thousands";
  positions: Map<string, InstitutionalPosition>;
}

export interface EffectivePeriodResult {
  effectiveState: "usable" | "indeterminate-amendment";
  amendmentsSuperseding: number;
  contributing: Set<string>;
  positions: Map<string, InstitutionalPosition>;
}

export function computeEffectivePeriod(filings: FilingRows[]): EffectivePeriodResult {
  const ordered = filings
    .slice()
    .sort(
      (left, right) =>
        left.filingDate.localeCompare(right.filingDate) ||
        left.accessionNumber.localeCompare(right.accessionNumber),
    );

  let effective: Map<string, InstitutionalPosition> | null = null;
  let effectiveState: "usable" | "indeterminate-amendment" = "usable";
  let amendmentsSuperseding = 0;
  const contributing = new Set<string>();

  for (const filing of ordered) {
    if (filing.amendmentType === "NOT-AN-AMENDMENT" || filing.amendmentType === "RESTATEMENT") {
      if (effective !== null && filing.amendmentType === "RESTATEMENT") {
        amendmentsSuperseding += 1;
      }
      effective = new Map(filing.positions);
      contributing.clear();
      contributing.add(filing.accessionNumber);
      continue;
    }

    if (filing.amendmentType === "NEW HOLDINGS") {
      if (effective === null) {
        // A supplemental amendment without its base filing cannot form a
        // complete holdings set.
        effectiveState = "indeterminate-amendment";
        effective = new Map(filing.positions);
        contributing.add(filing.accessionNumber);
        continue;
      }
      for (const [key, position] of filing.positions) {
        if (effective.has(key)) {
          // A NEW HOLDINGS amendment restating an existing instrument is
          // ambiguous between supplement and correction. Fail closed.
          effectiveState = "indeterminate-amendment";
        }
        effective.set(key, position);
      }
      contributing.add(filing.accessionNumber);
      continue;
    }

    // UNSTATED amendment type: replacement vs. supplement is unknowable.
    effectiveState = "indeterminate-amendment";
    effective = effective ?? new Map(filing.positions);
    contributing.add(filing.accessionNumber);
  }

  return {
    effectiveState,
    amendmentsSuperseding,
    contributing,
    positions: effective ?? new Map(),
  };
}

export function classifyDelta(
  prior: InstitutionalPosition | undefined,
  current: InstitutionalPosition | undefined,
): "NEW" | "INCREASED" | "REDUCED" | "EXITED" | "UNCHANGED" {
  if (prior === undefined && current !== undefined) return "NEW";
  if (prior !== undefined && current === undefined) return "EXITED";
  if (prior === undefined || current === undefined) {
    throw new Error("A delta needs at least one side.");
  }
  if (current.shares > prior.shares) return "INCREASED";
  if (current.shares < prior.shares) return "REDUCED";
  return "UNCHANGED";
}

function concentrationPct(positions: InstitutionalPosition[], top: number): number | null {
  const total = positions.reduce((sum, { valueUsd }) => sum + valueUsd, 0);
  if (total <= 0) {
    return null;
  }
  const topValue = positions
    .slice()
    .sort((left, right) => right.valueUsd - left.valueUsd)
    .slice(0, top)
    .reduce((sum, { valueUsd }) => sum + valueUsd, 0);
  return Math.min(100, (topValue / total) * 100);
}

export async function generateInstitutionalIntelligence(
  options: GenerateInstitutionalIntelligenceOptions,
): Promise<InstitutionalIntelligence> {
  const directory = InstitutionalManagerDirectorySchema.parse(
    JSON.parse(await readFile(resolve(options.directoryPath), "utf8")),
  );
  const receiptBytes = await readFile(resolve(options.receiptPath));
  const receipt: ThirteenFSourceReceipt = ThirteenFSourceReceiptSchema.parse(
    JSON.parse(receiptBytes.toString("utf8")),
  );
  const crosswalk = SecRegistrantCrosswalkSchema.parse(
    JSON.parse(await readFile(resolve(options.registrantCrosswalkPath), "utf8")),
  );
  const identity = buildIdentityIndex(crosswalk.matches);

  const directoryCiks = new Map(directory.managers.map((manager) => [manager.cik, manager]));
  const coverage = {
    filingsProcessed: 0,
    amendmentsProcessed: 0,
    amendmentsSuperseding: 0,
    duplicateAccessionsRejected: 0,
    positionRowsParsed: 0,
  };
  const instrumentIdentity = new Map<string, InstitutionalPosition["identity"]>();

  const filingsByManagerPeriod = new Map<string, Map<string, FilingRows[]>>();
  const filerNames = new Map<string, string>();
  const seenAccessions = new Set<string>();

  for (const filing of receipt.filings) {
    if (!directoryCiks.has(filing.cik)) {
      throw new Error(`13F receipt contains CIK ${filing.cik} not present in the directory.`);
    }
    if (seenAccessions.has(filing.accessionNumber)) {
      coverage.duplicateAccessionsRejected += 1;
      continue;
    }
    seenAccessions.add(filing.accessionNumber);
    coverage.filingsProcessed += 1;

    const primaryDocument = filing.documents.find(({ role }) => role === "primary-document");
    const infoTable = filing.documents.find(({ role }) => role === "information-table");
    if (primaryDocument === undefined || infoTable === undefined) {
      throw new Error(`13F receipt filing ${filing.accessionNumber} is missing documents.`);
    }

    const primaryXml = await readFile(resolve(primaryDocument.path), "utf8");
    const parsedPrimary = parsePrimaryDocXml(primaryXml);
    if (parsedPrimary.periodOfReport !== filing.periodOfReport) {
      throw new Error(
        `13F filing ${filing.accessionNumber} period mismatch between receipt and primary document.`,
      );
    }
    const filerNameMatch = /<(?:[A-Za-z0-9]+:)?name>([^<]+)<\/(?:[A-Za-z0-9]+:)?name>/.exec(primaryXml);
    if (filerNameMatch !== null && !filerNames.has(filing.cik)) {
      filerNames.set(filing.cik, filerNameMatch[1].trim());
    }
    if (filing.form === "13F-HR/A") {
      coverage.amendmentsProcessed += 1;
    }

    const infoTableXml = await readFile(resolve(infoTable.path), "utf8");
    const parsedTable = parseInfoTableXml(infoTableXml);
    coverage.positionRowsParsed += parsedTable.rows.length;
    const valueUnit = thirteenFValueUnit(filing.filingDate);

    const positions = new Map<string, InstitutionalPosition>();
    for (const row of parsedTable.rows) {
      const key = instrumentKeyFor(row);
      const instrumentType = instrumentTypeFor(row);
      let resolvedIdentity: InstitutionalPosition["identity"] = {
        status: "unresolved",
        ticker: null,
        method: "none",
      };
      const normalized = normalizeIssuerName(row.nameOfIssuer);
      const match = identity.byNormalizedTitle.get(normalized);
      if (match !== undefined && match !== "ambiguous") {
        resolvedIdentity = options.activeSecurityExclusions.has(match.ticker)
          ? { status: "excluded-contaminated", ticker: null, method: "registrant-title-exact" }
          : { status: "resolved", ticker: match.ticker, method: "registrant-title-exact" };
      }
      instrumentIdentity.set(key, resolvedIdentity);

      const existing = positions.get(key);
      const valueUsd = normalizeReportedValueUsd(row.reportedValue, valueUnit);
      if (existing === undefined) {
        positions.set(key, {
          instrumentKey: key,
          cusip: row.cusip,
          nameOfIssuer: row.nameOfIssuer,
          titleOfClass: row.titleOfClass,
          instrumentType,
          shares: row.shares,
          valueUsd,
          identity: resolvedIdentity,
        });
      } else {
        // Multiple rows for one instrument within a filing (e.g. split by
        // discretion or manager) aggregate into one holding.
        positions.set(key, {
          ...existing,
          shares: existing.shares + row.shares,
          valueUsd: existing.valueUsd + valueUsd,
        });
      }
    }

    const byPeriod = filingsByManagerPeriod.get(filing.cik) ?? new Map<string, FilingRows[]>();
    const periodFilings = byPeriod.get(filing.periodOfReport) ?? [];
    periodFilings.push({
      accessionNumber: filing.accessionNumber,
      form: filing.form,
      filingDate: filing.filingDate,
      amendmentType: parsedPrimary.amendmentType,
      valueUnit,
      positions,
    });
    byPeriod.set(filing.periodOfReport, periodFilings);
    filingsByManagerPeriod.set(filing.cik, byPeriod);
  }

  const managers: InstitutionalIntelligence["managers"] = [];
  const latestUsableByManager = new Map<
    string,
    { period: string; positions: Map<string, InstitutionalPosition>; totalValueUsd: number }
  >();
  const latestDeltaByManagerInstrument = new Map<string, Map<string, InstitutionalDelta>>();
  const managerDeltaStates = new Map<string, "computed" | "insufficient-history" | "indeterminate-amendment">();

  for (const managerConfig of [...directory.managers].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const byPeriod = filingsByManagerPeriod.get(managerConfig.cik);
    if (byPeriod === undefined) {
      throw new Error(`Directory manager ${managerConfig.name} has no captured filings.`);
    }

    const periods: InstitutionalManagerPeriod[] = [];
    const effectiveByPeriod = new Map<string, EffectivePeriodResult>();
    for (const [periodOfReport, filings] of [...byPeriod.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const effective = computeEffectivePeriod(filings);
      coverage.amendmentsSuperseding += effective.amendmentsSuperseding;
      effectiveByPeriod.set(periodOfReport, effective);

      const allPositions = [...effective.positions.values()].sort(
        (left, right) =>
          right.valueUsd - left.valueUsd || left.instrumentKey.localeCompare(right.instrumentKey),
      );
      const displayed = allPositions.slice(0, INSTITUTIONAL_DISPLAY_CAPS.positionsPerManager);
      const totalValueUsd = allPositions.reduce((sum, { valueUsd }) => sum + valueUsd, 0);

      periods.push({
        periodOfReport,
        effectiveState: effective.effectiveState,
        filings: filings
          .slice()
          .sort(
            (left, right) =>
              left.filingDate.localeCompare(right.filingDate) ||
              left.accessionNumber.localeCompare(right.accessionNumber),
          )
          .map((filing) => ({
            accessionNumber: filing.accessionNumber,
            form: filing.form,
            filingDate: filing.filingDate,
            amendmentType: filing.amendmentType,
            valueUnit: filing.valueUnit,
            reportedPositionRows: filing.positions.size,
            contributesToEffectiveSet: effective.contributing.has(filing.accessionNumber),
          })),
        positionCount: allPositions.length,
        displayedPositionCount: displayed.length,
        totalValueUsd,
        topHoldingConcentrationPct: concentrationPct(allPositions, 1),
        top10ConcentrationPct: concentrationPct(allPositions, 10),
        positions: displayed,
      });
    }

    const usablePeriods = periods.filter(({ effectiveState }) => effectiveState === "usable");
    const latestUsable = usablePeriods.at(-1);
    if (latestUsable !== undefined) {
      const effective = effectiveByPeriod.get(latestUsable.periodOfReport);
      latestUsableByManager.set(managerConfig.cik, {
        period: latestUsable.periodOfReport,
        positions: effective?.positions ?? new Map(),
        totalValueUsd: latestUsable.totalValueUsd,
      });
    }

    let deltas: InstitutionalIntelligence["managers"][number]["deltas"] = null;
    const latestTwoPeriods = periods.slice(-2);
    if (periods.length >= 2) {
      const [fromPeriodRecord, toPeriodRecord] = latestTwoPeriods;
      if (
        fromPeriodRecord.effectiveState !== "usable" ||
        toPeriodRecord.effectiveState !== "usable"
      ) {
        managerDeltaStates.set(managerConfig.cik, "indeterminate-amendment");
        deltas = {
          fromPeriod: fromPeriodRecord.periodOfReport,
          toPeriod: toPeriodRecord.periodOfReport,
          state: "indeterminate-amendment",
          entries: [],
          displayedEntryCount: 0,
          totalEntryCount: 0,
        };
      } else {
        const prior = effectiveByPeriod.get(fromPeriodRecord.periodOfReport)?.positions ?? new Map();
        const current = effectiveByPeriod.get(toPeriodRecord.periodOfReport)?.positions ?? new Map();
        const keys = [...new Set([...prior.keys(), ...current.keys()])].sort((left, right) =>
          left.localeCompare(right),
        );
        const entries: InstitutionalDelta[] = keys.map((key) => {
          const priorPosition = prior.get(key);
          const currentPosition = current.get(key);
          const source = (currentPosition ?? priorPosition) as InstitutionalPosition;
          const classification = classifyDelta(priorPosition, currentPosition);
          const priorShares = priorPosition?.shares ?? null;
          const currentShares = currentPosition?.shares ?? null;
          return {
            instrumentKey: key,
            cusip: source.cusip,
            nameOfIssuer: source.nameOfIssuer,
            instrumentType: source.instrumentType,
            classification,
            priorShares,
            currentShares,
            shareChange:
              priorShares === null || currentShares === null ? null : currentShares - priorShares,
            shareChangePct:
              priorShares === null || currentShares === null || priorShares === 0
                ? null
                : ((currentShares - priorShares) / priorShares) * 100,
            priorValueUsd: priorPosition?.valueUsd ?? null,
            currentValueUsd: currentPosition?.valueUsd ?? null,
            identityTicker:
              instrumentIdentity.get(key)?.status === "resolved"
                ? (instrumentIdentity.get(key)?.ticker ?? null)
                : null,
          };
        });

        const instrumentDeltas = new Map(entries.map((entry) => [entry.instrumentKey, entry]));
        latestDeltaByManagerInstrument.set(managerConfig.cik, instrumentDeltas);
        managerDeltaStates.set(managerConfig.cik, "computed");

        const displayedEntries = entries
          .filter(({ classification }) => classification !== "UNCHANGED")
          .sort((left, right) => {
            const leftMagnitude = Math.abs((left.currentValueUsd ?? 0) - (left.priorValueUsd ?? 0));
            const rightMagnitude = Math.abs((right.currentValueUsd ?? 0) - (right.priorValueUsd ?? 0));
            return rightMagnitude - leftMagnitude || left.instrumentKey.localeCompare(right.instrumentKey);
          })
          .slice(0, INSTITUTIONAL_DISPLAY_CAPS.deltasPerManager);

        deltas = {
          fromPeriod: fromPeriodRecord.periodOfReport,
          toPeriod: toPeriodRecord.periodOfReport,
          state: "computed",
          entries: displayedEntries,
          displayedEntryCount: displayedEntries.length,
          totalEntryCount: entries.length,
        };
      }
    } else {
      managerDeltaStates.set(managerConfig.cik, "insufficient-history");
    }

    managers.push({
      cik: managerConfig.cik,
      name: managerConfig.name,
      category: managerConfig.category,
      ...(managerConfig.note === undefined ? {} : { note: managerConfig.note }),
      filerNameFromSec: filerNames.get(managerConfig.cik) ?? managerConfig.name,
      periods,
      deltas,
    });
  }

  const rollupsByTicker = new Map<string, InstitutionalStockRollup>();
  for (const manager of managers) {
    const latest = latestUsableByManager.get(manager.cik);
    if (latest === undefined) {
      continue;
    }
    const deltaState = managerDeltaStates.get(manager.cik);
    const instrumentDeltas = latestDeltaByManagerInstrument.get(manager.cik);
    for (const position of latest.positions.values()) {
      if (position.instrumentType !== "shares" || position.identity.status !== "resolved") {
        continue;
      }
      const ticker = position.identity.ticker as string;
      const secTitle = identity.tickerToTitle.get(ticker) ?? position.nameOfIssuer;
      const latestClassification =
        deltaState === "computed"
          ? (instrumentDeltas?.get(position.instrumentKey)?.classification ?? "NEW")
          : null;
      const holder = {
        cik: manager.cik,
        managerName: manager.name,
        valueUsd: position.valueUsd,
        shares: position.shares,
        portfolioWeightPct:
          latest.totalValueUsd > 0
            ? Math.min(100, (position.valueUsd / latest.totalValueUsd) * 100)
            : null,
        latestClassification,
      };
      const existing = rollupsByTicker.get(ticker);
      if (existing === undefined) {
        rollupsByTicker.set(ticker, {
          ticker,
          secTitle,
          holderCount: 1,
          holders: [holder],
          aggregateValueUsd: position.valueUsd,
          directionOfTravel: {
            added: latestClassification === "NEW" ? 1 : 0,
            increased: latestClassification === "INCREASED" ? 1 : 0,
            reduced: latestClassification === "REDUCED" ? 1 : 0,
            exited: 0,
            unchanged: latestClassification === "UNCHANGED" ? 1 : 0,
            withoutHistory: latestClassification === null ? 1 : 0,
          },
        });
      } else {
        existing.holders.push(holder);
        existing.holderCount += 1;
        existing.aggregateValueUsd += position.valueUsd;
        if (latestClassification === null) existing.directionOfTravel.withoutHistory += 1;
        else if (latestClassification === "NEW") existing.directionOfTravel.added += 1;
        else if (latestClassification === "INCREASED") existing.directionOfTravel.increased += 1;
        else if (latestClassification === "REDUCED") existing.directionOfTravel.reduced += 1;
        else existing.directionOfTravel.unchanged += 1;
      }
    }
  }
  for (const [cik, instrumentDeltas] of latestDeltaByManagerInstrument) {
    const manager = managers.find((candidate) => candidate.cik === cik);
    for (const delta of instrumentDeltas.values()) {
      if (delta.classification !== "EXITED" || delta.identityTicker === null) {
        continue;
      }
      const rollup = rollupsByTicker.get(delta.identityTicker);
      if (rollup !== undefined && manager !== undefined) {
        rollup.directionOfTravel.exited += 1;
      }
    }
  }

  const stockRollups = [...rollupsByTicker.values()]
    .map((rollup) => ({
      ...rollup,
      holders: rollup.holders
        .slice()
        .sort((left, right) => right.valueUsd - left.valueUsd || left.cik.localeCompare(right.cik)),
    }))
    .sort(
      (left, right) =>
        right.aggregateValueUsd - left.aggregateValueUsd || left.ticker.localeCompare(right.ticker),
    );

  const identityStatuses = [...instrumentIdentity.values()];
  const artifact: InstitutionalIntelligence = {
    artifactSchemaVersion: "1.0.0",
    generatedAt: options.generatedAt,
    sourceReceipt: {
      path: options.receiptPath.replaceAll("\\", "/"),
      sha256: createHash("sha256").update(receiptBytes).digest("hex"),
      snapshotId: receipt.snapshotId,
    },
    valueUnitPolicy:
      "filing-date-2023-01-03-boundary: filings dated on/after 2023-01-03 report whole dollars; earlier filings report thousands and are normalized by 1000",
    reportingLagPolicy:
      "13F filings are due up to 45 days after quarter end and describe quarter-end long positions only; they are never current positioning",
    displayCaps: { ...INSTITUTIONAL_DISPLAY_CAPS },
    coverage: {
      managerCount: managers.length,
      filingsProcessed: coverage.filingsProcessed,
      amendmentsProcessed: coverage.amendmentsProcessed,
      amendmentsSuperseding: coverage.amendmentsSuperseding,
      duplicateAccessionsRejected: coverage.duplicateAccessionsRejected,
      positionRowsParsed: coverage.positionRowsParsed,
      uniqueInstruments: instrumentIdentity.size,
      resolvedInstruments: identityStatuses.filter(({ status }) => status === "resolved").length,
      unresolvedInstruments: identityStatuses.filter(({ status }) => status === "unresolved").length,
      excludedContaminatedInstruments: identityStatuses.filter(
        ({ status }) => status === "excluded-contaminated",
      ).length,
    },
    managers,
    stockRollups,
  };

  return InstitutionalIntelligenceSchema.parse(artifact);
}
