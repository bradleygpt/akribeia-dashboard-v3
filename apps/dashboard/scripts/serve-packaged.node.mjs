// Local QA harness: serves the packaged Worker (dist/server/index.js) with the
// built client assets (dist/client) exactly like the deployed Sites runtime —
// the same wiring the dashboard test suite uses. QA-only; not part of the build.
// Usage: node scripts/serve-packaged.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const port = Number(process.argv[2] ?? 8799);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

async function assetResponse(request) {
  const requestUrl = new URL(request.url);
  const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  const filePath = resolve(clientRoot, relativePath);
  const containment = relative(clientRoot, filePath);

  if (
    relativePath.length === 0 ||
    containment.length === 0 ||
    containment.startsWith("..") ||
    isAbsolute(containment)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const payload = await readFile(filePath);
    return new Response(payload, {
      headers: {
        "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url).href);

const server = createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://127.0.0.1:${port}`;
    const requestUrl = new URL(incoming.url ?? "/", origin);
    const request = new Request(requestUrl, {
      headers: incoming.headers,
      method: incoming.method,
    });
    let response = await assetResponse(request);
    if (response.status === 404) {
      response = await worker.fetch(
        request,
        { ASSETS: { fetch: assetResponse } },
        { waitUntil() {}, passThroughOnException() {} },
      );
    }
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.end(error instanceof Error ? error.message : "Unknown server error");
  }
});

// Silent on purpose: the repo lint config gives *.node.mjs files no console
// global. Poll the port to detect readiness.
server.listen(port, "127.0.0.1");
