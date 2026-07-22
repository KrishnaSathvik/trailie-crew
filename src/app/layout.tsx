import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { DisableMobileLayoutZoom } from "@/components/shared/disable-mobile-layout-zoom";
import { TransientInviteProvider } from "@/features/trips/components/transient-invite-provider";
import { productionApplicationUrl } from "@/server/site-configuration";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(productionApplicationUrl),
  alternates: { canonical: "/" },
  title: "Trailie Crew",
  description: "Plan trips together. Ask Trailie when you need help.",
  openGraph: {
    title: "Trailie Crew",
    description: "Plan trips together. Ask Trailie when you need help.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Trailie Crew",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trailie Crew",
    description: "Plan trips together. Ask Trailie when you need help.",
    images: ["/og.png"],
  },
  // favicon.ico and apple-icon.png are picked up from src/app by file
  // convention; only the manifest needs declaring.
  manifest: "/site.webmanifest",
};

/** Lock the mobile layout scale so pinch / double-tap zoom cannot resize the app. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <DisableMobileLayoutZoom />
        <TransientInviteProvider>{children}</TransientInviteProvider>
      </body>
    </html>
  );
}
