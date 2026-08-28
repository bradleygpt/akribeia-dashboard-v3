// Response validation before anything renders as a thesis — a verbatim port of
// the V2 gate (quant-dashboard-pro-v2 src/lib/markets.ts:93-101, the same
// discipline class as the earnings reviewer): non-empty (minimum 40 characters)
// and free of prompt-template leakage markers. A failing answer is withheld and
// named as withheld; it is never rendered as analysis.

const TEMPLATE_LEAK =
  /\[[^\]]*?(insert|placeholder|e\.g\.|your |bullet|sentence|TODO|TBD)[^\]]*?\]|<\|[a-z_]+\|>|\{\{[^}]+\}\}/i;

export function validateAnswer(text: string | undefined | null): { ok: boolean; reason?: string } {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 40) return { ok: false, reason: "empty or too short" };
  if (TEMPLATE_LEAK.test(trimmed)) return { ok: false, reason: "template leakage detected" };
  return { ok: true };
}
