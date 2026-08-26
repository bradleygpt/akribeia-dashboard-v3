import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecIdentitySourceReceiptSchema, SecRegistrantCrosswalkSchema } from "@akribeia/contracts";
import { captureSecIdentitySources, generateSecRegistrantCrosswalk } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-sec-registrants-"));
  temporaryDirectories.push(root);
  return root;
}

function generatorOptions(
  root: string,
  overrides: Partial<Parameters<typeof generateSecRegistrantCrosswalk>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeSecurityMasterPath: resolve(
      "apps/dashboard/public/data/evidence/security-master/active.json",
    ),
    sourceReceiptPath: resolve("data/reference/sec/2026-07-30/receipt.json"),
    crosswalkRoot: join(root, "sec-registrants"),
    dashboardProjectionPath: join(root, "generated", "active-sec-registrants.json"),
    publicCrosswalkRoot: join(root, "public-sec-registrants"),
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const COMMITTED_REGISTRANTS = JSON.parse(
  readFileSync(resolvePath("apps/dashboard/app/generated/active-sec-registrants.json"), "utf8"),
) as Record<string, unknown>;

describe("SEC registrant identity source", () => {
  it("captures exact provider bytes with a checksum-pinned immutable receipt", async () => {
    const root = await temporaryRoot();
    const companyPayload = JSON.stringify({
      0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
    });
    const fundPayload = JSON.stringify({
      fields: ["cik", "seriesId", "classId", "symbol"],
      data: [[1067839, "S000101292", "C000271435", "QQQ"]],
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(companyPayload, {
          headers: { "last-modified": "Fri, 24 Jul 2026 13:32:43 GMT" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(fundPayload, {
          headers: { "last-modified": "Mon, 27 Jul 2026 21:25:39 GMT" },
        }),
      );
    const options = {
      snapshotId: "2026-07-30",
      outputRoot: join(root, "reference"),
      userAgent: "Akribeia-V3 test@example.com",
      retrievedAt: "2026-07-30T06:49:38.889Z",
      fetchImpl,
    };
    const first = await captureSecIdentitySources(options);
    const receipt = SecIdentitySourceReceiptSchema.parse(
      JSON.parse(await readFile(first.receiptPath, "utf8")),
    );

    expect(first.disposition).toBe("published");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await readFile(join(root, "reference", "company_tickers.json"), "utf8")).toBe(
      companyPayload,
    );
    expect(await readFile(join(root, "reference", "company_tickers_mf.json"), "utf8")).toBe(
      fundPayload,
    );
    expect(receipt.sourcePolicy).toMatchObject({
      declaredUserAgent: true,
      maxRequestsPerSecond: 10,
      accuracyGuarantee: "not-guaranteed-by-provider",
    });
    expect(receipt.sources.map(({ recordCount }) => recordCount)).toEqual([1, 1]);

    fetchImpl.mockRejectedValue(new Error("network must not be used"));
    expect((await captureSecIdentitySources(options)).disposition).toBe("reused");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("requires an identifying user agent and provider modification provenance", async () => {
    const root = await temporaryRoot();

    await expect(
      captureSecIdentitySources({
        snapshotId: "2026-07-30",
        outputRoot: join(root, "short-agent"),
        userAgent: "Akribeia",
        fetchImpl: vi.fn<typeof fetch>(),
      }),
    ).rejects.toThrow("SEC_USER_AGENT");

    await expect(
      captureSecIdentitySources({
        snapshotId: "2026-07-30",
        outputRoot: join(root, "no-provenance"),
        userAgent: "Akribeia-V3 test@example.com",
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}")),
      }),
    ).rejects.toThrow("omitted Last-Modified provenance");
  });
});

describe("SEC registrant crosswalk", () => {
  it("matches the active universe exactly and reports every unresolved ticker", async () => {
    const root = await temporaryRoot();
    const result = await generateSecRegistrantCrosswalk(generatorOptions(root));
    const payload = await readFile(result.crosswalkPath, "utf8");
    const crosswalk = SecRegistrantCrosswalkSchema.parse(JSON.parse(payload));
    const micron = crosswalk.matches.find(({ ticker }) => ticker === "MU");
    const qqq = crosswalk.matches.find(({ ticker }) => ticker === "QQQ");

    expect(crosswalk.status).toBe("partial-current-snapshot");
    expect(crosswalk.historicalIdentityEligible).toBe(false);
    expect(crosswalk.coverage).toEqual(COMMITTED_REGISTRANTS.coverage);
    expect(crosswalk.unmatched.map(({ ticker }) => ticker)).toEqual([
      "BAI",
      "BK",
      "CTRA",
      "DIA",
      "GLD",
      "IAU",
      "IBIT",
      "MDY",
      "PSTG",
      "SPLG",
      "SPY",
    ]);
    expect(micron).toMatchObject({
      provisionalSecurityId: "AKR-TICKER:MU",
      sourceType: "company-ticker",
      matchMethod: "exact-current-ticker",
      cik: "0000723125",
      identityScope: "registrant-only",
    });
    expect(qqq).toMatchObject({
      sourceType: "mutual-fund-class",
      cik: "0001067839",
      seriesId: "S000101292",
      classId: "C000271435",
      identityScope: "registered-fund-class",
    });
    expect(await readFile(generatorOptions(root).dashboardProjectionPath, "utf8")).toBe(payload);
    expect(
      await readFile(
        join(
          generatorOptions(root).publicCrosswalkRoot,
          "builds",
          crosswalk.buildId,
          "sec-registrants.json",
        ),
        "utf8",
      ),
    ).toBe(payload);
  });

  it("reuses identical immutable evidence and refuses conflicting content", async () => {
    const root = await temporaryRoot();
    const first = await generateSecRegistrantCrosswalk(generatorOptions(root));

    expect(first.disposition).toBe("published");
    expect((await generateSecRegistrantCrosswalk(generatorOptions(root))).disposition).toBe(
      "reused",
    );

    await writeFile(first.crosswalkPath, '{"conflict":true}\n');
    await expect(generateSecRegistrantCrosswalk(generatorOptions(root))).rejects.toThrow(
      "Immutable SEC registrant conflict",
    );
  });

  it("fails closed when the active security-master lineage differs", async () => {
    const root = await temporaryRoot();
    const master = JSON.parse(
      await readFile(
        resolve("apps/dashboard/public/data/evidence/security-master/active.json"),
        "utf8",
      ),
    );
    const activeSecurityMasterPath = join(root, "security-master.json");
    await writeFile(
      activeSecurityMasterPath,
      `${JSON.stringify({ ...master, buildId: "different-build" }, null, 2)}\n`,
    );

    await expect(
      generateSecRegistrantCrosswalk(generatorOptions(root, { activeSecurityMasterPath })),
    ).rejects.toThrow("do not share the active build lineage");
  });

  it("fails closed when the source receipt or bytes cannot be verified", async () => {
    const root = await temporaryRoot();
    const receipt = JSON.parse(
      await readFile(resolve("data/reference/sec/2026-07-30/receipt.json"), "utf8"),
    );
    const sourceReceiptPath = join(root, "receipt.json");
    receipt.sources[0].sha256 = "0".repeat(64);
    await writeFile(sourceReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    await expect(
      generateSecRegistrantCrosswalk(generatorOptions(root, { sourceReceiptPath })),
    ).rejects.toThrow("fails receipt integrity");
  });

  it("rejects any claim that the current association snapshot is historical identity", async () => {
    const root = await temporaryRoot();
    const { crosswalk } = await generateSecRegistrantCrosswalk(generatorOptions(root));

    expect(
      SecRegistrantCrosswalkSchema.safeParse({
        ...crosswalk,
        historicalIdentityEligible: true,
      }).success,
    ).toBe(false);
  });
});
