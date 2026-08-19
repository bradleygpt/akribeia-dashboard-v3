"use client";

import { useMemo, useState } from "react";
import {
  CLASSIFICATION_LABELS,
  formatUsdCompact,
  institutionalIntelligence,
  latestFilingDate,
  latestUsablePeriod,
  reportingLagDays,
  type InstitutionalManagerView,
  type InstitutionalRollupView,
} from "./institutional-data";

type ManagerSort =
  | "name-asc"
  | "name-desc"
  | "value-asc"
  | "value-desc"
  | "positions-asc"
  | "positions-desc"
  | "concentration-asc"
  | "concentration-desc";

type RollupSort =
  "ticker-asc" | "ticker-desc" | "holders-asc" | "holders-desc" | "value-asc" | "value-desc";

function SortHeader<Sort extends string>({
  column,
  label,
  sort,
  onSort,
}: {
  column: string;
  label: string;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const ascending = `${column}-asc` as Sort;
  const descending = `${column}-desc` as Sort;
  const active = sort === ascending || sort === descending;
  const direction = !active ? "none" : sort === ascending ? "ascending" : "descending";
  return (
    <th scope="col" aria-sort={direction}>
      <button
        type="button"
        className="table-sort-button"
        onClick={() => onSort(sort === descending ? ascending : descending)}
      >
        {label}
        <span aria-hidden="true">{!active ? "↕" : sort === ascending ? "↑" : "↓"}</span>
      </button>
    </th>
  );
}

function directionSummary(manager: InstitutionalManagerView): string {
  if (manager.deltas === null) return "First captured quarter";
  if (manager.deltas.state === "indeterminate-amendment") return "Indeterminate (amendment)";
  if (manager.deltas.state === "insufficient-history") return "First captured quarter";
  const counts = { NEW: 0, INCREASED: 0, REDUCED: 0, EXITED: 0, UNCHANGED: 0 };
  for (const entry of manager.deltas.entries) {
    counts[entry.classification] += 1;
  }
  return `+${counts.NEW} new · ${counts.INCREASED} up · ${counts.REDUCED} down · ${counts.EXITED} exits`;
}

export function InstitutionalWorkbench() {
  const artifact = institutionalIntelligence;
  const [managerSort, setManagerSort] = useState<ManagerSort>("value-desc");
  const [rollupSort, setRollupSort] = useState<RollupSort>("value-desc");
  const [rollupLimit, setRollupLimit] = useState(25);

  const managers = useMemo(() => {
    const rows = artifact.managers.map((manager) => {
      const period = latestUsablePeriod(manager);
      return {
        manager,
        period,
        filingDate: latestFilingDate(manager),
        totalValueUsd: period?.totalValueUsd ?? 0,
        positionCount: period?.positionCount ?? 0,
        concentration: period?.top10ConcentrationPct ?? null,
      };
    });
    const [column, direction] = managerSort.split("-") as [string, "asc" | "desc"];
    const sign = direction === "asc" ? 1 : -1;
    return rows.sort((left, right) => {
      if (column === "name") return sign * left.manager.name.localeCompare(right.manager.name);
      if (column === "positions") return sign * (left.positionCount - right.positionCount);
      if (column === "concentration")
        return sign * ((left.concentration ?? -1) - (right.concentration ?? -1));
      return sign * (left.totalValueUsd - right.totalValueUsd);
    });
  }, [artifact, managerSort]);

  const rollups = useMemo(() => {
    const [column, direction] = rollupSort.split("-") as [string, "asc" | "desc"];
    const sign = direction === "asc" ? 1 : -1;
    return artifact.stockRollups
      .slice()
      .sort((left: InstitutionalRollupView, right: InstitutionalRollupView) => {
        if (column === "ticker") return sign * left.ticker.localeCompare(right.ticker);
        if (column === "holders") return sign * (left.holderCount - right.holderCount);
        return sign * (left.aggregateValueUsd - right.aggregateValueUsd);
      });
  }, [artifact, rollupSort]);

  return (
    <>
      <section className="institutional-coverage" aria-label="Coverage and provenance">
        <div className="institutional-coverage-grid">
          <div>
            <p className="mono-label">TRACKED MANAGERS</p>
            <strong>{artifact.coverage.managerCount}</strong>
          </div>
          <div>
            <p className="mono-label">FILINGS PROCESSED</p>
            <strong>{artifact.coverage.filingsProcessed}</strong>
          </div>
          <div>
            <p className="mono-label">POSITION ROWS</p>
            <strong>{artifact.coverage.positionRowsParsed.toLocaleString("en-US")}</strong>
          </div>
          <div>
            <p className="mono-label">INSTRUMENTS RESOLVED</p>
            <strong>
              {artifact.coverage.resolvedInstruments} / {artifact.coverage.uniqueInstruments}
            </strong>
          </div>
          <div>
            <p className="mono-label">UNRESOLVED (SHOWN, NEVER GUESSED)</p>
            <strong>{artifact.coverage.unresolvedInstruments}</strong>
          </div>
          <div>
            <p className="mono-label">AMENDMENTS SUPERSEDED</p>
            <strong>
              {artifact.coverage.amendmentsSuperseding} / {artifact.coverage.amendmentsProcessed}
            </strong>
          </div>
        </div>
        <p className="institutional-provenance">
          Source snapshot {artifact.sourceReceipt.snapshotId} · SEC EDGAR 13F filings with SHA-256
          receipts · identities resolved only by exact registrant-title match against the dashboard
          universe; everything else stays visibly unresolved.
        </p>
      </section>

      <section aria-label="Manager directory">
        <h2 className="institutional-section-title">Manager directory</h2>
        <div className="research-table-scroll">
          <table className="research-table institutional-table">
            <thead>
              <tr>
                <SortHeader
                  column="name"
                  label="Manager"
                  sort={managerSort}
                  onSort={setManagerSort}
                />
                <th scope="col">Category</th>
                <th scope="col">Period / filed</th>
                <SortHeader
                  column="positions"
                  label="Positions"
                  sort={managerSort}
                  onSort={setManagerSort}
                />
                <SortHeader
                  column="value"
                  label="Reported value"
                  sort={managerSort}
                  onSort={setManagerSort}
                />
                <SortHeader
                  column="concentration"
                  label="Top-10 weight"
                  sort={managerSort}
                  onSort={setManagerSort}
                />
                <th scope="col">Quarter shifts</th>
              </tr>
            </thead>
            <tbody>
              {managers.map(({ manager, period, filingDate, concentration }) => (
                <tr key={manager.cik}>
                  <td>
                    <a
                      href={`/institutional/${manager.cik}`}
                      className="institutional-manager-link"
                    >
                      {manager.name}
                    </a>
                    {period?.effectiveState === "indeterminate-amendment" ? (
                      <span className="state-chip state-chip-warn">Indeterminate</span>
                    ) : null}
                  </td>
                  <td className="institutional-category">{manager.category}</td>
                  <td>
                    {period === null ? (
                      "No usable period"
                    ) : (
                      <>
                        {period.periodOfReport}
                        <span className="institutional-lag">
                          filed {filingDate ?? "unknown"}
                          {filingDate === null
                            ? ""
                            : ` (+${reportingLagDays(period.periodOfReport, filingDate)}d)`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="numeric">{period?.positionCount ?? 0}</td>
                  <td className="numeric">{formatUsdCompact(period?.totalValueUsd ?? null)}</td>
                  <td className="numeric">
                    {concentration === null ? "—" : `${concentration.toFixed(1)}%`}
                  </td>
                  <td className="institutional-shifts">{directionSummary(manager)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Stock-level positioning">
        <h2 className="institutional-section-title">
          Stock positioning across tracked managers
          <span className="institutional-subnote">
            {artifact.stockRollups.length} dashboard-universe stocks held by at least one tracked
            manager
          </span>
        </h2>
        <div className="research-table-scroll">
          <table className="research-table institutional-table">
            <thead>
              <tr>
                <SortHeader
                  column="ticker"
                  label="Ticker"
                  sort={rollupSort}
                  onSort={setRollupSort}
                />
                <th scope="col">Registrant</th>
                <SortHeader
                  column="holders"
                  label="Holders"
                  sort={rollupSort}
                  onSort={setRollupSort}
                />
                <SortHeader
                  column="value"
                  label="Aggregate value"
                  sort={rollupSort}
                  onSort={setRollupSort}
                />
                <th scope="col">Direction of travel (QoQ)</th>
              </tr>
            </thead>
            <tbody>
              {rollups.slice(0, rollupLimit).map((rollup) => (
                <tr key={rollup.ticker}>
                  <td>
                    <a href={`/research/${rollup.ticker}`} className="institutional-manager-link">
                      {rollup.ticker}
                    </a>
                  </td>
                  <td>{rollup.secTitle}</td>
                  <td className="numeric">{rollup.holderCount}</td>
                  <td className="numeric">{formatUsdCompact(rollup.aggregateValueUsd)}</td>
                  <td className="institutional-shifts">
                    {rollup.directionOfTravel.added > 0
                      ? `+${rollup.directionOfTravel.added} new · `
                      : ""}
                    {rollup.directionOfTravel.increased} up · {rollup.directionOfTravel.reduced}{" "}
                    down
                    {rollup.directionOfTravel.exited > 0
                      ? ` · ${rollup.directionOfTravel.exited} exits`
                      : ""}
                    {rollup.directionOfTravel.withoutHistory > 0
                      ? ` · ${rollup.directionOfTravel.withoutHistory} first-quarter`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rollupLimit < rollups.length ? (
          <button
            type="button"
            className="institutional-show-more"
            onClick={() => setRollupLimit((limit) => limit + 50)}
          >
            Show more ({rollups.length - rollupLimit} remaining)
          </button>
        ) : null}
      </section>
    </>
  );
}

export const CLASSIFICATION_LABELS_EXPORT = CLASSIFICATION_LABELS;
