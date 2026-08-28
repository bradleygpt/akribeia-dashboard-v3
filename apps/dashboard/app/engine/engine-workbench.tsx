"use client";

// Thesis Engine workbench — the V2 ThesisEngineTab flow ported against the V3
// /api/v3/engine/* proxy. Honest-desk contract, unchanged:
//   - health probed on mount + every 45s; "not configured" and "offline" are
//     distinct, clearly-labeled cards. No fake content, nothing cached shown live.
//   - the engine's own refusals (GPU-yield 503, rate-limit 429) render as what
//     they are, never dressed up as answers.
//   - a final answer renders ONLY after validateAnswer (min 40 chars, no
//     template-leak markers); a failing answer is withheld by name with its job id.
//   - ?prefill= populates the query box and NEVER submits — submission is
//     always the user's click.

import { useCallback, useEffect, useRef, useState } from "react";
import { validateAnswer } from "./engine-validation";

const HEALTH_INTERVAL_MS = 45_000; // modest cadence; no polling storm
const RESULT_POLL_MS = 2_500;

const PROTECTED_HEADERS = {
  "x-akribeia-client": "dashboard-v3",
  "content-type": "application/json",
} as const;

interface ThesisEvent {
  seq?: number;
  type?: string;
  stage?: unknown;
  note?: unknown;
  [key: string]: unknown;
}

type Health =
  | { status: "checking" }
  | { status: "up"; yielding: boolean }
  | { status: "not-configured"; reason: string }
  | { status: "offline"; reason: string };

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "running"; jobId: string; events: ThesisEvent[] }
  | { kind: "done"; jobId: string; outcome: string; answer: string; citations: unknown[] }
  | { kind: "invalid"; jobId: string; reason: string }
  | { kind: "error"; message: string; flavor: "yielding" | "rate-limit" | "plain" };

function StageTrail({ events }: { events: ThesisEvent[] }) {
  // staged progress, rendered generically by event type (the pipeline's vocabulary can grow)
  const shown = events.filter((event) => event.type && event.type !== "done").slice(-8);
  if (!shown.length) return null;
  return (
    <ul className="engine-stage-trail">
      {shown.map((event, index) => (
        <li key={String(event.seq ?? index)}>
          <code>{String(event.type)}</code>
          {typeof event.stage === "string" ? <span>{event.stage}</span> : null}
          {typeof event.note === "string" ? <span>{event.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function AnswerBody({ text }: { text: string }) {
  // The engine emits markdown-lite (bold + paragraphs). Render conservatively:
  // paragraphs with **bold** spans; no raw HTML, no external renderer.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <div className="engine-answer">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph
            .split(/(\*\*[^*]+\*\*)/g)
            .map((segment, position) =>
              segment.startsWith("**") && segment.endsWith("**") ? (
                <strong key={position}>{segment.slice(2, -2)}</strong>
              ) : (
                <span key={position}>{segment}</span>
              ),
            )}
        </p>
      ))}
    </div>
  );
}

export function EngineWorkbench() {
  const [health, setHealth] = useState<Health>({ status: "checking" });
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pollRef = useRef<number | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/v3/engine/health", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
      if (body.ok === true) {
        setHealth({ status: "up", yielding: body.yielding === true });
        return;
      }
      const reason =
        typeof body.unavailableReason === "string"
          ? body.unavailableReason
          : `health ${response.status}`;
      setHealth(
        reason === "engine not configured"
          ? { status: "not-configured", reason }
          : { status: "offline", reason },
      );
    } catch {
      setHealth({ status: "offline", reason: "unreachable" });
    }
  }, []);

  // Probe on mount and re-probe every 45s while the page stays mounted.
  useEffect(() => {
    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), HEALTH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [checkHealth]);

  // ?prefill= fills the input only — nothing is ever auto-submitted.
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get("prefill");
    if (prefill !== null && prefill.trim() !== "") setQuery(prefill);
  }, []);

  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    [],
  );

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    // One poll in flight at a time, each with a hard timeout: a busy engine
    // answers slower than the poll interval, and unguarded ticks would stack
    // requests until the browser's per-host connection pool is exhausted
    // (which stalls every other fetch on the page).
    let inFlight = false;
    pollRef.current = window.setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/v3/engine/result?job=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
          headers: { accept: "application/json", "x-akribeia-client": "dashboard-v3" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return; // transient — the job persists server-side by id
        const body = (await response.json()) as {
          events?: unknown;
          done?: boolean;
          final?: { outcome?: unknown; answer?: unknown; citations?: unknown } | null;
        };
        if (body.done !== true) {
          setPhase({
            kind: "running",
            jobId,
            events: Array.isArray(body.events) ? (body.events as ThesisEvent[]) : [],
          });
          return;
        }
        if (pollRef.current !== null) window.clearInterval(pollRef.current);
        const answer = typeof body.final?.answer === "string" ? body.final.answer : "";
        const verdict = validateAnswer(answer);
        if (!verdict.ok) {
          setPhase({ kind: "invalid", jobId, reason: verdict.reason ?? "failed validation" });
          return;
        }
        setPhase({
          kind: "done",
          jobId,
          outcome: typeof body.final?.outcome === "string" ? body.final.outcome : "answered",
          answer,
          citations: Array.isArray(body.final?.citations) ? body.final.citations : [],
        });
      } catch {
        // transient poll failure: keep polling; the next tick re-reads the full
        // event log (reconnect-by-job-id semantics).
      } finally {
        inFlight = false;
      }
    }, RESULT_POLL_MS);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || phase.kind === "submitting" || phase.kind === "running") return;
    setPhase({ kind: "submitting" });
    try {
      const response = await fetch("/api/v3/engine/query", {
        method: "POST",
        cache: "no-store",
        headers: PROTECTED_HEADERS,
        body: JSON.stringify({ query: trimmed }),
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
      if (response.status === 503 || body.yielding === true) {
        setPhase({
          kind: "error",
          flavor: "yielding",
          message:
            "The engine is yielding its GPU to the quant pipeline right now. It accepts queries again automatically once that clears; nothing was submitted.",
        });
        return;
      }
      if (response.status === 429) {
        setPhase({
          kind: "error",
          flavor: "rate-limit",
          message:
            "The engine rate-limited this request (one job at a time). Wait for the running job to finish, then try again; nothing was submitted.",
        });
        return;
      }
      const jobId = typeof body.job_id === "string" && body.job_id ? body.job_id : null;
      if (!response.ok || body.ok === false || jobId === null) {
        const reason =
          typeof body.unavailableReason === "string"
            ? body.unavailableReason
            : `submit failed (${response.status})`;
        setPhase({ kind: "error", flavor: "plain", message: reason });
        return;
      }
      setPhase({ kind: "running", jobId, events: [] });
      startPolling(jobId);
    } catch {
      setPhase({ kind: "error", flavor: "plain", message: "submit failed (network)" });
    }
  }, [phase.kind, query, startPolling]);

  const statusLabel =
    health.status === "checking"
      ? "checking…"
      : health.status === "up"
        ? health.yielding
          ? "live · yielding to quant GPU"
          : "live"
        : health.status === "not-configured"
          ? "not configured"
          : "offline";

  return (
    <>
      <section className="parity-section" aria-labelledby="engine-status-heading">
        <div className="research-subheading">
          <div>
            <p className="mono-label">LAPTOP-HOSTED ENGINE / HONEST AVAILABILITY</p>
            <h2 id="engine-status-heading">Engine status</h2>
          </div>
          <span className="engine-status-pill" data-state={health.status}>
            {statusLabel}
          </span>
        </div>
        {health.status === "not-configured" ? (
          <p className="parity-unavailable" role="status">
            The thesis engine is not configured for this deployment ({health.reason}). No engine
            output is shown or simulated; the page activates once the worker proxy is configured.
          </p>
        ) : null}
        {health.status === "offline" ? (
          <>
            <p className="parity-unavailable" role="status">
              The thesis engine is unreachable ({health.reason}). It runs on the markets machine;
              when it is back, this panel goes live automatically. Nothing cached is shown as live.
            </p>
            <button type="button" className="research-load-more" onClick={() => void checkHealth()}>
              Retry now
            </button>
          </>
        ) : null}
      </section>

      {health.status === "up" || health.status === "checking" ? (
        <section className="parity-section parity-section-alt" aria-labelledby="engine-ask-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">GROUNDED THESIS QUERY / NEVER AUTO-SUBMITTED</p>
              <h2 id="engine-ask-heading">Ask</h2>
            </div>
            <span>One GPU job at a time</span>
          </div>
          <div className="research-assist-form">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              placeholder='e.g. "How exposed is the S&P 100 to AI capex risk?"'
              aria-label="Thesis engine query"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={
                phase.kind === "submitting" ||
                phase.kind === "running" ||
                health.status !== "up" ||
                !query.trim()
              }
            >
              {phase.kind === "submitting" || phase.kind === "running" ? "Working…" : "Ask"}
            </button>
          </div>
          <p className="research-assist-note">
            Staged jobs typically take 7–21 minutes and persist server-side under their job id, so a
            dropped connection resumes on the next poll. The engine grounds a thesis in its corpus
            and refuses what it cannot ground; refusals render as refusals.
          </p>
        </section>
      ) : null}

      {phase.kind === "submitting" ? (
        <section className="parity-section" role="status" aria-live="polite">
          <p className="parity-source-note">Submitting the query…</p>
        </section>
      ) : null}

      {phase.kind === "running" ? (
        <section className="parity-section" aria-labelledby="engine-running-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">STAGED PIPELINE / POLLING EVERY 2.5S</p>
              <h2 id="engine-running-heading">Reasoning</h2>
            </div>
            <span>job {phase.jobId}</span>
          </div>
          <p className="parity-source-note" role="status" aria-live="polite">
            The engine is working — stages stream in as they complete. Jobs can take 7–21 minutes;
            this job persists server-side under its id.
          </p>
          <StageTrail events={phase.events} />
        </section>
      ) : null}

      {phase.kind === "error" ? (
        <section className="parity-section" aria-labelledby="engine-error-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">
                {phase.flavor === "yielding"
                  ? "ENGINE YIELDING / HONEST STATE"
                  : phase.flavor === "rate-limit"
                    ? "RATE LIMITED / HONEST STATE"
                    : "REQUEST FAILED"}
              </p>
              <h2 id="engine-error-heading">
                {phase.flavor === "yielding"
                  ? "Engine yielding"
                  : phase.flavor === "rate-limit"
                    ? "Rate limited"
                    : "Request failed"}
              </h2>
            </div>
          </div>
          <p className="parity-unavailable" role="alert">
            {phase.message}
          </p>
        </section>
      ) : null}

      {phase.kind === "invalid" ? (
        <section className="parity-section" aria-labelledby="engine-withheld-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">VALIDATION GATE / OUTPUT WITHHELD</p>
              <h2 id="engine-withheld-heading">Response withheld</h2>
            </div>
          </div>
          <p className="parity-unavailable" role="alert">
            The engine returned output that failed validation ({phase.reason}) — withheld rather
            than rendered. Job {phase.jobId} is preserved server-side for inspection.
          </p>
        </section>
      ) : null}

      {phase.kind === "done" ? (
        <section className="parity-section" aria-labelledby="engine-answer-heading">
          <div className="research-subheading">
            <div>
              <p className="mono-label">VALIDATED ENGINE OUTPUT</p>
              <h2 id="engine-answer-heading">
                {phase.outcome === "no_coverage" ? "No corpus coverage" : "Thesis"}
              </h2>
            </div>
            <span>
              job {phase.jobId} · outcome: {phase.outcome}
            </span>
          </div>
          <AnswerBody text={phase.answer} />
          {phase.citations.length > 0 ? (
            <div className="engine-citations">
              <p className="mono-label">CITATIONS</p>
              <ul>
                {phase.citations.slice(0, 12).map((citation, index) => (
                  <li key={index}>
                    {typeof citation === "string" ? citation : JSON.stringify(citation)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="parity-source-note">
            Grounded by the engine in its own corpus · validated before render · not a
            recommendation.
          </p>
        </section>
      ) : null}
    </>
  );
}
