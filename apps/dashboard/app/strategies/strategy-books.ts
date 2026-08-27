// live = broker-confirmed positions; paper = signal-derived research book
// (2026-07-01 truth-in-labeling directive: a paper book must always be
// visibly labeled wherever holdings are shown).
//
// book_type resolution order: system_status.strategies map -> the strategy
// JSON's own field -> "paper". Defaulting to paper is deliberate: absent
// metadata must never masquerade as live money. Book type is ALWAYS derived
// from the data layer at runtime — never hardcoded per sleeve.

import { useEffect, useState } from "react";
import { loadReference } from "./reference-client";

export type BookType = "live" | "paper";

export interface StratStatus {
  book_type?: BookType;
  status?: string;
  as_of?: string;
  retired?: boolean;
  next_rebalance?: string | null;
  rebalance_model?: string | null;
  rebalance_model_label?: string;
  rebalance_book_type?: BookType;
  go_live?: string;
  go_live_pending?: boolean;
}

export type StratStatusMap = Record<string, StratStatus>;

export function resolveBookType(
  statusEntry: StratStatus | undefined,
  jsonBookType: unknown,
): BookType {
  if (statusEntry?.book_type === "live" || statusEntry?.book_type === "paper") {
    return statusEntry.book_type;
  }
  if (jsonBookType === "live" || jsonBookType === "paper") return jsonBookType;
  return "paper";
}

interface SystemStatusPayload {
  strategies?: StratStatusMap;
}

/** system_status.strategies from the pinned reference. Empty until loaded and
 *  on failure — book types then fall back to each strategy JSON's own field,
 *  which is the designed resolution order, never a fabrication. */
export function useStrategyStatus(): StratStatusMap {
  const [map, setMap] = useState<StratStatusMap>({});
  useEffect(() => {
    let mounted = true;
    loadReference<SystemStatusPayload>("system-status").then((payload) => {
      if (mounted && payload?.strategies) setMap(payload.strategies);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return map;
}
