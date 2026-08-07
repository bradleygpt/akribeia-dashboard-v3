import { headers } from "next/headers";
import type { Viewport } from "next";
import { ExperienceShell } from "./experience-shell";
import { resolveMetadataProtocol } from "./metadata-origin";
import "./globals.css";

const title = "Akribeia — Quantitative Market Research";
const description =
  "Market Health and a complete core-research system for screening, comparison, security risk, sector analytics and ETF look-through—backed by visible provenance.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = resolveMetadataProtocol(host, forwardedProtocol ?? null);
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-portal.png", origin);

  return {
    metadataBase: origin,
    title,
    description,
    icons: {
      icon: { url: "/favicon.svg", type: "image/svg+xml" },
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1536,
          height: 1024,
          alt: "Akribeia quantitative market research three-sun portal",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ExperienceShell />
        {children}
      </body>
    </html>
  );
}
