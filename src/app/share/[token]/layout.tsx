import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared itinerary · Trailie Crew",
  description: "A private, version-pinned Trailie Crew itinerary.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
    },
  },
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
