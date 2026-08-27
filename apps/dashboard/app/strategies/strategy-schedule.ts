// Rebalance schedule — computed upstream by ops/rebalance_schedule.py and
// baked as rebalance_schedule.json (pinned reference dataset
// "rebalance-schedule"). THE single authority for "next rebalance".
//
// Two dimensions always travel with a date:
//   model             -- what rule produced it (so it can be read as
//                        correct-or-not)
//   rebalance_book_type -- whether THAT rebalance trades real money (a sleeve
//                        can rebalance on schedule while the rebalance is
//                        deliberately non-trading)
//
// Ported from quant-dashboard-pro-v2 src/lib/schedule.ts; the loader goes
// through the V3 reference API instead of the baked public/data file.

import { useEffect, useState } from "react";
import { loadReference } from "./reference-client";

export interface SleeveSchedule {
  sleeve: string;
  model: string;
  model_label: string;
  hold_days: number | null;
  anchor: string | null;
  next_rebalance: string;
  effective_trading_day: string;
  book_type: "paper" | "live";
  rebalance_book_type: "paper" | "live";
  go_live: string | null;
  go_live_pending: boolean;
  never_goes_live: boolean;
  gates_execution: boolean;
  rationale: string;
}

export type ScheduleMap = Record<string, SleeveSchedule>;

interface SchedulePayload {
  sleeves?: ScheduleMap;
}

export function useRebalanceSchedule(): ScheduleMap {
  const [map, setMap] = useState<ScheduleMap>({});
  useEffect(() => {
    let mounted = true;
    loadReference<SchedulePayload>("rebalance-schedule").then((payload) => {
      if (mounted && payload?.sleeves) setMap(payload.sleeves);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return map;
}

/** Past due = the effective trading day has passed. This is the condition that
 *  sat unnoticed for 22 days on the paper track, because nothing displayed it. */
export function isPastDue(s: SleeveSchedule | undefined, today = new Date()): boolean {
  if (!s) return false;
  const t = today.toISOString().slice(0, 10);
  return s.effective_trading_day < t;
}

/** One-line label carrying both dimensions. Never render a bare date. */
export function scheduleLabel(s: SleeveSchedule | undefined): string {
  if (!s) return "";
  const who = s.rebalance_book_type === "live" ? "live" : "paper";
  const tail = s.go_live_pending && s.go_live ? ` · go live ${s.go_live}` : "";
  return `${s.model_label} · ${who}${tail}`;
}
