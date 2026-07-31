export function formatMoney(value: number | null, digits = 2): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: digits,
      }).format(value);
}

export function formatMarketCap(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  return `$${value.toFixed(value >= 100 ? 0 : 1)}B`;
}

export function formatPercent(value: number | null, digits = 1, signed = false): string {
  if (value === null) return "Unavailable";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatRatio(value: number | null, digits = 1): string {
  return value === null ? "Unavailable" : `${value.toFixed(digits)}×`;
}
