import observationProvenance from "../../../data/observations/current/provenance.json";

// The akribeia-data commit the ACTIVE observation was ingested from. Per-security detail,
// price, timeseries and quarterly shards and the earnings corpus are read at this commit, so
// a security page's method-detail panel describes the same bake as the hero above it. The
// fixed pin it replaces (9f2d2322, 2026-07-30) was never advanced and contradicted the hero
// on every stock page (audit 2026-10-20, B3: NVDA valuation 6.29 vs 5.43, fair value
// $204.34 vs $207.54).
export const BULK_DATA_COMMIT: string = observationProvenance.bulk_data_commit;
