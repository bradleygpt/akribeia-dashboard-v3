/* global console, fetch, setTimeout, TextDecoder */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourceRoot = "C:/Akribeia-ishares";
const sourceJson = "C:/Akribeia-sec-nport/ishares-products.json";
const directory = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-universe-expanded.json", "utf8"),
);
const canonical = JSON.parse(
  await readFile("apps/dashboard/public/data/etf-holdings-canonical.json", "utf8"),
);
const product = JSON.parse(await readFile(sourceJson, "utf8"));
const columns = product.data.tableData.columns.map((column) => column.name);
const index = Object.fromEntries(columns.map((column, position) => [column, position]));
const retained = new Set(canonical.funds.map((fund) => fund.ticker));
const directorySet = new Set(directory.etfs.map((row) => row.ticker));
const products = product.data.tableData.data
  .filter(
    (row) => Array.isArray(row[index.productView]) && row[index.productView].includes("ishares"),
  )
  .filter((row) => row[index.aladdinAssetClass] === "Equity" && row[index.localExchangeTicker])
  .filter(
    (row) =>
      directorySet.has(row[index.localExchangeTicker]) &&
      !retained.has(row[index.localExchangeTicker]),
  )
  .map((row) => ({
    ticker: row[index.localExchangeTicker],
    fundName: row[index.fundName],
    portfolioId: row[index.portfolioId],
    productPageUrl: row[index.productPageUrl],
  }));

await mkdir(sourceRoot, { recursive: true });
const manifest = [];
for (const [position, item] of products.entries()) {
  const url = `https://www.ishares.com${item.productPageUrl}/latest-holdings.csv`;
  const path = `${sourceRoot}/${item.ticker}.csv`;
  let status = "downloaded";
  let error;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Akribeia research contact@example.com",
        Accept: "text/csv,text/plain",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    if (!text.includes("Fund Holdings as of") || !text.includes("Ticker,Name"))
      throw new Error("unexpected official holdings schema");
    await writeFile(path, bytes);
    const asOf =
      text
        .split(/\r?\n/)
        .find((line) => line.startsWith("Fund Holdings as of"))
        ?.split(",")
        .at(-1)
        ?.replaceAll('"', "")
        .trim() ?? "";
    manifest.push({
      ...item,
      url,
      path,
      status,
      asOf,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  } catch (cause) {
    status = "failed";
    error = String(cause?.message ?? cause);
    manifest.push({ ...item, url, path, status, error });
  }
  if ((position + 1) % 10 === 0) console.log(`${position + 1}/${products.length}`);
  await new Promise((resolve) => setTimeout(resolve, 150));
}
await writeFile(
  `${sourceRoot}/manifest.json`,
  `${JSON.stringify({ source: "official iShares product screener and issuer latest-holdings.csv", productScreener: "https://www.ishares.com/us/product-screener/product-screener-v3.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/product-screener-ketto", retrievedAt: new Date().toISOString(), products: manifest }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    requested: products.length,
    downloaded: manifest.filter((row) => row.status === "downloaded").length,
    failed: manifest.filter((row) => row.status === "failed").length,
  }),
);
