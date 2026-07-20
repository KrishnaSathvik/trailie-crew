import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared Plan · Trailie Crew",
  description: "A private, version-pinned Trailie Crew Plan.",
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
