import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

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
  // favicon.ico and apple-icon.png are picked up from src/app by file
  // convention; only the manifest needs declaring.
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <TransientInviteProvider>{children}</TransientInviteProvider>
      </body>
    </html>
  );
}
