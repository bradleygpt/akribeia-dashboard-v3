"use client";

import {
  EvidenceExplanationResponseSchema,
  type EvidenceExplanationResponse,
} from "@akribeia/contracts";
import { useState, type FormEvent } from "react";

type ExplorerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: EvidenceExplanationResponse }
  | { kind: "error"; message: string };

export function EvidenceExplorer() {
  const [ticker, setTicker] = useState("MU");
  const [focus, setFocus] = useState<"summary" | "factor-contributions" | "portfolio" | "thesis">(
    "summary",
  );
  const [state, setState] = useState<ExplorerState>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading" });

    try {
      const response = await fetch("/api/v3/ai/explain", {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-akribeia-client": "dashboard-v3",
        },
        body: JSON.stringify({ ticker, focus }),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as {
          error?: { message?: unknown };
        };
        const message =
          typeof errorBody.error?.message === "string"
            ? errorBody.error.message
            : "The evidence explanation is unavailable.";
        setState({ kind: "error", message });
        return;
      }

      setState({
        kind: "success",
        result: EvidenceExplanationResponseSchema.parse(await response.json()),
      });
    } catch {
      setState({
        kind: "error",
        message: "The response failed its network or schema verification.",
      });
    }
  }

  return (
    <section className="evidence-explorer" id="explore" aria-labelledby="explorer-heading">
      <div className="explorer-intro">
        <p className="mono-label">PROTECTED SERVER EVIDENCE</p>
        <h2 id="explorer-heading">Ask the published build</h2>
        <p>
          Select a ticker and focus. The server verifies immutable score and portfolio artifacts,
          then produces a deterministic explanation with evidence citations. Only the
          &ldquo;Grounded thesis&rdquo; focus calls an external model, grounded in the same verified
          evidence; every other focus uses no external model. No browser secret or performance
          forecast is used.
        </p>
      </div>
      <div className="explorer-workspace">
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Ticker
            <input
              name="ticker"
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              maxLength={10}
              pattern="[A-Za-z][A-Za-z0-9.-]{0,9}"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Explanation focus
            <select
              name="focus"
              value={focus}
              onChange={(event) =>
                setFocus(
                  event.target.value as "summary" | "factor-contributions" | "portfolio" | "thesis",
                )
              }
            >
              <option value="summary">Summary</option>
              <option value="factor-contributions">Factor contributions</option>
              <option value="portfolio">Portfolio selection</option>
              <option value="thesis">Grounded thesis (external model)</option>
            </select>
          </label>
          <button type="submit" disabled={state.kind === "loading"}>
            {state.kind === "loading" ? "Verifying…" : "Explain evidence"}
          </button>
        </form>
        <div
          className="explorer-result"
          data-state={state.kind}
          aria-live="polite"
          aria-atomic="true"
        >
          {state.kind === "idle" ? (
            <p>Ready. Try MU, NVDA, or another ticker in the active 643-security build.</p>
          ) : null}
          {state.kind === "loading" ? <p>Verifying active evidence on the server…</p> : null}
          {state.kind === "error" ? (
            <p role="alert">
              <strong>Unable to explain.</strong> {state.message}
            </p>
          ) : null}
          {state.kind === "success" ? (
            <>
              <div>
                <span>{state.result.ticker}</span>
                <span>{state.result.mode}</span>
                <span>
                  {state.result.externalModelUsed
                    ? "External model used"
                    : "No external model used"}
                </span>
              </div>
              {state.result.thesisUnavailableReason !== undefined ? (
                <p role="alert">
                  <strong>Grounded thesis unavailable.</strong>{" "}
                  {state.result.thesisUnavailableReason} The deterministic evidence explanation
                  below is shown instead.
                </p>
              ) : null}
              <p>{state.result.explanation}</p>
              <small>
                Evidence: {state.result.citations.join(" · ")} · Model {state.result.modelVersion}
              </small>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
