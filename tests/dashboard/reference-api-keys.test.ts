import { describe, expect, it, vi } from "vitest";
import { handleResearchReferenceApi } from "../../apps/dashboard/worker/research-reference-api.js";
import { handleSecurityReferenceApi } from "../../apps/dashboard/worker/security-reference-api.js";

// `name in OBJECT` also accepts inherited names, so these passed the allowlist: kind=__proto__
// threw an uncaught TypeError, and constructor/toString built junk upstream URLs.
const INHERITED_NAMES = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"];

describe("reference API allowlists", () => {
  it.each(INHERITED_NAMES)(
    "rejects security-reference kind=%s without an upstream fetch",
    async (kind) => {
      const fetcher = vi.fn();
      const response = await handleSecurityReferenceApi(
        new Request(`https://akribeia.example/api/v3/security-reference?kind=${kind}&ticker=NVDA`),
        { fetcher },
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_kind" },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(INHERITED_NAMES)(
    "rejects research-reference dataset=%s without an upstream fetch",
    async (dataset) => {
      const fetcher = vi.fn();
      const response = await handleResearchReferenceApi(
        new Request(`https://akribeia.example/api/v3/research-reference?dataset=${dataset}`),
        { fetcher },
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_dataset" },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
