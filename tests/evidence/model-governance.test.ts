import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MetricDictionarySchema, ModelCardSchema } from "@akribeia/contracts";
import { generateModelGovernance } from "@akribeia/evidence";

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "akribeia-governance-"));
  temporaryDirectories.push(root);
  return root;
}

function options(
  root: string,
  overrides: Partial<Parameters<typeof generateModelGovernance>[0]> = {},
) {
  return {
    activeDailyEvidencePath: resolve("apps/dashboard/public/data/evidence/active.json"),
    evidenceRoot: resolve("data/evidence"),
    metadataPath: resolve("data/observations/current/meta.json"),
    governanceRoot: join(root, "governance"),
    dashboardProjectionRoot: join(root, "generated"),
    publicGovernanceRoot: join(root, "public-governance"),
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

describe("model governance evidence", () => {
  it("publishes the actual model card, validation state, and 26-metric dictionary", async () => {
    const root = await temporaryRoot();
    const result = await generateModelGovernance(options(root));
    const [cardPayload, dictionaryPayload, projectedCard, publicDictionary] = await Promise.all([
      readFile(result.modelCardPath, "utf8"),
      readFile(result.metricDictionaryPath, "utf8"),
      readFile(join(root, "generated", "active-model-card.json"), "utf8"),
      readFile(join(root, "public-governance", "active-metric-dictionary.json"), "utf8"),
    ]);
    const card = ModelCardSchema.parse(JSON.parse(cardPayload));
    const dictionary = MetricDictionarySchema.parse(JSON.parse(dictionaryPayload));

    expect(result.disposition).toBe("published");
    expect(card.modelVersion).toBe("3.0.0");
    expect(card.maturity).toBe("research-preview");
    expect(card.releaseEligible).toBe(false);
    expect(card.validation.map(({ gate, status }) => [gate, status])).toEqual([
      ["software", "pass"],
      ["scoring-parity", "pass"],
      ["portfolio-parity", "fail"],
      ["coverage", "pass"],
      ["portfolio-constraints", "pass"],
      ["benchmark", "not-started"],
      ["point-in-time", "not-started"],
      ["prospective", "insufficient-evidence"],
    ]);
    expect(dictionary.pillars).toHaveLength(5);
    expect(dictionary.pillars.reduce((count, pillar) => count + pillar.components.length, 0)).toBe(
      26,
    );
    expect(dictionary.methodologyStatus).toContain("transform-formulas-unavailable");
    expect(projectedCard).toBe(cardPayload);
    expect(publicDictionary).toBe(dictionaryPayload);
  });

  it("reuses identical versioned governance artifacts on retry", async () => {
    const root = await temporaryRoot();
    const first = await generateModelGovernance(options(root));
    const second = await generateModelGovernance(options(root));

    expect(first.disposition).toBe("published");
    expect(second.disposition).toBe("reused");
    expect(second.modelCard).toEqual(first.modelCard);
    expect(second.metricDictionary).toEqual(first.metricDictionary);
  });

  it("rejects an active projection that differs from immutable daily evidence", async () => {
    const root = await temporaryRoot();
    const active = JSON.parse(
      await readFile(resolve("apps/dashboard/public/data/evidence/active.json"), "utf8"),
    );
    const activePath = join(root, "altered-active.json");

    await writeFile(activePath, `${JSON.stringify({ ...active, notice: "Altered." }, null, 2)}\n`);

    await expect(
      generateModelGovernance(options(root, { activeDailyEvidencePath: activePath })),
    ).rejects.toThrow("does not match its immutable verified record");
  });

  it("rejects metric metadata from a different source commit", async () => {
    const root = await temporaryRoot();
    const metadata = JSON.parse(
      await readFile(resolve("data/observations/current/meta.json"), "utf8"),
    );
    const metadataPath = join(root, "wrong-source-meta.json");

    await writeFile(
      metadataPath,
      `${JSON.stringify({ ...metadata, source_commit: "different" }, null, 2)}\n`,
    );

    await expect(generateModelGovernance(options(root, { metadataPath }))).rejects.toThrow(
      "does not match the active evidence source",
    );
  });

  it("rejects metric metadata with noncanonical pillars", async () => {
    const root = await temporaryRoot();
    const metadata = JSON.parse(
      await readFile(resolve("data/observations/current/meta.json"), "utf8"),
    );
    const metadataPath = join(root, "wrong-pillars-meta.json");

    [metadata.pillars[0], metadata.pillars[1]] = [metadata.pillars[1], metadata.pillars[0]];
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    await expect(generateModelGovernance(options(root, { metadataPath }))).rejects.toThrow(
      "canonical pillars",
    );
  });

  it("rejects a metadata weight that disagrees with the active model", async () => {
    const root = await temporaryRoot();
    const metadata = JSON.parse(
      await readFile(resolve("data/observations/current/meta.json"), "utf8"),
    );
    const metadataPath = join(root, "wrong-weight-meta.json");

    metadata.presets.equal.weights.Valuation = 0.3;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    await expect(generateModelGovernance(options(root, { metadataPath }))).rejects.toThrow(
      'weight for "valuation" does not match the active model',
    );
  });

  it("refuses to rewrite an immutable model card with different bytes", async () => {
    const root = await temporaryRoot();
    const first = await generateModelGovernance(options(root));

    await writeFile(first.modelCardPath, '{"conflict":true}\n');

    await expect(generateModelGovernance(options(root))).rejects.toThrow(
      "Immutable governance conflict",
    );
  });
});
