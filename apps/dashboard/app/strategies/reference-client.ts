// Client-side loader for the pinned V2 reference datasets, shared by every
// strategies visual. One in-flight promise per dataset (the hub, signatures
// and summary table share the same five strategy JSONs), null on any failure
// so each card can render an explicit "reference unavailable" state instead
// of crashing or fabricating.
//
// This module is only ever exercised from client components' effects — the
// Worker SSR renders the loading placeholders and never fetches here.

import { useEffect, useState } from "react";

interface Envelope {
  ok?: boolean;
  payload?: unknown;
  error?: { message?: string };
}

const cache = new Map<string, Promise<unknown>>();

export function loadReference<T>(dataset: string): Promise<T | null> {
  let pending = cache.get(dataset);
  if (!pending) {
    pending = fetch(`/api/v3/research-reference?dataset=${encodeURIComponent(dataset)}`, {
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as Envelope;
        return body.ok ? (body.payload ?? null) : null;
      })
      .catch(() => null)
      .then((payload) => {
        // A failed load is not cached forever — a later mount may retry.
        if (payload === null) cache.delete(dataset);
        return payload;
      });
    cache.set(dataset, pending);
  }
  return pending as Promise<T | null>;
}

/** null = still loading (also the SSR state); "unavailable" = the pinned
 *  source did not deliver — render the explicit unavailable state. */
export type ReferenceResult<T> = T | null | "unavailable";

export function useReference<T>(dataset: string): ReferenceResult<T> {
  const [state, setState] = useState<ReferenceResult<T>>(null);
  useEffect(() => {
    let mounted = true;
    loadReference<T>(dataset).then((payload) => {
      if (mounted) setState(payload === null ? "unavailable" : payload);
    });
    return () => {
      mounted = false;
    };
  }, [dataset]);
  return state;
}
