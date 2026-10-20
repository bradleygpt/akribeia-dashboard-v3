// Parse the V2 bake's meta.generated_at into an instant.
//
// The V2 bake runs on the owner's PC. Until 2026-10-20 it stamped meta.generated_at in that
// host's naive local time, which the ingest read as UTC, so every observation was recorded 4-5 h
// early (the 2026-10-20 bake at 14:52Z was stamped "2026-10-20T10:52:57"). The bake now writes
// UTC with a Z. A zone-less stamp, from a bake before that fix, is read as the host's local time.

export const BAKE_HOST_TIME_ZONE = "America/New_York";

// The bake host's clock runs ahead of the runner's (2026-10-20: by over a minute), so a fresh
// bake can look slightly in the future.
export const CLOCK_SKEW_HOURS = 0.25;

/** UTC offset (ms) of `timeZone` at instant `t`. */
function zoneOffsetMs(t, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(t))
      .map(({ type, value }) => [type, Number(value)]),
  );
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - Math.floor(t / 1000) * 1000;
}

export function parseGeneratedAt(value, timeZone = BAKE_HOST_TIME_ZONE) {
  const text = String(value ?? "");
  // An explicit zone (Z or +hh:mm) is exact.
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const t = Date.parse(text);
    if (Number.isNaN(t)) throw new Error(`unparseable generated_at: ${value}`);
    return new Date(t);
  }
  // A zone-less stamp is the bake host's local wall time.
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`unparseable generated_at: ${value}`);
  const [, y, mo, d, h, mi, s = "0"] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Two passes settle the offset across a DST change.
  let t = asUtc - zoneOffsetMs(asUtc, timeZone);
  t = asUtc - zoneOffsetMs(t, timeZone);
  return new Date(t);
}
