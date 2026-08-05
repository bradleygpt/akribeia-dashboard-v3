import type { UniverseDisplayRow } from "./v2-universe";

export type UniverseSort =
  | "ticker-asc"
  | "ticker-desc"
  | "name-asc"
  | "name-desc"
  | "sector-asc"
  | "sector-desc"
  | "market-cap-asc"
  | "market-cap-desc"
  | "score-asc"
  | "score-desc"
  | "rating-asc"
  | "rating-desc";

export interface UniverseFilter {
  query: string;
  sector: string;
  sort: UniverseSort;
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

  const separator = filter.sort.lastIndexOf("-");
  const column = filter.sort.slice(0, separator);
  const direction = filter.sort.slice(separator + 1);
  return filtered.toSorted((left, right) => {
    const value = (row: UniverseDisplayRow): string | number | null => {
      if (column === "ticker") return row.ticker;
      if (column === "name") return row.name;
      if (column === "sector") return row.sector;
      if (column === "market-cap") return row.marketCapB;
      if (column === "rating") return row.rating;
      return row.composite;
    };
    const leftValue = value(left);
    const rightValue = value(right);
    if (leftValue === null && rightValue === null) return left.ticker.localeCompare(right.ticker);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const comparison =
      typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "en-US", { sensitivity: "base" });
    return (
      (direction === "asc" ? comparison : -comparison) || left.ticker.localeCompare(right.ticker)
    );
  });
}
