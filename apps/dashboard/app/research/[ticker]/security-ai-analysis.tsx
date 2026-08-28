"use client";

// AI Analysis card (V2 StockDetailTab "AI Analysis" + StructuredReview, ported
// against the V3 worker contracts). Two on-demand actions, both fail-closed:
//   - "Research note (external model)": POST /api/v3/ai/assist {kind:"research"}
//     — renders text + citations + model, or the honest unavailable reason.
//   - "AI earnings review (pinned)": GET research-reference?dataset=earnings-reviews
//     — renders the pinned 8-K thesis-check with the V2 grammar: VERDICT pill,
//     headline, sectioned full_text, quality badge, filing dates, SEC link,
//     and provenance. A missing review renders an explicit empty state.
// Nothing here is generated client-side; nothing substitutes for an absent record.

import { useState } from "react";

interface ReviewRecord {
  verdict?: string | null;
  headline?: string | null;
  full_text?: string | null;
  filing_date?: string | null;
  filing_url?: string | null;
  prior_filing_date?: string | null;
  company_name?: string | null;
  provider?: string | null;
  model?: string | null;
  cached_at?: string | null;
}

interface ReviewQuality {
  quality?: "High" | "Medium" | "Low" | string;
  reason?: string | null;
  verdict?: string | null;
}

type NoteState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; text: string; citations: string[]; model: string | null };

type ReviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  | { kind: "empty" }
  | { kind: "ready"; record: ReviewRecord; quality: ReviewQuality | null };

// The ALL-CAPS section vocabulary the pinned reviews use (V2 StructuredReview,
// plus the VERDICT header which the pill renders separately).
const SECTION_HEADERS = [
  "VERDICT",
  "HEADLINE",
  "KEY METRICS",
  "GUIDANCE",
  "THESIS CHECK",
  "CALLOUTS",
  "BOTTOM LINE",
] as const;

function verdictTone(verdict: string | null | undefined): "positive" | "neutral" | "negative" {
  const value = (verdict ?? "").toUpperCase();
  if (value.startsWith("BUY")) return "positive";
  if (value.includes("TRIM") || value.includes("EXIT") || value.includes("AVOID"))
    return "negative";
  return "neutral";
}

function qualityTone(quality: string | undefined): "positive" | "neutral" | "negative" {
  if (quality === "High") return "positive";
  if (quality === "Low") return "negative";
  return "neutral";
}

function parseSections(text: string): { header: string; body: string }[] {
  const marks: { header: string; index: number; length: number }[] = [];
  for (const header of SECTION_HEADERS) {
    const match = text.match(new RegExp(`^[ \\t]*${header}\\b.*$`, "im"));
    if (match && match.index !== undefined)
      marks.push({ header, index: match.index, length: match[0].length });
  }
  marks.sort((left, right) => left.index - right.index);
  if (!marks.length) return [];
  const sections: { header: string; body: string }[] = [];
  const first = marks[0];
  if (first !== undefined) {
    const preamble = text.slice(0, first.index).trim();
    if (preamble) sections.push({ header: "", body: preamble });
  }
  for (let position = 0; position < marks.length; position++) {
    const mark = marks[position];
    if (mark === undefined) continue;
    const start = mark.index + mark.length;
    // Keep any remainder on the header line itself (e.g. "VERDICT: HOLD").
    const inline = text
      .slice(mark.index, start)
      .replace(new RegExp(`^[ \\t]*${mark.header}\\b[:\\s-]*`, "i"), "");
    const next = marks[position + 1];
    const end = next === undefined ? text.length : next.index;
    const body = `${inline}\n${text.slice(start, end)}`.trim();
    sections.push({ header: mark.header, body });
  }
  return sections;
}

function SectionBody({ text }: { text: string }) {
  // V2 Body: a run of bullet-ish lines renders as a list, otherwise a paragraph.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletish = lines.filter((line) => /^[-•*]\s/.test(line)).length;
  if (bulletish >= 2 && bulletish >= lines.length - 1) {
    return (
      <ul>
        {lines.map((line, index) => (
          <li key={index}>{line.replace(/^[-•*]\s*/, "")}</li>
        ))}
      </ul>
    );
  }
  return <p>{text}</p>;
}

export function SecurityAiAnalysis({ ticker }: { ticker: string }) {
  const [note, setNote] = useState<NoteState>({ kind: "idle" });
  const [review, setReview] = useState<ReviewState>({ kind: "idle" });

  const requestNote = async () => {
    if (note.kind === "loading") return;
    setNote({ kind: "loading" });
    try {
      const response = await fetch("/api/v3/ai/assist", {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "x-akribeia-client": "dashboard-v3",
        },
        body: JSON.stringify({ kind: "research", ticker }),
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await response.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
      const unavailableReason =
        typeof body.unavailableReason === "string" ? body.unavailableReason : null;
      const text = typeof body.text === "string" && body.text.trim() ? body.text : null;
      if (!response.ok || body.ok !== true || unavailableReason !== null || text === null) {
        setNote({
          kind: "unavailable",
          reason:
            unavailableReason ??
            "The external-model research note is unavailable. No substitute narrative is shown.",
        });
        return;
      }
      setNote({
        kind: "ready",
        text,
        citations: Array.isArray(body.citations)
          ? body.citations.filter((item): item is string => typeof item === "string")
          : [],
        model: typeof body.model === "string" && body.model.trim() ? body.model : null,
      });
    } catch {
      setNote({
        kind: "unavailable",
        reason: "The research-note request failed. No substitute narrative is shown.",
      });
    }
  };

  const requestReview = async () => {
    if (review.kind === "loading") return;
    setReview({ kind: "loading" });
    try {
      const response = await fetch(
        `/api/v3/research-reference?dataset=earnings-reviews&ticker=${encodeURIComponent(ticker)}`,
        { cache: "no-store", headers: { accept: "application/json" } },
      );
      let body: {
        ok?: boolean;
        payload?: { record?: ReviewRecord | null; quality?: ReviewQuality | null } | null;
        error?: { message?: string };
      } = {};
      try {
        body = (await response.json()) as typeof body;
      } catch {
        body = {};
      }
      if (!response.ok || body.ok !== true || body.payload === undefined || body.payload === null) {
        setReview({
          kind: "unavailable",
          reason:
            body.error?.message ??
            "The pinned earnings-review source is unavailable. No review is synthesized in its place.",
        });
        return;
      }
      const record = body.payload.record ?? null;
      if (record === null) {
        setReview({ kind: "empty" });
        return;
      }
      if (typeof record.full_text !== "string" || !record.full_text.trim()) {
        setReview({
          kind: "unavailable",
          reason:
            "The pinned record carries no review text — withheld rather than rendered without substance.",
        });
        return;
      }
      setReview({ kind: "ready", record, quality: body.payload.quality ?? null });
    } catch {
      setReview({
        kind: "unavailable",
        reason: "The pinned earnings-review request failed. No review is synthesized in its place.",
      });
    }
  };

  const record = review.kind === "ready" ? review.record : null;
  const verdict =
    record !== null
      ? (record.verdict ?? (review.kind === "ready" ? review.quality?.verdict : null) ?? null)
      : null;
  const sections = record?.full_text ? parseSections(record.full_text) : [];

  return (
    <section className="security-ai" aria-labelledby="ai-analysis-heading">
      <div className="security-section-heading">
        <div>
          <p className="mono-label">AI ANALYSIS / ON REQUEST ONLY</p>
          <h2 id="ai-analysis-heading">Research note and pinned earnings review</h2>
        </div>
        <p>External model on request; pinned 8-K thesis-check from the published build.</p>
      </div>
      <div className="security-ai-actions">
        <button type="button" onClick={() => void requestNote()} disabled={note.kind === "loading"}>
          {note.kind === "loading"
            ? "Requesting external model…"
            : "Research note (external model)"}
        </button>
        <button
          type="button"
          onClick={() => void requestReview()}
          disabled={review.kind === "loading"}
        >
          {review.kind === "loading" ? "Loading pinned review…" : "AI earnings review (pinned)"}
        </button>
      </div>

      <div aria-live="polite">
        {note.kind === "unavailable" ? (
          <p className="parity-unavailable" role="alert">
            <strong>Research note unavailable.</strong> {note.reason}
          </p>
        ) : null}
        {note.kind === "ready" ? (
          <div className="security-ai-note">
            {note.text
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            <p className="parity-source-note">
              {note.citations.length > 0 ? `Evidence: ${note.citations.join(" · ")} · ` : ""}
              Model {note.model ?? "unavailable"} · external model used on request · dated narrative
              · not a recommendation.
            </p>
          </div>
        ) : null}
      </div>

      <div aria-live="polite">
        {review.kind === "unavailable" ? (
          <p className="parity-unavailable" role="alert">
            <strong>Pinned earnings review unavailable.</strong> {review.reason}
          </p>
        ) : null}
        {review.kind === "empty" ? (
          <p className="parity-unavailable" role="status">
            No pinned earnings review exists for {ticker}. Reviews are generated from parsed 8-K
            (Item 2.02) filings at bake time; nothing is generated on the fly and no verdict is
            shown without one.
          </p>
        ) : null}
        {record !== null ? (
          <div className="security-ai-review">
            <div className="security-ai-review-badges">
              {verdict ? (
                <span className="security-verdict" data-tone={verdictTone(verdict)}>
                  VERDICT: {verdict.toUpperCase()}
                </span>
              ) : null}
              {review.kind === "ready" &&
              review.quality !== null &&
              typeof review.quality.quality === "string" ? (
                <span
                  className="security-quality"
                  data-tone={qualityTone(review.quality.quality)}
                  title={review.quality.reason ?? undefined}
                >
                  Quality: {review.quality.quality}
                </span>
              ) : null}
              <span className="security-ai-filing">
                Filed {record.filing_date ?? "date unavailable"}
                {record.prior_filing_date ? ` · prior filing ${record.prior_filing_date}` : ""}
              </span>
              {typeof record.filing_url === "string" && record.filing_url ? (
                <a href={record.filing_url} target="_blank" rel="noreferrer">
                  View the 8-K ↗
                </a>
              ) : null}
            </div>
            {record.headline ? <p className="security-ai-headline">{record.headline}</p> : null}
            {sections.length > 0 ? (
              <div className="security-ai-sections">
                {sections
                  // The pill and headline already carry these two; a VERDICT or
                  // HEADLINE section that merely repeats them is not re-rendered.
                  .filter((section) => {
                    if (
                      section.header === "VERDICT" &&
                      verdict !== null &&
                      section.body
                        .toUpperCase()
                        .replace(/[^A-Z ]/g, "")
                        .trim() === verdict.toUpperCase().trim()
                    )
                      return false;
                    if (
                      section.header === "HEADLINE" &&
                      record.headline &&
                      section.body.trim() === record.headline.trim()
                    )
                      return false;
                    return true;
                  })
                  .map((section, index) => (
                    <div key={`${section.header}-${index}`}>
                      {section.header ? <p className="mono-label">{section.header}</p> : null}
                      <SectionBody text={section.body} />
                    </div>
                  ))}
              </div>
            ) : (
              <div className="security-ai-sections">
                {record.full_text
                  ?.split(/\n{2,}/)
                  .map((paragraph) => paragraph.trim())
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
              </div>
            )}
            <p className="parity-source-note">
              Pinned review · cached {record.cached_at ?? "time unavailable"} · model{" "}
              {record.model ?? "unavailable"}
              {record.provider ? ` (${record.provider})` : ""}
              {record.company_name ? ` · ${record.company_name}` : ""} · 8-K thesis-check · not a
              recommendation.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
