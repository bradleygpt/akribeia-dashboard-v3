export type SortDirection = "ascending" | "descending";

export function compareNullable(
  left: string | number | null,
  right: string | number | null,
  direction: SortDirection,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en-US", {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "ascending" ? comparison : -comparison;
}

export function exactDateWithinRange(
  exactDate: string | null,
  startDate: string,
  endDate: string,
): boolean {
  if (!startDate && !endDate) return true;
  if (!exactDate) return false;
  if (startDate && exactDate < startDate) return false;
  if (endDate && exactDate > endDate) return false;
  return true;
}
