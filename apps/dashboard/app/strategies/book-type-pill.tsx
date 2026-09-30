"use client";

// BookTypePill — the truth-in-labeling pill (V2 StrategiesTab.tsx). LIVE =
// broker-confirmed positions; PAPER = signal-derived research book, never
// held at a broker. The book type it renders is always resolved from the
// data layer (system_status / strategy JSON) via resolveBookType — callers
// never hardcode a sleeve's book type.

import type { BookType } from "./strategy-books";
import styles from "./strategies-viz.module.css";

export function BookTypePill({ bookType, asOf }: { bookType: BookType; asOf?: string }) {
  // LIVE is reserved for bookType === "live"; every other branch is explicit, so no value
  // can fall through to the broker-confirmed label. MODEL = a rebalance after Bradley
  // stopped trading (2026-09-21) -- no order placed.
  if (bookType === "model") {
    return (
      <span
        title={`MODEL — what the model would hold; Bradley stopped trading 2026-09-21, no order placed${
          asOf ? ` (as of ${asOf})` : ""
        }`}
        className={styles.pillModel}
      >
        ◇ MODEL · no orders
      </span>
    );
  }
  return bookType === "live" ? (
    <span
      title={`LIVE — broker-confirmed positions${asOf ? ` (as of ${asOf})` : ""}`}
      className={styles.pillLive}
    >
      ● LIVE · broker
    </span>
  ) : (
    <span
      title={`PAPER — signal-derived research book, never held at a broker${
        asOf ? ` (as of ${asOf})` : ""
      }`}
      className={styles.pillPaper}
    >
      ◌ PAPER · research
    </span>
  );
}
