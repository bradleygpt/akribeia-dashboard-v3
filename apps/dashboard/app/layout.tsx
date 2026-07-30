import { headers } from "next/headers";
import "./globals.css";

const title = "Akribeia — Quantitative Market Research";
const description =
  "Market Health, a complete quantitative security universe, and research signals backed by visible provenance and immutable publication evidence.";

export async function generateMetadata() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", origin);

  return {
    metadataBase: origin,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1733,
          height: 909,
          alt: "Akribeia quantitative market research",
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
      <body>{children}</body>
    </html>
  );
}
