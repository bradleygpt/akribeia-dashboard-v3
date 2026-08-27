"use client";

// Strategy signatures — the owner's approved standalone canvas art pieces
// (akribeia_{katalepsis,kairos,auxo,statera,pronoia} 2026-08 set), one wide
// panorama card per sleeve, stacked full-width in roster order. The draw
// scripts live verbatim in ./signature-cards/*; this section provides the
// Google Fonts links (IBM Plex Mono + EB Garamond, with fallbacks declared in
// the css so the design degrades gracefully), the pinned CAGR / Sharpe header
// stats, and the runtime-derived book chip.
//
// Truth-in-labeling: the chip resolves via resolveBookType (system_status ->
// strategy JSON -> paper) and only falls back to the art file's hardcoded
// label while nothing has loaded; the animations themselves are simulated
// mechanism art and carry their [PH] placeholder captions verbatim.

import { useEffect, useState } from "react";
import { loadReference } from "./reference-client";
import { resolveBookType, useStrategyStatus } from "./strategy-books";
import type { SignatureStats } from "./signature-cards/signature-card";
import { KatalepsisSignature } from "./signature-cards/katalepsis";
import { KairosSignature } from "./signature-cards/kairos";
import { AuxoSignature } from "./signature-cards/auxo";
import { StateraSignature } from "./signature-cards/statera";
import { PronoiaSignature } from "./signature-cards/pronoia";
import cardStyles from "./signature-cards/signature-cards.module.css";
import styles from "./strategies-viz.module.css";

type Kind = "c78q" | "quant";

// Roster order: Katalepsis, Kairos, Auxo, Statera, Pronoia. fallbackChip is
// the source art file's hardcoded label — used only until runtime data lands.
const SLEEVES = [
  { key: "katalepsis", dataset: "c78q", kind: "c78q", fallbackChip: "LIVE" },
  { key: "kairos", dataset: "kairos-strategy", kind: "quant", fallbackChip: "PAPER" },
  { key: "auxo", dataset: "auxo-strategy", kind: "quant", fallbackChip: "PAPER" },
  { key: "statera", dataset: "statera-strategy", kind: "quant", fallbackChip: "PAPER" },
  { key: "pronoia", dataset: "pronoia-strategy", kind: "quant", fallbackChip: "PAPER" },
] as const;

interface SleeveData {
  cagr: number;
  sharpe: number;
  jsonBookType: unknown;
}

type J = Record<string, unknown>;
const obj = (value: unknown): J => (value && typeof value === "object" ? (value as J) : ({} as J));
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : NaN;

// Same pinned fields the previous signatures component read: c78q keeps its
// backtest metrics under metrics.backtest (fractional CAGR), the quant
// sleeves under metrics.in_sample (already in percent).
function extract(kind: Kind, payload: unknown): SleeveData {
  const j = obj(payload);
  if (kind === "c78q") {
    const bt = obj(obj(j.metrics).backtest);
    return {
      cagr: num(bt.net_cagr) * 100,
      sharpe: num(bt.sharpe),
      jsonBookType: obj(j.target).book_type,
    };
  }
  const m = obj(obj(j.metrics).in_sample);
  return {
    cagr: num(m.cagr),
    sharpe: num(m.sharpe),
    jsonBookType: obj(j.current_holdings).book_type,
  };
}

function formatStats(d: SleeveData): SignatureStats {
  return {
    cagr: isNaN(d.cagr) ? "—" : `${d.cagr.toFixed(1)}%`,
    sharpe: isNaN(d.sharpe) ? "—" : d.sharpe.toFixed(2),
  };
}

const CARDS = {
  katalepsis: KatalepsisSignature,
  kairos: KairosSignature,
  auxo: AuxoSignature,
  statera: StateraSignature,
  pronoia: PronoiaSignature,
} as const;

export default function StrategySignatures() {
  const statusMap = useStrategyStatus();
  const [data, setData] = useState<Record<string, SleeveData>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all(
      SLEEVES.map((sleeve) =>
        loadReference<unknown>(sleeve.dataset).then(
          (payload) =>
            [sleeve.key, payload === null ? null : extract(sleeve.kind, payload)] as const,
        ),
      ),
    ).then((pairs) => {
      if (!mounted) return;
      const next: Record<string, SleeveData> = {};
      pairs.forEach(([key, d]) => {
        if (d) next[key] = d;
      });
      setData(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="parity-section">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital@1&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
        precedence="default"
      />
      <div className="research-subheading">
        <div>
          <p className="mono-label">STRATEGY SIGNATURES / GOVERNED ROSTER</p>
          <h2>Strategy signatures</h2>
        </div>
        <span>Each sleeve&apos;s approved signature animation — how it actually decides</span>
      </div>
      <p className={styles.vizSub}>
        Mechanism art with simulated streams (marked [PH] in each caption — no holdings shown).
        Header CAGR &amp; Sharpe come from the pinned strategy references and are backtest research
        records, not forward guarantees.
      </p>
      <div className={cardStyles.stack}>
        {SLEEVES.map((sleeve) => {
          const Card = CARDS[sleeve.key];
          const d = data[sleeve.key];
          const statusEntry = statusMap[sleeve.key];
          const hasRuntimeBook =
            statusEntry?.book_type === "live" ||
            statusEntry?.book_type === "paper" ||
            d?.jsonBookType === "live" ||
            d?.jsonBookType === "paper";
          const chipLabel = hasRuntimeBook
            ? resolveBookType(statusEntry, d?.jsonBookType).toUpperCase()
            : sleeve.fallbackChip;
          return (
            <Card
              key={sleeve.key}
              stats={d ? formatStats(d) : null}
              chipLabel={chipLabel}
              chipLive={chipLabel === "LIVE"}
            />
          );
        })}
      </div>
    </section>
  );
}
