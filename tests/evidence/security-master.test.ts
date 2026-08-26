import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityMasterSchema } from "@akribeia/contracts";
import { generateSecurityMaster } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-security-master-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateSecurityMaster>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    activeQualityReportPath: resolve("apps/dashboard/public/data/evidence/quality/active.json"),
    publishedDataRoot: resolve("apps/dashboard/public/data"),
    securityMasterRoot: join(root, "security-master"),
    dashboardProjectionPath: join(root, "generated", "active-security-master.json"),
    publicSecurityMasterRoot: join(root, "public-security-master"),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const COMMITTED_MASTER = JSON.parse(
  readFileSync(resolvePath("apps/dashboard/app/generated/active-security-master.json"), "utf8"),
) as Record<string, unknown>;

describe("provisional security master", () => {
  it("maps every validated ticker to one deterministic, explicitly provisional identity", async () => {
    const root = await temporaryRoot();
    const result = await generateSecurityMaster(options(root));
    const payload = await readFile(result.masterPath, "utf8");
    const master = SecurityMasterSchema.parse(JSON.parse(payload));
    const micron = master.securities.find(({ currentTicker }) => currentTicker === "MU");

    expect(master.status).toBe("provisional");
    expect(master.coverage).toEqual(COMMITTED_MASTER.coverage);
    expect(master.identityPolicy).toMatchObject({
      identifierBasis: "current-ticker-only",
      permanentIdentifiersAvailable: false,
      tickerHistoryAvailable: false,
      tickerReuseProtection: "unavailable",
    });
    expect(micron).toMatchObject({
      securityId: "AKR-TICKER:MU",
      identifierStatus: "provisional-ticker-derived",
      currentTicker: "MU",
      permanentIdentifiers: {
        cik: null,
        cusip: null,
        isin: null,
        lei: null,
      },
    });
    expect(await readFile(options(root).dashboardProjectionPath, "utf8")).toBe(payload);
  });

  it("reuses the same immutable master on retry", async () => {
    const root = await temporaryRoot();

    expect((await generateSecurityMaster(options(root))).disposition).toBe("published");
    expect((await generateSecurityMaster(options(root))).disposition).toBe("reused");
  });

  it("rejects a quality report that does not approve the active identity set", async () => {
    const root = await temporaryRoot();
    const quality = JSON.parse(
      await readFile(resolve("apps/dashboard/public/data/evidence/quality/active.json"), "utf8"),
    );
    const activeQualityReportPath = join(root, "quality.json");
    await writeFile(
      activeQualityReportPath,
      `${JSON.stringify(
        {
          ...quality,
          quality: {
            ...quality.quality,
            status: "warn",
          },
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      generateSecurityMaster(options(root, { activeQualityReportPath })),
    ).rejects.toThrow("does not approve");
  });

  it("rejects scores that fail their daily evidence receipt", async () => {
    const root = await temporaryRoot();
    const publishedDataRoot = join(root, "published");
    await cp(resolve("apps/dashboard/public/data"), publishedDataRoot, { recursive: true });
    const daily = JSON.parse(
      await readFile(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8"),
    );
    await writeFile(
      join(publishedDataRoot, "builds", daily.build.buildId, "scores.json"),
      '{"tampered":true}\n',
    );

    await expect(generateSecurityMaster(options(root, { publishedDataRoot }))).rejects.toThrow(
      "fail the daily evidence receipt",
    );
  });

  it("refuses to rewrite an immutable security master", async () => {
    const root = await temporaryRoot();
    const first = await generateSecurityMaster(options(root));
    await writeFile(first.masterPath, '{"conflict":true}\n');

    await expect(generateSecurityMaster(options(root))).rejects.toThrow(
      "Immutable security-master conflict",
    );
  });
});
