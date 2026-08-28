"use client";

// Stock detail → Thesis Engine entry block (V2 MarketsEntry semantics against
// the V3 ticker-anchor-map dataset).
//
// The engine measures SECTOR/MACRO ANCHORS, not single names — proxy honesty is
// mandatory UI here, not fine print. Templates are phrased with the ticker's
// mapped anchor ALIAS in the engine's detection-gate vocabulary. An unmapped
// ticker renders a disabled explanation and links nothing: asking would only
// produce the engine's honest refusal.
//
// Every template is a LINK to /engine?prefill=<query>. The engine page reads
// ?prefill= into its input WITHOUT submitting — one GPU slot, 7-21 minute jobs,
// so nothing ever fires from this block.

import { useEffect, useState } from "react";

interface AnchorEntry {
  anchor?: string | null;
  alias?: string | null;
  anchor_name?: string | null;
  mapping_kind?: string;
  // Short-history anchors (e.g. XLC from 2018-06): the SHORT-HISTORY label must
  // render at this click-out, not only on the engine page.
  short_history?: boolean;
  coverage_start?: string;
  short_history_note?: string;
}

type EntryState =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "unmapped"; mappingKind: string | null }
  | { kind: "mapped"; entry: AnchorEntry };

// Gate-validated templates (V2 MarketsEntry.tsx). Wording is deliberately
// alias-based — tickers like "SMH"/"XLK" are NOT in the gate vocabulary;
// "semiconductors"/"tech stocks" are. `since` is the anchor's real coverage
// start, so a short-history anchor never pre-fills a false premise.
const TEMPLATES: { label: string; make: (alias: string, since: string) => string }[] = [
  {
    label: "Drawdowns + recoveries",
    make: (alias, since) =>
      `How deep were ${alias} drawdowns since ${since}, and how long did recoveries take?`,
  },
  {
    label: "Regime correlation",
    make: (alias) =>
      `How does the correlation between ${alias} and the stock market change across regimes?`,
  },
  {
    label: "FOMC behavior",
    make: (alias) => `How did ${alias} perform around FOMC meetings?`,
  },
];

export function SecurityEngineEntry({ ticker }: { ticker: string }) {
  const [state, setState] = useState<EntryState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetch(
      `/api/v3/research-reference?dataset=ticker-anchor-map&ticker=${encodeURIComponent(ticker)}`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    )
      .then(async (response) => {
        let body: {
          ok?: boolean;
          payload?: AnchorEntry | null;
          error?: { message?: string };
        } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          body = {};
        }
        if (!response.ok || body.ok !== true || body.payload === undefined) {
          throw new Error(body.error?.message ?? "The anchor map is unavailable.");
        }
        if (controller.signal.aborted) return;
        const entry = body.payload;
        if (
          entry === null ||
          entry.mapping_kind === "none" ||
          typeof entry.alias !== "string" ||
          !entry.alias
        ) {
          setState({ kind: "unmapped", mappingKind: entry?.mapping_kind ?? null });
          return;
        }
        setState({ kind: "mapped", entry });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "unavailable",
          reason: reason instanceof Error ? reason.message : "The anchor map is unavailable.",
        });
      });
    return () => controller.abort();
  }, [attempt, ticker]);

  const entry = state.kind === "mapped" ? state.entry : null;
  const sinceYear = (entry?.coverage_start ?? "2004").slice(0, 4);

  return (
    <section className="security-engine-entry" aria-labelledby="engine-entry-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">THESIS ENGINE ENTRY / SECTOR-ANCHOR PROXY</p>
          <h2 id="engine-entry-heading">Ask the thesis engine</h2>
        </div>
        <p>
          {entry !== null
            ? `via ${entry.anchor_name ?? entry.alias} — the engine measures sectors and macro anchors, not single names.`
            : "The engine measures sector/macro anchors, not single names."}
        </p>
      </div>

      {state.kind === "loading" ? (
        <p className="parity-source-note" role="status">
          Loading the ticker→anchor map…
        </p>
      ) : null}

      {state.kind === "unavailable" ? (
        <>
          <p className="parity-unavailable" role="status">
            The anchor map is unavailable ({state.reason}). No proxy question is offered without it.
          </p>
          <button
            type="button"
            className="research-load-more"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Retry anchor map
          </button>
        </>
      ) : null}

      {state.kind === "unmapped" ? (
        <p className="parity-unavailable" role="status">
          No measured anchor covers {ticker}
          {state.mappingKind === "none" ? " (sector unmapped)" : ""} — asking would only produce the
          engine&rsquo;s honest refusal, so nothing links from here.
        </p>
      ) : null}

      {entry !== null ? (
        <>
          {entry.short_history ? (
            <p className="engine-short-history" role="note">
              <strong>⚠ Short history.</strong>{" "}
              {entry.short_history_note ??
                `${entry.anchor_name ?? entry.alias} is measured only since ${sinceYear} — evidence spans ~1 market cycle, so treat drawdown and event counts as indicative, not robust.`}
            </p>
          ) : null}
          <div className="engine-template-grid">
            {TEMPLATES.map((template) => {
              const question = template.make(entry.alias ?? "", sinceYear);
              return (
                <a
                  key={template.label}
                  href={`/engine?prefill=${encodeURIComponent(question)}`}
                  title={question}
                >
                  <strong>{template.label}</strong>
                  <span>{question}</span>
                </a>
              );
            })}
          </div>
          <p className="parity-source-note">
            Opens the Thesis Engine page with the question pre-filled — you confirm and submit
            there; nothing fires from this click. Staged jobs typically take 7–21 minutes.
          </p>
        </>
      ) : null}
    </section>
  );
}
