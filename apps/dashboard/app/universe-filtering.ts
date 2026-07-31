import type { UniverseDisplayRow } from "./v2-universe";

export type UniverseSort = "score-desc" | "market-cap-desc" | "ticker-asc" | "name-asc";

export interface UniverseFilter {
  query: string;
  sector: string;
  sort: UniverseSort;
}

function descendingNullable(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

export function filterUniverseRows(
  rows: readonly UniverseDisplayRow[],
  filter: UniverseFilter,
): UniverseDisplayRow[] {
  const query = filter.query.trim().toLocaleLowerCase("en-US");
  const filtered = rows.filter((row) => {
    const matchesSector = filter.sector === "all" || row.sector === filter.sector;
    const matchesQuery =
      query.length === 0 ||
      row.ticker.toLocaleLowerCase("en-US").includes(query) ||
      row.name.toLocaleLowerCase("en-US").includes(query) ||
      row.industry.toLocaleLowerCase("en-US").includes(query);

    return matchesSector && matchesQuery;
  });

  return filtered.toSorted((left, right) => {
    if (filter.sort === "market-cap-desc") {
      return (
        descendingNullable(left.marketCapB, right.marketCapB) ||
        left.ticker.localeCompare(right.ticker)
      );
    }

    if (filter.sort === "ticker-asc") {
      return left.ticker.localeCompare(right.ticker);
    }

    if (filter.sort === "name-asc") {
      return left.name.localeCompare(right.name) || left.ticker.localeCompare(right.ticker);
    }

    return (
      descendingNullable(left.composite, right.composite) || left.ticker.localeCompare(right.ticker)
    );
  });
}
