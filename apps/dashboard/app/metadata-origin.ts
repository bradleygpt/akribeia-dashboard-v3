export function resolveMetadataProtocol(
  host: string,
  forwardedProtocol: string | null,
): "http" | "https" {
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol;
  }
  const hostname = (
    host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":", 1)[0]
  ).toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    ? "http"
    : "https";
}
